"""
Train a small CNN to tell methane plume patches from no-plume patches.

Input is whatever `build_dataset.py` wrote:
    {train,val,test}/{plume,no_plume}/<id>.npy   float32, shape (2, H, W)
        channel 0: CH4 enhancement in ppb (patch median already removed)
        channel 1: valid-pixel mask (1 = retrieval present)

The splits are by date, not random, so test is always weeks the model never
saw. That is the only way the reported score means anything about next week.

Usage
    pip install torch
    python backend/scripts/train.py
    python backend/scripts/train.py --epochs 40 --out backend/data/model
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.metrics import best_threshold, report  # noqa: E402

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, Dataset
except ImportError:  # pragma: no cover
    raise SystemExit("torch is required to train: pip install torch")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, default=BACKEND_ROOT / "data" / "methane")
    p.add_argument("--out", type=Path, default=BACKEND_ROOT / "data" / "model")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--patience", type=int, default=6, help="Early-stop patience, in epochs")
    return p.parse_args()


# ---------------------------------------------------------------- data

class PatchDataset(Dataset):
    """One split. Labels: 1 = plume, 0 = no plume."""

    def __init__(self, split_dir: Path, augment: bool = False):
        self.files: list[Path] = []
        self.labels: list[int] = []
        for label, name in ((1, "plume"), (0, "no_plume")):
            for f in sorted((split_dir / name).glob("*.npy")):
                self.files.append(f)
                self.labels.append(label)
        if not self.files:
            raise SystemExit(
                f"No .npy patches under {split_dir}. Run build_dataset.py first."
            )
        self.augment = augment

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, i: int):
        x = np.load(self.files[i]).astype(np.float32)

        if self.augment:
            # A plume has no canonical orientation, so flips and 90-degree
            # rotations are free label-preserving examples.
            if np.random.rand() < 0.5:
                x = x[:, ::-1, :]
            if np.random.rand() < 0.5:
                x = x[:, :, ::-1]
            x = np.rot90(x, k=int(np.random.randint(4)), axes=(1, 2))
            x = np.ascontiguousarray(x)

        return torch.from_numpy(x), torch.tensor(float(self.labels[i]))

    def pos_weight(self) -> float:
        """negatives / positives, for BCE so the rarer plume class carries weight."""
        pos = sum(self.labels)
        neg = len(self.labels) - pos
        return (neg / pos) if pos else 1.0


# ---------------------------------------------------------------- model

class PlumeCNN(nn.Module):
    """
    Deliberately small: a few thousand training patches cannot support a big
    network, and a 32x32 two-channel patch is not a hard visual problem.

    The valid-pixel mask rides along as channel 1 so the network can learn to
    distrust patches that are mostly cloud, instead of reading a gap as signal.
    """

    def __init__(self, in_ch: int = 2, width: int = 16):
        super().__init__()

        def block(cin: int, cout: int) -> nn.Sequential:
            return nn.Sequential(
                nn.Conv2d(cin, cout, 3, padding=1, bias=False),
                nn.BatchNorm2d(cout),
                nn.ReLU(inplace=True),
                nn.Conv2d(cout, cout, 3, padding=1, bias=False),
                nn.BatchNorm2d(cout),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
            )

        self.features = nn.Sequential(
            block(in_ch, width),          # 32 -> 16
            block(width, width * 2),      # 16 -> 8
            block(width * 2, width * 4),  # 8  -> 4
        )
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(width * 4, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x)).squeeze(1)  # logits


# ---------------------------------------------------------------- loops

@torch.no_grad()
def predict(model: nn.Module, loader: DataLoader, device: torch.device):
    model.eval()
    probs, trues = [], []
    for xb, yb in loader:
        p = torch.sigmoid(model(xb.to(device)))
        probs.append(p.cpu().numpy())
        trues.append(yb.numpy())
    return np.concatenate(trues), np.concatenate(probs)


def main():
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    device = torch.device(
        "cuda" if torch.cuda.is_available()
        else "mps" if torch.backends.mps.is_available()
        else "cpu"
    )

    train_ds = PatchDataset(args.data / "train", augment=True)
    val_ds = PatchDataset(args.data / "val")
    test_ds = PatchDataset(args.data / "test")
    print(f"train={len(train_ds)}  val={len(val_ds)}  test={len(test_ds)}  device={device}")

    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, drop_last=True)
    val_dl = DataLoader(val_ds, batch_size=args.batch_size)
    test_dl = DataLoader(test_ds, batch_size=args.batch_size)

    model = PlumeCNN().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    loss_fn = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor(train_ds.pos_weight(), device=device)
    )

    args.out.mkdir(parents=True, exist_ok=True)
    ckpt = args.out / "plume_cnn.pt"
    best_f1, since_best = -1.0, 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0.0
        for xb, yb in train_dl:
            opt.zero_grad()
            loss = loss_fn(model(xb.to(device)), yb.to(device))
            loss.backward()
            opt.step()
            total += loss.item() * len(xb)
        sched.step()

        # Threshold is tuned on val only; test never informs any choice.
        y_val, p_val = predict(model, val_dl, device)
        v = best_threshold(y_val, p_val)
        print(f"epoch {epoch:3d}  loss={total/len(train_ds):.4f}  val {v}")

        if v.f1 > best_f1:
            best_f1, since_best = v.f1, 0
            torch.save(
                {"state_dict": model.state_dict(), "threshold": v.threshold}, ckpt
            )
        else:
            since_best += 1
            if since_best >= args.patience:
                print(f"no val improvement in {args.patience} epochs, stopping")
                break

    # Final numbers come from the best checkpoint, at the val-chosen threshold.
    saved = torch.load(ckpt, map_location=device)
    model.load_state_dict(saved["state_dict"])
    threshold = saved["threshold"]

    y_test, p_test = predict(model, test_dl, device)
    test_report = report(y_test, p_test, threshold)
    y_val, p_val = predict(model, val_dl, device)

    metrics = {
        "threshold": float(threshold),
        "val": report(y_val, p_val, threshold),
        "test": test_report,
        "counts": {"train": len(train_ds), "val": len(val_ds), "test": len(test_ds)},
    }
    (args.out / "metrics.json").write_text(json.dumps(metrics, indent=2))

    print("\n" + "=" * 58)
    print("TEST (weeks the model never saw, threshold chosen on val)")
    print(
        f"  precision {test_report['precision']:.3f}"
        f"   recall {test_report['recall']:.3f}"
        f"   F1 {test_report['f1']:.3f}"
    )
    print(f"  average precision {test_report['average_precision']:.3f}")
    print(f"\nwrote {ckpt} and {args.out / 'metrics.json'}")


if __name__ == "__main__":
    main()

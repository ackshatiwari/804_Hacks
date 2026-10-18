"""MethaneCNN (same architecture as services/train_model.ipynb) plus loading and preprocessing."""

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "methane_cnn.pt"


class MethaneCNN(nn.Module):
    def __init__(self, in_ch=2, width=32, dropout=0.3):
        super().__init__()

        def block(i, o):
            return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(),
                                 nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(),
                                 nn.MaxPool2d(2))

        self.features = nn.Sequential(block(in_ch, width), block(width, width * 2), block(width * 2, width * 4))
        self.head = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(dropout), nn.Linear(width * 4, 1))

    def forward(self, x):
        return self.head(self.features(x)).squeeze(1)


class Detector:
    """Wraps the checkpoint: raw CH4 patches (ppb, NaN = missing) in, plume probabilities out."""

    def __init__(self, path=MODEL_PATH):
        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        self.model = MethaneCNN()
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.eval()
        self.scale = float(ckpt["scale_ppb"])
        self.threshold = float(ckpt["threshold"])
        self.patch = int(ckpt["patch"])
        self.metrics = ckpt["metrics"]

    def preprocess(self, raw):
        """(N, H, W) raw ppb -> (N, 2, H, W), matching build_dataset.py + the notebook's scaling."""
        valid = ~np.isnan(raw)
        median = np.nanmedian(raw, axis=(1, 2), keepdims=True)
        enhancement = np.where(valid, raw - median, 0.0) / self.scale
        return np.stack([np.clip(enhancement, -3, 3), valid], axis=1).astype(np.float32)

    @torch.no_grad()
    def predict(self, raw, batch_size=512):
        x = self.preprocess(raw)
        probs = [torch.sigmoid(self.model(torch.from_numpy(x[i:i + batch_size]))).numpy()
                 for i in range(0, len(x), batch_size)]
        return np.concatenate(probs) if probs else np.zeros(0, dtype=np.float32)

import { API_URL, formatDate, formatLatLon, type Plume } from "@/lib/api";

function confidenceLabel(prob: number) {
  if (prob >= 0.95) return "Very high";
  if (prob >= 0.85) return "High";
  if (prob >= 0.7) return "Moderate";
  return "Low";
}

export default function PlumeDetail({ plume, onClose }: { plume: Plume; onClose: () => void }) {
  const pct = Math.round(plume.prob * 100);

  return (
    <div className="flex max-h-full flex-col overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 p-4 text-sm shadow-xl shadow-black/60 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Plume detected</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 text-lg leading-none text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
        >
          ×
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- served by the FastAPI backend */}
      <img
        src={`${API_URL}${plume.image_url}`}
        alt={`Sentinel-5P methane around ${formatLatLon(plume.lat, plume.lon)}`}
        className="aspect-square w-full rounded-md bg-zinc-900 [image-rendering:pixelated]"
      />
      <p className="mt-1.5 text-[11px] leading-4 text-zinc-500">
        The 32×32 patch the model scored (about 250 km across). Brighter means more methane.
      </p>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500">Model confidence</span>
          <span className="font-mono text-lg font-semibold text-amber-300">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-right text-[11px] text-zinc-500">{confidenceLabel(plume.prob)}</div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-zinc-500">Location</dt>
        <dd className="text-right font-mono text-zinc-200">{formatLatLon(plume.lat, plume.lon)}</dd>
        <dt className="text-zinc-500">Observed</dt>
        <dd className="text-right text-zinc-200">{formatDate(plume.date)}</dd>
        <dt className="text-zinc-500">Peak enhancement</dt>
        <dd className="text-right font-mono text-zinc-200">+{plume.peak_ppb.toFixed(0)} ppb</dd>
      </dl>

      <div
        className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
          plume.repeat_count >= 2 ? "bg-orange-500/10 text-orange-300" : "bg-white/5 text-zinc-400"
        }`}
      >
        {plume.repeat_count >= 2
          ? `Seen on ${plume.repeat_count} days in 8 weeks`
          : "First sighting at this spot in 8 weeks"}
      </div>
      {plume.repeat_count >= 2 && (
        <p className="mt-2 text-[11px] leading-4 text-zinc-500">
          {plume.repeat_dates.map((d) => formatDate(d).replace(/, \d{4}$/, "")).join(" · ")}
        </p>
      )}
    </div>
  );
}

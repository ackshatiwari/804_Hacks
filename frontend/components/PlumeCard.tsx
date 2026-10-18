import Heatmap from "./Heatmap";

export default function PlumeCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/95 p-4 shadow-xl shadow-black/60 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Plume detected
        </span>
        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
          Example
        </span>
      </div>
      <Heatmap />
      <dl className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
        <dt className="text-zinc-500">Location</dt>
        <dd className="text-right font-mono text-zinc-200">38.42°N, 54.17°E</dd>
        <dt className="text-zinc-500">Observed</dt>
        <dd className="text-right text-zinc-200">Week of Oct 5</dd>
      </dl>
      <div className="mt-3 rounded-lg bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-300">
        Seen 4 times in 8 weeks
      </div>
    </div>
  );
}

import PlumeCard from "./PlumeCardMock";

// Decorative positions only (percent of the map frame), not real detections.
const plumes = [
  { x: 22, y: 38, size: 18, repeat: true },
  { x: 31, y: 55, size: 10, repeat: false },
  { x: 48, y: 30, size: 12, repeat: false },
  { x: 57, y: 48, size: 22, repeat: true },
  { x: 66, y: 36, size: 9, repeat: false },
  { x: 74, y: 62, size: 14, repeat: true },
  { x: 84, y: 44, size: 8, repeat: false },
];

export default function MapPreview() {
  return (
    <div className="relative">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(9_9_11)_100%)]" />

        {plumes.map((p, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md ${
                p.repeat ? "bg-orange-500/50" : "bg-amber-400/30"
              }`}
              style={{ width: p.size * 3, height: p.size * 3 }}
            />
            {p.repeat && (
              <span
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-400/40"
                style={{ width: p.size * 2.2, height: p.size * 2.2 }}
              />
            )}
            <span
              className={`relative block rounded-full ${
                p.repeat ? "bg-orange-400" : "bg-amber-300"
              }`}
              style={{ width: p.size / 2, height: p.size / 2 }}
            />
          </span>
        ))}

        <div className="absolute bottom-3 left-3 flex items-center gap-4 rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-300" /> This week
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-400 ring-2 ring-orange-400/30" />{" "}
            Repeat spot
          </span>
        </div>
      </div>

      <div className="mt-4 sm:absolute sm:-right-4 sm:top-8 sm:mt-0 sm:w-64">
        <PlumeCard />
      </div>
    </div>
  );
}

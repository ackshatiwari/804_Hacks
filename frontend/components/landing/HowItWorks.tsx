const steps = [
  {
    label: "01",
    title: "Detect",
    body: "A small CNN reads Sentinel-5P methane images and classifies each scene as plume or no plume. It's trained on SRON's weekly plume detections.",
  },
  {
    label: "02",
    title: "Map",
    body: "The latest week's plumes go on the map. Click one to see where it is, when it was observed, and a small methane heatmap of the scene.",
  },
  {
    label: "03",
    title: "Track repeats",
    body: "Detections within about 15 km of each other count as the same spot. Each plume shows how many times its spot was flagged in the last 8 weeks.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-t border-white/5">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-amber-400">
          How it works
        </h2>
        <p className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-zinc-50">
          From satellite pixels to the spots that keep coming back.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6"
            >
              <span className="font-mono text-sm text-zinc-500">{s.label}</span>
              <h3 className="mt-3 text-lg font-semibold text-zinc-100">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

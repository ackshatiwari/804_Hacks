import MapPreview from "./MapPreview";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            Updated weekly · Sentinel-5P
          </span>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
            Satellites see methane plumes every week.{" "}
            <span className="text-amber-400">
              We show where they are, and which ones keep coming back.
            </span>
          </h1>
          <p className="max-w-lg text-lg leading-8 text-zinc-400">
            A weekly hotspot map of large methane plumes picked up by satellite,
            with a running count of how often each spot has shown up over the
            last 8 weeks.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="h-12 rounded-full bg-amber-400 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-300"
            >
              View this week&apos;s map
            </button>
            <button
              type="button"
              className="h-12 rounded-full border border-white/10 px-6 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5"
            >
              How it works
            </button>
          </div>
        </div>
        <MapPreview />
      </div>
    </section>
  );
}

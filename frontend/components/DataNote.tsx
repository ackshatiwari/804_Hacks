import Link from "next/link";

export default function DataNote() {
  return (
    <section className="border-t border-white/5">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">
              A note on the data
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              The data runs about a week behind, and locations are approximate
              (roughly 7 km).
            </p>
          </div>
          <Link
            href="/map"
            className="flex h-11 shrink-0 items-center rounded-full bg-amber-400 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-300"
          >
            Explore the map
          </Link>
        </div>
      </div>
    </section>
  );
}

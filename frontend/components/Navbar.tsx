import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-40 blur-[3px]" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            Methane Watch
          </span>
        </Link>
        <div className="hidden items-center gap-8 text-sm text-zinc-400 sm:flex">
          <Link href="/map" className="transition-colors hover:text-zinc-100">Map</Link>
          <Link href="/#how" className="transition-colors hover:text-zinc-100">How it works</Link>
          <Link href="/#model" className="transition-colors hover:text-zinc-100">Model</Link>
        </div>
        <Link
          href="/map"
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:border-amber-400/50 hover:text-amber-300"
        >
          Open map
        </Link>
      </nav>
    </header>
  );
}

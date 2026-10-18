export default function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <span>Methane Watch · 804 Hacks 2026</span>
        <span>Data: Sentinel-5P TROPOMI · Labels: SRON weekly plume detections</span>
      </div>
    </footer>
  );
}

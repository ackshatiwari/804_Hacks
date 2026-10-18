const SIZE = 12;

// A static, made-up plume shape: a bright core that fades out downwind.
function intensity(row: number, col: number) {
  const dx = (col - 4.5) / 4;
  const dy = (row - 5.5) / 2.6;
  const plume = Math.exp(-(dx * dx + dy * dy - dx * 0.8));
  const noise = ((row * 7 + col * 13) % 10) / 60;
  return Math.min(1, plume * 0.9 + noise);
}

function color(v: number) {
  if (v > 0.8) return "bg-yellow-200";
  if (v > 0.6) return "bg-amber-400";
  if (v > 0.42) return "bg-orange-500";
  if (v > 0.28) return "bg-red-700";
  if (v > 0.16) return "bg-purple-900";
  return "bg-indigo-950";
}

export default function Heatmap() {
  return (
    <div
      className="grid aspect-square w-full gap-px overflow-hidden rounded-md"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const row = Math.floor(i / SIZE);
        const col = i % SIZE;
        return <span key={i} className={color(intensity(row, col))} />;
      })}
    </div>
  );
}

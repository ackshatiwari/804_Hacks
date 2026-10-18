import { REPEAT_WINDOW_WEEKS } from "@/lib/plumes";

/**
 * Eight cells, one per week, oldest left. The honest version of "keeps coming
 * back": it shows cadence, so a steady emitter looks different from one bad
 * fortnight.
 */
export function HistoryStrip({
  weeks,
  color,
  size = 9,
}: {
  weeks: number[];
  color: string;
  size?: number;
}) {
  const seen = weeks.filter((n) => n > 0).length;
  const label = `Flagged in ${seen} of the last ${REPEAT_WINDOW_WEEKS} weeks`;
  return (
    <div
      className="flex items-end gap-[3px]"
      role="img"
      aria-label={label}
      title={label}
    >
      {weeks.map((n, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 2,
            background: n > 0 ? color : "transparent",
            border: `1px solid ${n > 0 ? color : "var(--border-strong)"}`,
            opacity: n > 0 ? Math.min(1, 0.6 + n * 0.2) : 1,
          }}
        />
      ))}
    </div>
  );
}

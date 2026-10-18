import { REPEAT_WINDOW_WEEKS } from "@/lib/plumes";

/**
 * Eight cells, one per week, oldest left. A filled cell means the spot was
 * flagged that week. This is the honest version of "keeps coming back" - it
 * shows cadence, not just a total, so a steady emitter looks different from
 * one bad fortnight.
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
  const label = `${weeks.filter((n) => n > 0).length} of the last ${REPEAT_WINDOW_WEEKS} weeks`;
  return (
    <div
      className="flex items-end gap-[3px]"
      role="img"
      aria-label={`Flagged in ${label}`}
      title={`Flagged in ${label}`}
    >
      {weeks.map((n, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 1,
            background: n > 0 ? color : "transparent",
            border: `1px solid ${n > 0 ? color : "var(--haze-bright)"}`,
            opacity: n > 0 ? Math.min(1, 0.55 + n * 0.22) : 1,
          }}
        />
      ))}
    </div>
  );
}

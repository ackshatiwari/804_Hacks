"use client";

import { useEffect } from "react";

import { AiFootnote, AiProse, AiStatus } from "./AiProse";
import { useAi } from "./useAi";

/**
 * The generated read of the week. Runs on mount so a judge sees it without
 * clicking anything; everything around it is live data and stands alone if the
 * analyst is offline.
 */
export function WeeklyBrief({ compact = false }: { compact?: boolean }) {
  const ai = useAi("brief");

  useEffect(() => {
    ai.run();
    // Intentionally once on mount; the feed only changes on revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      className={compact ? "" : "card p-5"}
      aria-label="This week in brief"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow eyebrow-accent">This week in brief</span>
        {!ai.loading && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => ai.run()}
            style={{ fontSize: "var(--t-12)" }}
          >
            Regenerate
          </button>
        )}
      </div>

      <div className="mt-3">
        <AiStatus loading={ai.loading} error={ai.error} />
        {ai.text && (
          <div className="flex flex-col gap-3">
            <AiProse text={ai.text} />
            <AiFootnote />
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { AiFootnote, AiProse, AiStatus } from "./AiProse";
import { useAi } from "./useAi";

/**
 * Generated profile for one chronic spot. The dossier mode needs a plume id
 * from the current week, so it is only offered for spots still active - an
 * inactive spot has no row this week to ground the answer in.
 */
export function HotspotDossier({
  plumeId,
  label,
}: {
  plumeId: string | null;
  label: string;
}) {
  const ai = useAi("dossier");

  if (!plumeId) {
    return (
      <p style={{ fontSize: "var(--t-12)", color: "var(--text-muted)", margin: 0 }}>
        No detection this week, so there is nothing current to profile.
      </p>
    );
  }

  return (
    <div>
      {!ai.text && !ai.loading && !ai.error && (
        <button type="button" className="btn" onClick={() => ai.run({ plumeId })}>
          Build dossier
        </button>
      )}
      <AiStatus loading={ai.loading} error={ai.error} label={`Profiling ${label}`} />
      {ai.text && (
        <div className="flex flex-col gap-2">
          <AiProse text={ai.text} />
          <AiFootnote />
        </div>
      )}
    </div>
  );
}

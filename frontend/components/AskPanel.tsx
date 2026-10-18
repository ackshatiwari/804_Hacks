"use client";

import { useState } from "react";

import { AiFootnote, AiProse, AiStatus } from "./AiProse";
import { useAi } from "./useAi";

const SUGGESTIONS = [
  "Which countries had the worst emissions this week?",
  "Show me the landfills that keep reoffending.",
  "What is the biggest one-off plume, and where?",
];

/** Ask-anything over the week's feed. */
export function AskPanel({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const ai = useAi("chat");

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setAsked(text);
    ai.run({ question: text });
  };

  return (
    <aside
      className="card scroll absolute inset-x-3 bottom-3 z-[1001] max-h-[84%] overflow-y-auto p-4 sm:inset-x-auto sm:left-3 sm:w-[380px]"
      style={{ boxShadow: "var(--shadow-lg)" }}
      aria-label="Ask about this week"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow eyebrow-accent">Ask about this week</span>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. which spots got worse?"
          aria-label="Your question"
          className="min-w-0 flex-1 px-3 py-2"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-primary)",
            fontSize: "var(--t-14)",
            fontFamily: "var(--font-body)",
            outline: "none",
          }}
        />
        <button type="submit" className="btn btn-accent" disabled={ai.loading}>
          Ask
        </button>
      </form>

      {!asked && !ai.loading && (
        <div className="mt-3 flex flex-col items-start gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-quiet text-left"
              style={{ fontSize: "var(--t-12)" }}
              onClick={() => {
                setQ(s);
                ask(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        {asked && (
          <p
            style={{
              fontSize: "var(--t-13)",
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 8px",
            }}
          >
            {asked}
          </p>
        )}
        <AiStatus loading={ai.loading} error={ai.error} label="Checking the week's rows" />
        {ai.text && (
          <div className="flex flex-col gap-2">
            <AiProse text={ai.text} />
            <AiFootnote />
          </div>
        )}
      </div>
    </aside>
  );
}

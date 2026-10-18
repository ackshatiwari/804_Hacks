/**
 * Renders a generated answer. Blank-line separated paragraphs, and "Label:"
 * lines (the dossier format) get their label emphasised. No markdown parser -
 * the prompts never ask for markdown.
 */
export function AiProse({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {text
        .split(/\n{2,}|\n(?=[A-Z][a-z ]{2,18}:)/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para, i) => {
          const m = para.match(/^([A-Z][A-Za-z ]{2,18}):\s*([\s\S]*)$/);
          return (
            <p
              key={i}
              style={{
                fontSize: "var(--t-14)",
                lineHeight: 1.62,
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              {m ? (
                <>
                  <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                    {m[1]}.
                  </strong>{" "}
                  {m[2]}
                </>
              ) : (
                para
              )}
            </p>
          );
        })}
    </div>
  );
}

export function AiStatus({
  loading,
  error,
  label = "Reading this week's detections",
}: {
  loading: boolean;
  error: string;
  label?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-transparent"
          style={{
            borderTopColor: "var(--accent)",
            borderRightColor: "var(--accent)",
          }}
        />
        <span style={{ fontSize: "var(--t-13)", color: "var(--text-muted)" }}>
          {label}&hellip;
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <p
        role="status"
        style={{
          fontSize: "var(--t-13)",
          lineHeight: 1.55,
          color: "var(--text-muted)",
          margin: 0,
        }}
      >
        {error}
      </p>
    );
  }
  return null;
}

/** The provenance line that sits under every generated block. */
export function AiFootnote() {
  return (
    <p
      style={{
        fontSize: "var(--t-11)",
        color: "var(--text-muted)",
        margin: 0,
        paddingTop: 2,
      }}
    >
      Written by a language model from this week&rsquo;s detections only. Check
      the figures against the table before quoting them.
    </p>
  );
}

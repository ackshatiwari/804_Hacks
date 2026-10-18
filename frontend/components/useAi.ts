"use client";

import { useCallback, useRef, useState } from "react";

import type { AiMode } from "@/lib/ai";

type State = {
  text: string;
  error: string;
  loading: boolean;
};

/**
 * Calls /api/ai. Only ever sends a mode, a plume id and a question - the
 * figures come from the server's own copy of the feed.
 */
export function useAi(mode: AiMode) {
  const [state, setState] = useState<State>({
    text: "",
    error: "",
    loading: false,
  });
  // Guards against an earlier, slower request overwriting a newer answer.
  const seq = useRef(0);

  const run = useCallback(
    async (opts: { plumeId?: string; question?: string } = {}) => {
      const mine = ++seq.current;
      setState({ text: "", error: "", loading: true });
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, ...opts }),
        });
        const json = await res.json();
        if (mine !== seq.current) return;
        setState(
          res.ok
            ? { text: json.text ?? "", error: "", loading: false }
            : { text: "", error: json.error ?? "Something went wrong.", loading: false },
        );
      } catch {
        if (mine !== seq.current) return;
        setState({
          text: "",
          error: "Could not reach the analyst.",
          loading: false,
        });
      }
    },
    [mode],
  );

  const reset = useCallback(() => {
    seq.current++;
    setState({ text: "", error: "", loading: false });
  }, []);

  return { ...state, run, reset };
}

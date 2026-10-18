"use client";

import { useState } from "react";
import { API_URL, formatLatLon } from "@/lib/api";

export const RADIUS_OPTIONS = [25, 50, 100, 250, 500];

type Props = {
  point: [number, number] | null; // [lon, lat]
  radiusMiles: number;
  onRadiusChange: (miles: number) => void;
  onClose: () => void;
};

type Status = { kind: "idle" | "sending" } | { kind: "done" | "error"; message: string };

export default function AlertSignup({ point, radiusMiles, onRadiusChange, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!point) return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch(`${API_URL}/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lat: point[1], lon: point[0], radius_miles: radiusMiles }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Check the email address.");
      const found = body.matches
        ? `It lists the ${body.matches} plume${body.matches === 1 ? "" : "s"} from the last week.`
        : "No plumes there in the last week.";
      const where = body.delivery === "outbox" ? " (saved to the server outbox: SMTP isn't set up)" : "";
      setStatus({ kind: "done", message: `Subscribed. Welcome email sent${where}. ${found}` });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-white/5 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-200">Email alerts</span>
        <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">
          Cancel
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-zinc-500">
        Click the map to choose a spot. We&apos;ll email you when a plume is detected inside the circle.
      </p>
      <div className="mt-2 rounded-md bg-white/5 px-2 py-1.5 font-mono text-[11px] text-zinc-300">
        {point ? formatLatLon(point[1], point[0]) : "Click the map"}
      </div>
      <div className="mt-2 flex gap-2">
        <select
          value={radiusMiles}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200"
          aria-label="Radius"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r} mi
            </option>
          ))}
        </select>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
        />
      </div>
      <button
        type="submit"
        disabled={!point || status.kind === "sending"}
        className="mt-2 h-8 w-full rounded-full bg-amber-400 text-xs font-semibold text-zinc-950 transition-colors hover:bg-amber-300 disabled:opacity-50"
      >
        {status.kind === "sending" ? "Subscribing…" : "Subscribe"}
      </button>
      {(status.kind === "done" || status.kind === "error") && (
        <p
          className={`mt-2 text-[11px] leading-4 ${status.kind === "done" ? "text-emerald-300" : "text-red-300"}`}
        >
          {status.message}
        </p>
      )}
    </form>
  );
}

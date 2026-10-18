"use client";

import { useEffect, useState } from "react";
import { getJSON, type Metrics } from "@/lib/api";

const metrics = [
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
] as const;

export default function ModelStats() {
  const [data, setData] = useState<Metrics | null>(null);

  useEffect(() => {
    getJSON<Metrics>("/api/metrics").then(setData).catch(() => {});
  }, []);

  return (
    <section id="model" className="scroll-mt-16 border-t border-white/5">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-amber-400">
            The model
          </h2>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
            Measured against SRON&apos;s detections.
          </p>
          <p className="mt-4 max-w-md leading-7 text-zinc-400">
            We score the classifier on held-out weeks it never saw in training,
            so you can see how often it finds real plumes and how often it
            raises false alarms.
          </p>
        </div>
        <div>
          <div className="grid grid-cols-3 gap-4">
            {metrics.map((m) => (
              <div
                key={m.key}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-900/60 p-5"
              >
                <span className="text-xs uppercase tracking-wider text-zinc-500">
                  {m.label}
                </span>
                <span
                  className={`mt-6 font-mono text-3xl font-semibold ${data ? "text-zinc-50" : "text-zinc-600"}`}
                >
                  {data ? `${Math.round(data[m.key] * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
          {data && (
            <p className="mt-4 text-xs text-zinc-500">
              {data.n_test} test patches · ROC-AUC {data.roc_auc.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

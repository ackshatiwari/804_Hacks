import { Suspense } from "react";

import { Dashboard } from "@/components/Dashboard";
import { fetchFeed } from "@/lib/feed";

export const metadata = { title: "Live map · Methane Watch" };

async function Feed() {
  return <Dashboard feed={await fetchFeed()} />;
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-[calc(100dvh-56px)] items-center justify-center"
          style={{ fontSize: "var(--t-13)", color: "var(--text-muted)" }}
        >
          Reading the latest week of plume detections…
        </div>
      }
    >
      <Feed />
    </Suspense>
  );
}

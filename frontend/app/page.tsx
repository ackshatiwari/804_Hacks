import { Suspense } from "react";

import { Dashboard } from "@/components/Dashboard";
import { fetchFeed } from "@/lib/feed";

async function Feed() {
  const feed = await fetchFeed();
  return <Dashboard feed={feed} />;
}

function Booting() {
  return (
    <div className="u-mono flex h-dvh items-center justify-center text-[11px] text-[var(--dimmer)]">
      Reading the latest week of plume detections...
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Booting />}>
      <Feed />
    </Suspense>
  );
}

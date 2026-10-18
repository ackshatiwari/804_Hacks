import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import PlumeMap from "@/components/PlumeMap";

export const metadata: Metadata = {
  title: "Map · Methane Watch",
};

export default function MapPage() {
  return (
    <div className="flex h-dvh flex-col bg-zinc-950 font-sans text-zinc-100">
      <Navbar />
      <PlumeMap />
    </div>
  );
}

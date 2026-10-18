import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import ModelStats from "@/components/ModelStats";
import DataNote from "@/components/DataNote";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 font-sans text-zinc-100">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <ModelStats />
        <DataNote />
      </main>
      <Footer />
    </div>
  );
}

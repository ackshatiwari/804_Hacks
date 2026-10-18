import type { Metadata } from "next";
import { Figtree } from "next/font/google";

import { SiteNav } from "@/components/SiteNav";

import "./globals.css";

// One face, as Aspen does. Figtree carries real tabular figures, so data
// columns align without a second, terminal-looking monospace family.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Methane Watch",
  description:
    "Satellites see methane plumes every week. This map shows where they are and which ones keep coming back.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={figtree.variable}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}

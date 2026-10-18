"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/map", label: "Live map" },
  { href: "/hotspots", label: "Hotspots" },
  { href: "/method", label: "Model & method" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-[2000] border-b"
      style={{
        borderColor: "var(--border)",
        background: "rgba(10,10,10,0.86)",
        backdropFilter: "blur(10px)",
      }}
    >
      <nav className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-5">
        <Link
          href="/"
          className="heading shrink-0 no-underline"
          style={{ fontSize: "var(--t-16)", color: "var(--text-primary)" }}
        >
          Methane&nbsp;Watch
        </Link>

        <div className="scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className="shrink-0 rounded-[var(--radius-btn)] px-3 py-1.5 no-underline transition-colors"
                style={{
                  fontSize: "var(--t-13)",
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <a
          href="https://github.com/ackshatiwari/804_Hacks"
          target="_blank"
          rel="noreferrer"
          className="btn btn-quiet shrink-0 no-underline max-sm:hidden"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}

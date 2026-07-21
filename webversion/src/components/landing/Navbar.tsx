import { useEffect, useState } from "react";
import { Moon, Sun, Menu, X } from "lucide-react";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#community", label: "Community" },
  { href: "/documentation-mcp", label: "MCP" },
];

export function Navbar() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl border-2 border-foreground/10 px-4 py-3 shadow-soft">
        <a href="#top" className="flex items-center gap-2 font-display text-lg font-bold">
          <img src="/appIcon.png" alt="Pikadecks logo" className="h-8 w-8 rounded-lg" width={32} height={32} />
          <span>Pikadecks</span>
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDark((v) => !v)}
            aria-label="Toggle theme"
            className="rounded-full border-2 border-foreground/10 bg-background p-2 transition-colors hover:bg-muted"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <a href="https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks" target="_blank" rel="noopener noreferrer" className="hidden md:inline-flex btn-pop rounded-xl border-2 border-foreground/10 bg-background px-4 py-2 text-sm font-bold text-foreground hover:bg-muted">
            Download App
          </a>
          <a href="/login" className="hidden md:inline-flex btn-pop rounded-xl bg-brand-yellow px-4 py-2 text-sm font-bold text-brand-ink">
            Get Started
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            className="rounded-full border-2 border-foreground/10 bg-background p-2 md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="glass mx-auto mt-2 max-w-6xl rounded-2xl border-2 border-foreground/10 p-4 shadow-soft md:hidden">
          <ul className="flex flex-col gap-3">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href="https://play.google.com/store/apps/details?id=com.nameisrk.pikadecks" target="_blank" rel="noopener noreferrer" className="btn-pop block rounded-xl border-2 border-foreground/10 bg-background px-4 py-2 text-center text-sm font-bold text-foreground hover:bg-muted">
                Download App
              </a>
            </li>
            <li>
              <a href="/login" className="btn-pop block rounded-xl bg-brand-yellow px-4 py-2 text-center text-sm font-bold text-brand-ink">
                Get Started Free
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

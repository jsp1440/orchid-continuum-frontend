import { Link } from "react-router-dom";
import CalyxWorkspace from "./CalyxWorkspace";

const shortcuts = [
  { label: "Mission", href: "/mission-control" },
  { label: "Atlas", href: "/atlas-next" },
  { label: "Graph", href: "/intelligence-graph" },
  { label: "Science", href: "/calyx-science" },
];

export default function CalyxMobile() {
  return (
    <div className="min-h-[100dvh] bg-[#050a08] text-white">
      <header className="sticky top-0 z-40 overflow-hidden border-b border-emerald-200/10 bg-[#07110d]/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true">
          <div className="absolute left-1/2 top-[-5rem] h-44 w-44 -translate-x-1/2 rounded-full bg-emerald-300/10 blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-5xl items-center gap-3">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-200/20 bg-emerald-200/5 shadow-[0_0_40px_rgba(52,211,153,0.12)]">
            <span className="absolute h-9 w-9 animate-ping rounded-full border border-emerald-300/20" aria-hidden="true" />
            <span className="absolute h-6 w-6 animate-pulse rounded-full bg-emerald-300/15 blur-sm" aria-hidden="true" />
            <img src="/calyx-icon.svg" alt="Calyx" className="relative h-10 w-10 rounded-xl" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-semibold tracking-wide">CALYX</h1>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-100/80">
                voice + visual
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-white/55">
              Direct Orchid Continuum intelligence
            </p>
          </div>

          <div className="hidden items-center gap-1 sm:flex" aria-label="Calyx presence indicator">
            {[0, 1, 2, 3, 4].map((bar) => (
              <span
                key={bar}
                className="w-1 animate-pulse rounded-full bg-emerald-300/70"
                style={{ height: `${10 + ((bar % 3) * 7)}px`, animationDelay: `${bar * 120}ms` }}
              />
            ))}
          </div>
        </div>

        <nav className="relative mx-auto mt-3 flex max-w-5xl gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Calyx quick destinations">
          {shortcuts.map((shortcut) => (
            <Link
              key={shortcut.href}
              to={shortcut.href}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition hover:border-emerald-200/30 hover:bg-emerald-200/10 hover:text-white"
            >
              {shortcut.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-300/[0.035] to-transparent" aria-hidden="true" />
        <CalyxWorkspace />
      </main>
    </div>
  );
}

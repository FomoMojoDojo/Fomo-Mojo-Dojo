import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { home } from "@/data/home";
import { STEPS, type StepSlug } from "@/data/diagnose";

export const toneBg = { base: "bg-tone-base", goal: "bg-tone-goal", market: "bg-tone-market" } as const;
export const toneInk = { base: "bg-tone-base-ink", goal: "bg-tone-goal-ink", market: "bg-tone-market-ink" } as const;
export const toneText = { base: "text-tone-base-ink", goal: "text-tone-goal-ink", market: "text-tone-market-ink" } as const;

export function Dot() {
  return <span className="text-dot">.</span>;
}

export function Shell({ step, children }: { step: StepSlug; children: ReactNode }) {
  const i = STEPS.findIndex((s) => s.slug === step);
  const cur = STEPS[i]!;
  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];
  return (
    <div className="flex min-h-screen min-w-[1100px] flex-col bg-paper">
      <header className="flex items-center gap-6 px-10 pt-6">
        <div className="text-[15px]">
          <Link to="/" className="font-bold hover:underline">MojoMap</Link>
          <span className="px-2 text-muted-foreground">/</span>{home.client}
          <span className="px-2 text-muted-foreground">/</span>
          <span className="rounded-full bg-phase-diagnose px-3 py-1 text-[13px] font-medium">Diagnose · {cur.label}</span>
        </div>
        <nav aria-label="Diagnose steps" className="ml-auto flex items-center gap-1.5">
          {STEPS.map((s, k) => (
            <Link key={s.slug} to="/diagnose/$step" params={{ step: s.slug }} title={s.label}
              className={`h-2 rounded-full transition-all ${k === i ? `w-8 ${toneInk[s.tone]}` : k < i ? "w-4 bg-foreground/50" : "w-4 bg-track hover:bg-foreground/30"}`} />
          ))}
          <span className="label ml-2 text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")} / {STEPS.length}</span>
        </nav>
      </header>

      <main key={step} className="screen-in flex-1 px-10 pb-10 pt-8">{children}</main>

      <footer className="sticky bottom-0 flex items-center gap-2 border-t border-foreground/10 bg-paper/95 px-10 py-3 backdrop-blur">
        <Link to="/" className="min-h-11 rounded-full px-4 py-3 text-[14px] font-medium hover:bg-track">← Your map</Link>
        {prev && (
          <Link to="/diagnose/$step" params={{ step: prev.slug }} className="min-h-11 rounded-full px-4 py-3 text-[14px] font-medium hover:bg-track">‹ {prev.label}</Link>
        )}
        <div className="ml-auto flex items-center gap-4 self-stretch rounded-xl bg-surface px-5 shadow-soft">
          <span className="label text-[10px] text-muted-foreground">MojoScore</span>
          <span className="font-display text-[34px] font-bold leading-none">{home.scoreNow}<Dot /></span>
          <span className="text-xs text-muted-foreground">was <s>{home.scoreFirst}</s> · goal <b className="text-foreground">{home.goal}</b></span>
        </div>
        {next ? (
          <Link to="/diagnose/$step" params={{ step: next.slug }} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[14px] font-medium text-background transition-transform hover:-translate-y-0.5">
            {next.label} →
          </Link>
        ) : (
          <Link to="/" className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-[14px] font-medium text-background">Back to your map →</Link>
        )}
      </footer>
    </div>
  );
}

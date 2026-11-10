import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { home } from "@/data/home";

const TONES = [
  { bg: "bg-tone-base", dot: "bg-tone-base-ink", bar: "bg-tone-base-ink" },
  { bg: "bg-tone-goal", dot: "bg-tone-goal-ink", bar: "bg-tone-goal-ink" },
  { bg: "bg-tone-market", dot: "bg-tone-market-ink", bar: "bg-tone-market-ink" },
];

export function CardStack() {
  const cards = home.cards;
  const [i, setI] = useState(0);
  const go = (d: number) => setI((v) => (v + d + cards.length) % cards.length);

  return (
    <div className="relative h-[470px] w-[520px]">
      {cards.map((c, k) => {
        const pos = (k - i + cards.length) % cards.length;
        const style = {
          transform: `translate(${pos * 14}px, ${pos * 14}px) rotate(${pos * 1.6}deg) scale(${1 - pos * 0.03})`,
          zIndex: cards.length - pos,
          opacity: pos > 2 ? 0 : 1,
        };
        const t = TONES[k % TONES.length]!;
        return (
          <article
            key={c.kicker}
            style={style}
            aria-hidden={pos !== 0}
            className={`absolute inset-0 flex flex-col gap-4 rounded-2xl border border-foreground/10 ${t.bg} p-7 shadow-soft transition-all duration-500 [transition-timing-function:cubic-bezier(.34,1.4,.5,1)]`}
          >
            <div className="flex items-center justify-between">
              <span className="label inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1.5 text-[10px]">
                <i className={`h-2 w-2 rounded-full ${t.dot}`} /> {c.kicker}
              </span>
              <span className="label text-[10px] text-muted-foreground">{k + 1} of {cards.length}</span>
            </div>
            <h3 className="font-display text-[32px] font-bold leading-[1.05] tracking-tight">
              {c.line}<span className="text-dot">.</span>
            </h3>
            <p className="text-[16px] leading-relaxed text-muted-foreground">{c.why}</p>
            {"bars" in c && c.bars && (
              <div className="flex flex-col gap-2.5">
                {c.bars.map((b) => (
                  <div key={b.label} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-sm">
                    <span className="font-medium">{b.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface/70">
                      <span className={`block h-full rounded-full ${t.bar} transition-all duration-700`} style={{ width: pos === 0 ? `${b.value}%` : 0 }} />
                    </span>
                    <span className="text-xs text-muted-foreground">{b.note}</span>
                  </div>
                ))}
              </div>
            )}
            {"outcomes" in c && c.outcomes && (
              <div className="flex flex-col gap-2.5">
                {c.outcomes.map((o) => (
                  <div key={o.label} className="flex items-center gap-3 text-[17px] font-semibold">
                    <i className={`h-4 w-4 rounded-full border-2 border-foreground ${o.state === "part" ? "bg-[linear-gradient(90deg,var(--kind-echoed)_50%,transparent_50%)]" : ""}`} />
                    {o.label}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto flex items-center justify-between">
              <Link to="/diagnose/$step" params={{ step: (["base", "goal", "market"] as const)[k % 3]! }} tabIndex={pos === 0 ? 0 : -1}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-medium text-background transition-transform hover:-translate-y-0.5">
                {c.cta} →
              </Link>
              <div className="flex gap-2">
                <button aria-label="Previous card" onClick={() => go(-1)} className="h-11 w-11 rounded-full border border-foreground/30 text-lg transition-colors hover:bg-foreground hover:text-background">‹</button>
                <button aria-label="Next card" onClick={() => go(1)} className="h-11 w-11 rounded-full border border-foreground/30 text-lg transition-colors hover:bg-foreground hover:text-background">›</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

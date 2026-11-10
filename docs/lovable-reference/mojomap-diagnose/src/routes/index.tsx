import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { home } from "@/data/home";
import type { StepSlug } from "@/data/diagnose";
import { CardStack } from "@/components/home/CardStack";
import { FutureCone } from "@/components/home/FutureCone";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Your map · Edgewood · MojoMap" },
      { name: "description", content: "Where Edgewood has been, what to do today, and the futures ahead — your living MojoMap." },
      { property: "og:title", content: "Your map · Edgewood · MojoMap" },
      { property: "og:description", content: "Where you were, what to do today, and where you are going." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const SEE_ALL_STEP: Record<string, StepSlug> = {
  "Your base": "base", "Voices": "base", "Problem · goal · market, reframed": "reframe",
  "Your goal": "goal", "Your market": "market", "Their needs": "needs", "Your documents": "send",
  "How MojoMap works": "welcome",
};

const PAST_W = 760, TODAY_W = 1120;
type Spot = "past" | "today" | "future";

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Home() {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [progress, setProgress] = useState({ left: 0, width: 0.3 });
  const [spot, setSpot] = useState<Spot>("today");
  const [seeAll, setSeeAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const score = useCountUp(home.scoreNow);

  const go = useCallback((s: Spot, smooth = true) => {
    const el = ref.current; if (!el) return;
    const target = s === "past" ? 0 : s === "today" ? PAST_W + TODAY_W / 2 - el.clientWidth / 2 : el.scrollWidth;
    el.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => { go("today", false); }, [go]);

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    setProgress({ left: el.scrollLeft / el.scrollWidth, width: el.clientWidth / el.scrollWidth });
    const mid = el.scrollLeft + el.clientWidth / 2;
    setSpot(mid < PAST_W ? "past" : mid < PAST_W + TODAY_W ? "today" : "future");
  };

  return (
    <div className="flex h-screen min-h-[820px] min-w-[1280px] flex-col overflow-hidden bg-paper">
      {/* top */}
      <header className="flex items-center gap-6 px-10 pt-6">
        <div className="text-[15px]">
          <span className="font-bold">MojoMap</span>
          <span className="px-2 text-muted-foreground">/</span>{home.client}
          <span className="px-2 text-muted-foreground">/</span>
          <span className="rounded-full bg-phase-diagnose px-3 py-1 text-[13px] font-medium">Diagnose · day {home.day} of about {home.days}</span>
        </div>
        <Link to="/diagnose/$step" params={{ step: "welcome" }} className="ml-auto text-[14px] font-medium underline-offset-4 hover:underline">Walk through Diagnose →</Link>
        <Link to="/first-read" className=" text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Revisit your First Read</Link>
      </header>

      <div className="flex items-end justify-between px-10 pt-10">
        <div>
          <h1 className="font-display text-[44px] font-bold leading-none tracking-tight">
            Good morning, {home.client}<span className="text-dot">.</span>
          </h1>
          <p className="mt-2 text-[18px] text-muted-foreground">Here's where you've been, what to do today, and the futures ahead.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-surface p-1 shadow-soft">
          {(["past", "today", "future"] as Spot[]).map((s) => (
            <button key={s} onClick={() => go(s)}
              className={`min-h-10 rounded-full px-5 text-[14px] font-medium transition-colors ${spot === s ? "bg-foreground text-background" : "hover:bg-track"}`}>
              {s === "past" ? "← Where you were" : s === "today" ? "Today" : "Where you're going →"}
            </button>
          ))}
        </div>
      </div>

      {/* canvas */}
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button,a")) return; drag.current = { x: e.clientX, left: ref.current!.scrollLeft }; }}
        onPointerMove={(e) => { if (drag.current && ref.current) ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x); }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
        className="mt-10 min-h-0 flex-1 cursor-grab select-none overflow-x-auto overflow-y-hidden active:cursor-grabbing [scrollbar-width:none]"
      >
        <div className="flex h-full w-max items-start bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_12%,transparent)_1px,transparent_1px)] [background-size:28px_28px]">
          {/* past */}
          <section style={{ width: PAST_W }} className="flex shrink-0 flex-col self-stretch pb-10 pt-6">
            <div className="label px-10 text-[10px] text-muted-foreground">Where you were</div>
            <div className="relative mt-4 flex-1"><div className="absolute inset-x-0 top-[calc(50%-170px)]"><div className="relative h-[330px]">
              {/* time line leading into today */}
              <div className="absolute left-[70px] right-0 top-[170px] h-px bg-foreground/40" />
              <div className="absolute left-[150px] top-[160px] h-5 w-3 -skew-x-12 border-x-2 border-foreground/50 bg-paper" title="Time skipped" />
              {home.past.map((p, k) => {
                const up = k % 2 === 1;
                return (
                  <div key={p.title} className="rise absolute" style={{ left: p.x, top: 0, height: "100%", animationDelay: `${k * 120}ms` }}>
                    <span className={`absolute left-0 top-[170px] h-0 border-l border-dashed border-foreground/40 ${up ? "-translate-y-full" : ""}`} style={{ height: up ? 80 : 52 }} />
                    <span className={`absolute -left-[9px] top-[161px] h-[18px] w-[18px] rounded-full border-2 border-foreground ${p.dropped ? "border-dashed bg-paper" : "bg-surface"}`} />
                    <div className={`absolute -left-4 w-[190px] rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft ${p.dropped ? "border border-dashed border-foreground/30 bg-transparent opacity-70" : "border border-foreground/10 bg-recess shadow-[inset_0_1px_2px_rgba(60,50,30,0.10)]"} ${up ? "top-[30px]" : "top-[222px]"}`}>
                      <div className="label text-[10px] text-muted-foreground">{p.date}</div>
                      <div className={`text-[16px] font-semibold leading-tight ${p.dropped ? "line-through decoration-foreground/40" : ""}`}>{p.title}</div>
                      {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mx-10 mt-2 max-w-[560px] rounded-2xl border border-foreground/10 bg-recess p-5 shadow-[inset_0_1px_2px_rgba(60,50,30,0.10)]">
              <div className="label text-[10px] text-muted-foreground">What it settled</div>
              <ul className="mt-3 space-y-1.5 text-[16px]">
                {home.settled.map((s) => <li key={s}>· {s}</li>)}
              </ul>
              <div className="mt-4 text-sm text-muted-foreground">Score: {home.scoreFirst} at the First Read · {home.scoreNow} after your documents</div>
            </div>
          </div></div>
          </section>

          {/* today */}
          <section style={{ width: TODAY_W }} className="relative flex shrink-0 flex-col self-stretch px-20 pb-10 pt-6">
            {/* the time line runs straight through today */}
                        <div className="label relative text-[10px]"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-dot" />Today · day {home.day} · you are here</div>
            <div className="relative mt-4 flex-1">
            <div data-timeline className="absolute -left-20 -right-20 top-1/2 h-px bg-foreground/40" />
            <div className="relative -ml-10 -mr-20 h-full items-center grid grid-cols-[560px_1fr] gap-20 rounded-[32px] bg-[color-mix(in_oklab,var(--paper)_97%,var(--foreground))] px-10 pb-16 pt-10 shadow-[inset_0_2px_6px_rgba(60,50,30,0.07),inset_0_14px_32px_-20px_rgba(60,50,30,0.12)]">
              <div>
                <p className="mb-5 inline-block rounded-full text-[17px] font-medium">Here's what to do today.</p>
                <CardStack />
              </div>
              <div className="relative">
                <p className="mb-5 inline-block text-[17px] font-medium">In focus right now</p>
                <ul className="relative flex flex-col gap-2.5">
                  {home.focus.map((f, k) => (
                    <li key={f.title} style={{ animationDelay: `${k * 70}ms` }}
                      className={`rise relative rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                        f.state === "you" ? "bg-evidence shadow-soft" : f.state === "on" ? "bg-surface shadow-soft" : "border border-dashed border-foreground/30 bg-paper"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[16px] font-semibold">{f.title}</span>
                        {f.state === "you" && <span className="label rounded-full bg-foreground px-2 py-0.5 text-[9px] text-background">Needs you</span>}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{f.meta}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </div>
          </section>

          {/* future */}
          <section className="relative flex shrink-0 flex-col self-stretch pb-4 pr-10 pt-6">
            <div className="label text-[10px] text-muted-foreground">Where you're going</div>
            <div className="min-h-0 flex-1"><FutureCone /></div>
          </section>
        </div>
      </div>

      {/* scrubber */}
      <div className="relative mx-10 h-7 cursor-pointer"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const el = ref.current!; el.scrollTo({ left: ((e.clientX - r.left) / r.width) * el.scrollWidth - el.clientWidth / 2, behavior: "smooth" }); }}>
        <div className="absolute inset-x-0 top-[13px] h-0.5 rounded-full bg-track" />
        <div className="absolute top-2 h-3 rounded-full bg-foreground/80 transition-[left] duration-100" style={{ left: `${progress.left * 100}%`, width: `${progress.width * 100}%` }} />
        {[["Sep", 2], ["Today", 38], ["Focus", 62], ["Flow", 80], ["2028", 95]].map(([t, x]) => (
          <span key={t} className="label absolute -top-2 -translate-x-1/2 text-[9px] text-muted-foreground" style={{ left: `${x}%` }}>{t}</span>
        ))}
      </div>

      {/* bottom bar */}
      <footer className="flex items-center gap-2 border-t border-foreground/10 px-10 py-4">
        <button onClick={() => setSeeAll(true)} className="min-h-11 rounded-full px-4 text-[14px] font-medium hover:bg-track">☰ See all</button>
        <button onClick={() => go("today")} className="min-h-11 rounded-full px-4 text-[14px] font-medium hover:bg-track">Now</button>
        <button className="min-h-11 rounded-full px-4 text-[14px] font-medium hover:bg-track">Dojo</button>
        <div className="relative ml-2">
          <button onClick={() => setAddOpen((v) => !v)} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-foreground py-1 pl-1.5 pr-4 text-[14px] font-medium">
            <i className={`flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-lg not-italic text-background transition-transform ${addOpen ? "rotate-45" : ""}`}>+</i> Add
          </button>
          {addOpen && (
            <div className="rise absolute bottom-14 left-0 z-30 flex w-[340px] flex-col gap-2 rounded-2xl bg-foreground p-4 text-background shadow-lift">
              <div className="label text-[10px] text-dot">Add to your map</div>
              {home.add.map((a) => (
                <button key={a.t} onClick={() => setAddOpen(false)} className="rounded-xl border border-background/20 p-3 text-left hover:bg-background/10">
                  <div className="font-semibold">{a.t}</div>
                  <div className="text-xs opacity-70">{a.d}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="-my-4 ml-auto flex items-center gap-5 self-stretch border-x border-foreground/10 bg-surface px-7 py-3">
          <div className="flex flex-col justify-center">
            <span className="label text-[10px] text-muted-foreground">MojoScore</span>
            <span className="font-display text-[56px] font-bold leading-[0.9] tracking-tight">{score}<span className="text-dot">.</span></span>
          </div>
          <div className="flex w-44 flex-col gap-2">
            <div className="relative h-2.5 rounded-full bg-track">
              <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/25" style={{ width: `${home.scoreFirst}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${score}%` }} />
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-kind-disputed" style={{ left: `${home.goal}%` }} title={`Your goal · ${home.goal}`} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>was <span className="line-through">{home.scoreFirst}</span></span>
              <span>goal <b className="text-foreground">{home.goal}</b></span>
            </div>
          </div>
        </div>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-5 text-[14px] font-medium shadow-soft hover:shadow-lift">
          What changed <span className="flex h-6 w-6 items-center justify-center rounded-full bg-kind-disputed text-xs font-bold">{home.whatChanged}</span>
        </button>
      </footer>

      {seeAll && (
        <div className="screen-in fixed inset-0 z-50 overflow-auto bg-foreground/95 px-12 py-10 text-background">
          <button aria-label="Close" onClick={() => setSeeAll(false)} className="absolute right-8 top-6 h-11 w-11 rounded-full text-3xl hover:bg-background/10">×</button>
          <h2 className="font-display text-[40px] font-bold">Open anything to see it or work on it<span className="text-dot">.</span></h2>
          <div className="mt-8 grid grid-cols-4 gap-6">
            {home.seeAll.map((g) => (
              <div key={g.group} className="flex flex-col gap-3">
                <div className="label border-b border-background/30 pb-2 text-[10px] opacity-60">{g.group}</div>
                {g.items.map((it) => {
                  const cls = `flex min-h-24 flex-col gap-1 rounded-xl border p-4 text-left transition-colors hover:bg-background/10 ${"now" in it && it.now ? "border-2 border-dot bg-dot/15" : "border-background/30"}`;
                  const body = (<><b className="text-[17px]">{it.t}</b><span className="text-[13px] opacity-75">{it.d}</span><em className="label mt-auto text-[10px] not-italic text-dot">{it.m}</em></>);
                  const step = SEE_ALL_STEP[it.t];
                  return step
                    ? <Link key={it.t} to="/diagnose/$step" params={{ step }} className={cls}>{body}</Link>
                    : <button key={it.t} onClick={() => setSeeAll(false)} className={cls}>{body}</button>;
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

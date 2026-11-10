import { Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { diagnose as d, type StepSlug, type Tone } from "@/data/diagnose";
import { Dot, toneBg, toneInk, toneText } from "./Shell";

// Hierarchy rule: one big statement per screen, supporting text in muted type,
// hairlines instead of boxes. Boxes only for things you can grab, drop or rearrange.
const pill = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium transition-all";
const pillDark = `${pill} bg-foreground text-background hover:-translate-y-0.5`;
const pillLine = `${pill} border border-foreground/30 hover:bg-foreground hover:text-background`;
const eyebrow = "label text-[10px] text-muted-foreground";

function H({ kicker, children, lede, side }: { kicker: string; children: ReactNode; lede?: string; side?: ReactNode }) {
  return (
    <div className="mb-14 flex items-end justify-between gap-10">
      <div className="max-w-[880px]">
        <div className={eyebrow}>{kicker}</div>
        <h1 className="mt-3 font-display text-[52px] font-bold leading-[1.02] tracking-tight">{children}<Dot /></h1>
        {lede && <p className="mt-5 max-w-[680px] text-[18px] leading-relaxed text-muted-foreground">{lede}</p>}
      </div>
      {side}
    </div>
  );
}

function Segmented<T extends string>({ items, value, onChange }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 gap-1 rounded-full bg-track/60 p-1">
      {items.map((x) => (
        <button key={x.id} onClick={() => onChange(x.id)}
          className={`min-h-10 rounded-full px-5 text-[14px] font-medium transition-all ${value === x.id ? "bg-surface shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
          {x.label}
        </button>
      ))}
    </div>
  );
}

export function StepView({ step }: { step: StepSlug }) {
  switch (step) {
    case "send": return <Send />;
    case "welcome": return <Welcome />;
    case "base": return <Base />;
    case "goal": return <Goal />;
    case "reframe": return <Reframe />;
    case "market": return <Market />;
    case "needs": return <Needs />;
    case "mojomap": return <MojoMap />;
  }
}

/* 0 · Send what you have — the drop zone is the one box: it's where things land. */
function Send() {
  const [files, setFiles] = useState<string[]>(d.sentFiles);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => list && setFiles((f) => [...Array.from(list).map((x) => x.name), ...f]);
  return (
    <div className="mx-auto max-w-[980px]">
      <H kicker="Diagnose · step one" lede={`The First Read is how the world sees ${d.client} from outside. Your plans, numbers and decks add the inside, so the first visit is spent comparing, not collecting.`}>
        Send what {d.client} already has
      </H>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[28px] border-2 border-dashed py-16 transition-all ${over ? "scale-[1.01] border-tone-base-ink bg-tone-base" : "border-foreground/25 hover:border-foreground/50"}`}
      >
        <div className="font-display text-[28px] font-bold">{over ? "Let go to add" : "Drop files here"}</div>
        <p className="text-muted-foreground">or click to choose · any format, as many as there are</p>
        <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      <div className="mt-10 flex items-baseline justify-between">
        <span className="font-display text-[22px] font-bold">{files.length} in</span>
        <span className="text-sm text-muted-foreground">On the map before [DATE] · nothing leaves</span>
      </div>
      <ul className="mt-3 divide-y divide-foreground/10 border-y border-foreground/10">
        {files.map((f, k) => (
          <li key={f + k} className="rise flex items-center justify-between py-3.5">
            <span>{f}</span>
            <span className="flex items-center gap-2 text-sm text-tone-base-ink"><i className="h-2 w-2 rounded-full bg-tone-base-ink" />Received</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">Rather email? <span className="font-mono text-foreground">[{d.email}]</span></p>
    </div>
  );
}

/* 1 · Welcome — the three outcomes are three empty rings on a line: the map that fills in. */
function Welcome() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="Welcome to Diagnose · your documents are in" lede={`The First Read only sees what's visible. Your documents say what ${d.client} is actually doing. This visit puts the two together.`}>
        Now the inside view sits beside the world's
      </H>
      <div className={eyebrow}>By the end of Diagnose you hold three things</div>
      <div className="relative mt-8 grid grid-cols-3 gap-10">
        <div className="absolute left-12 right-[calc(33%-48px)] top-12 h-px bg-foreground/25" />
        {d.welcome.three.map((t, k) => (
          <div key={t.t} className="rise relative" style={{ animationDelay: `${k * 120}ms` }}>
            <div className={`flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-foreground/35 bg-paper`}>
              <span className={`h-3 w-3 rounded-full ${toneInk[t.tone]}`} />
            </div>
            <div className="mt-6 font-display text-[24px] font-bold leading-tight">{t.t}</div>
            <p className="mt-2 leading-relaxed text-muted-foreground">{t.d}</p>
          </div>
        ))}
      </div>
      <p className="mt-16 border-t border-foreground/10 pt-6 text-[18px]">
        <b>Eight short screens. Nothing to solve today.</b>{" "}
        <span className="text-muted-foreground">Each is prefilled from your documents. Confirm, fix, or add.</span>
      </p>
    </div>
  );
}

/* 10 · Base — each part is a track: the world's dot and yours. The gap between them is the story. */
const BASE_GAP: Record<string, number> = { agreed: 0, split: 45, outside: 80, none: 100 };
function Base() {
  const [open, setOpen] = useState("Positioning");
  const [closed, setClosed] = useState<Record<string, boolean>>({ Strategy: true });
  const solid = d.base.filter((r) => closed[r.name]).length;
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="Your base · what everything stands on" lede="The world's read and yours, on one line. Where the two dots meet, the base is solid."
        side={<div className="text-right"><div className="font-display text-[64px] font-bold leading-none">{solid}<span className="text-muted-foreground">/4</span></div><div className={eyebrow}>solid</div></div>}>
        Solidify your base
      </H>
      <div className="mb-3 grid grid-cols-[220px_1fr_160px] gap-8 text-sm text-muted-foreground">
        <span /><span className="flex justify-between"><span>● The world sees</span><span>○ You say</span></span><span />
      </div>
      <ul className="border-t border-foreground/10">
        {d.base.map((r) => {
          const done = closed[r.name];
          const gap = done ? 0 : BASE_GAP[r.state] ?? 0;
          const isOpen = open === r.name;
          return (
            <li key={r.name} className="border-b border-foreground/10">
              <button onClick={() => setOpen(isOpen ? "" : r.name)} className="grid w-full grid-cols-[220px_1fr_160px] items-center gap-8 py-6 text-left">
                <span>
                  <span className="block font-display text-[24px] font-bold">{r.name}</span>
                  <span className="text-sm text-muted-foreground">{r.sub}</span>
                </span>
                <span className="relative h-6">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
                  <span className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-all duration-700 ${done ? "bg-tone-base-ink" : "bg-kind-disputed/60"}`} style={{ left: "20%", width: `${gap * 0.6}%` }} />
                  <span className="absolute left-[20%] top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
                  <span className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground transition-all duration-700 ${done ? "bg-tone-base-ink" : "bg-paper"} ${r.state === "none" && !done ? "border-dashed" : ""}`} style={{ left: `${20 + gap * 0.6}%` }} />
                </span>
                <span className={`text-right text-sm font-medium ${done ? "text-tone-base-ink" : ""}`}>{done ? "✓ Solid" : r.status}</span>
              </button>
              <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] pb-8" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="ml-[252px] grid grid-cols-2 gap-10">
                    <div><div className={eyebrow}>As the world sees it</div><p className="mt-2 text-[17px]">{r.world}</p></div>
                    <div><div className={eyebrow}>As you say it</div><p className="mt-2 text-[17px]">{r.you}</p></div>
                  </div>
                  <div className="ml-[252px] mt-5">
                    {r.name === "Market" ? (
                      <Link to="/diagnose/$step" params={{ step: "market" }} className={pillLine}>{r.action} →</Link>
                    ) : (
                      <button onClick={() => setClosed((c) => ({ ...c, [r.name]: !c[r.name] }))} className={done ? pillLine : pillDark}>
                        {done ? "Undo" : r.state === "agreed" ? "Confirm" : "Agree on one wording"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* 12 · Goal — a single path: what you came with, three moves, two endings. */
function Goal() {
  const g = d.goal;
  const moves = [
    { n: "Sharpen it", items: g.sharpen },
    { n: "Split “donors”", items: [g.split] },
    { n: "Raise challengers, only from evidence", items: g.challengers, dashed: true },
  ];
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="Your goal and market · outcome 2 of 3">You came with a focus. It gets tested, not replaced</H>
      <div className="grid grid-cols-[280px_1fr] gap-16">
        <div className="sticky top-8 self-start">
          <div className={eyebrow}>What you came with</div>
          {g.came.map((c) => (
            <div key={c.k} className="mt-5">
              <div className="text-sm text-tone-goal-ink">{c.k}</div>
              <div className="font-display text-[30px] font-bold leading-tight">{c.v}</div>
            </div>
          ))}
        </div>
        <ol className="relative border-l-2 border-foreground/15 pl-10">
          {moves.map((m, k) => (
            <li key={m.n} className="relative pb-10">
              <span className="absolute -left-[53px] flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">{k + 1}</span>
              <div className="font-display text-[22px] font-bold">{m.n}</div>
              <div className="mt-3 flex flex-col gap-3">
                {m.items.map((s) => (
                  <div key={s.t} className={m.dashed ? "rounded-xl border border-dashed border-foreground/30 px-4 py-3" : ""}>
                    <div className="font-semibold">{s.t}</div>
                    <div className="text-muted-foreground">{s.d}</div>
                  </div>
                ))}
              </div>
            </li>
          ))}
          <li className="relative">
            <span className="absolute -left-[51px] h-5 w-5 rounded-full border-2 border-foreground bg-paper" />
            <div className="font-display text-[22px] font-bold">How it can end</div>
            <div className="mt-3 grid grid-cols-2 gap-8">
              {g.endings.map((e) => (
                <div key={e.t}>
                  <div className={`font-semibold ${e.likely ? "" : "text-muted-foreground"}`}>{e.t}</div>
                  <div className="text-muted-foreground">{e.d}</div>
                </div>
              ))}
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}

/* 12c · Reframe — before shrinks, after grows. One sentence is the hero. */
type Choice = "use" | "mine" | "edit";
function Reframe() {
  const [tab, setTab] = useState("0");
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [why, setWhy] = useState(false);
  const i = Number(tab);
  const r = d.reframe[i]!;
  const c = choice[tab];
  const wording = own[tab] ?? r.reframed;
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="What you came with, and what it needs to be"
        side={<Segmented value={tab} onChange={(v) => { setTab(v); setWhy(false); }} items={d.reframe.map((x, k) => ({ id: String(k), label: <>{x.key}{choice[String(k)] && <span className="ml-1.5 text-tone-base-ink">✓</span>}</> }))} />}>
        Your problem, your goal, your market
      </H>
      <div key={tab} className="screen-in">
        <div className={eyebrow}>You said</div>
        <p className={`mt-2 font-display text-[24px] transition-all ${c === "mine" ? "font-bold text-foreground" : "text-muted-foreground line-through decoration-foreground/30"}`}>{r.came}</p>
        <div className="my-6 flex items-center gap-3 text-muted-foreground"><span className="h-px w-16 bg-foreground/30" />becomes</div>
        {c === "edit" ? (
          <textarea autoFocus rows={3} value={wording} onChange={(e) => setOwn((o) => ({ ...o, [tab]: e.target.value }))}
            className="w-full resize-none border-b-2 border-foreground bg-transparent font-display text-[40px] font-bold leading-[1.1] tracking-tight outline-none" />
        ) : (
          <p className={`font-display text-[40px] font-bold leading-[1.1] tracking-tight transition-opacity ${c === "mine" ? "opacity-30" : ""}`}>{wording}</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">{r.reframedSource}</p>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {([["use", "Use this wording"], ["edit", "Say it my way"], ["mine", "Keep mine for now"]] as [Choice, string][]).map(([k, t]) => (
            <button key={k} onClick={() => setChoice((s) => ({ ...s, [tab]: k }))} className={c === k ? pillDark : pillLine}>{c === k && "✓ "}{t}</button>
          ))}
          {c && i < 2 && <button onClick={() => setTab(String(i + 1))} className="ml-4 font-medium underline underline-offset-4">Next: your {d.reframe[i + 1]!.key.toLowerCase()} →</button>}
        </div>

        <div className="mt-12 grid grid-cols-4 gap-6 border-t border-foreground/10 pt-6">
          {r.now.map((x, k) => (
            <div key={x.t}>
              <div className="flex items-center gap-2 font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${r.checks[k]?.ok ? "bg-tone-base-ink" : "bg-kind-disputed"}`} />{x.t}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{x.d}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setWhy((v) => !v)} className="mt-8 text-sm font-medium underline underline-offset-4">{why ? "Hide" : "Why it changed"} · what a {r.key.toLowerCase()} needs</button>
        {why && (
          <div className="screen-in mt-6 grid grid-cols-[1fr_340px] gap-12">
            <ul className="flex flex-col gap-3">
              {r.checks.map((x) => (
                <li key={x.t} className="flex gap-3"><span className={x.ok ? "text-tone-base-ink" : "text-kind-disputed"}>{x.ok ? "✓" : "✕"}</span>
                  <div><b>{x.t}</b> <span className="text-muted-foreground">— {x.d}</span></div></li>
              ))}
            </ul>
            <div className="text-sm">
              <div className={eyebrow}>Like this</div>
              <p className="mt-2 text-muted-foreground line-through">“{r.like.from}”</p>
              <p className="mt-1 font-semibold">“{r.like.to}”</p>
              <p className="mt-2 text-muted-foreground">{r.like.why}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* 12b · Market — cards you rank by dragging. Top of the stack is your pick. */
function Market() {
  const [order, setOrder] = useState(d.groups.map((g) => g.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const move = (id: string, to: number) => setOrder((o) => { const n = o.filter((x) => x !== id); n.splice(to, 0, id); return n; });
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="Choose your market · outcome 3 of 3" lede="“Donors” holds three groups, each with a different job to get done. Drag them into the order you'd bet on. The top one is your pick.">
        Who could get you to your goal
      </H>
      <ol className="flex flex-col gap-3">
        {order.map((id, k) => {
          const g = d.groups.find((x) => x.id === id)!;
          const top = k === 0;
          return (
            <li key={id} draggable
              onDragStart={() => setDragging(id)} onDragEnd={() => setDragging(null)}
              onDragOver={(e) => { e.preventDefault(); if (dragging && dragging !== id) move(dragging, k); }}
              className={`group grid cursor-grab grid-cols-[48px_1fr_260px] items-center gap-6 rounded-2xl px-6 transition-all active:cursor-grabbing ${top ? "bg-tone-market py-7 shadow-lift" : "bg-surface py-5 shadow-soft"} ${dragging === id ? "scale-[0.98] opacity-60" : ""}`}>
              <div className="flex flex-col items-center gap-1">
                <span className={`font-display font-bold ${top ? "text-[36px]" : "text-[24px] text-muted-foreground"}`}>{k + 1}</span>
                <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">⠿</span>
              </div>
              <div>
                <div className={`font-display font-bold leading-tight ${top ? "text-[26px]" : "text-[20px]"}`}>{g.job}</div>
                <div className="mt-1 text-muted-foreground">{g.name}</div>
                {top && <div className="mt-3 text-sm"><b>Would have to be true:</b> {g.mustBeTrue} <span className="text-muted-foreground">· Positioning {g.positioning}.</span></div>}
              </div>
              <div>
                <div className="flex items-baseline justify-between text-sm"><span>Serves <b>{g.serves}</b> of {d.internalNeeds} needs</span><span className="text-muted-foreground">{g.heard} heard</span></div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-foreground/10">
                  <span className="rounded-full bg-tone-market-ink transition-all duration-500" style={{ width: `${(g.serves / d.internalNeeds) * 100}%` }} />
                </div>
                <div className="mt-3 flex gap-3 text-sm">
                  {!top && <button onClick={() => move(id, 0)} className="font-medium underline underline-offset-4">Make it my pick</button>}
                  <Link to="/diagnose/$step" params={{ step: "needs" }} className="text-muted-foreground underline underline-offset-4">Their needs</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">Nothing is decided by the tool. You can change the order until Focus begins; the others stay as maps you could build next.</p>
    </div>
  );
}

/* 13 · Needs — the map is the screen; everything else steps back. */
const srcDot = { interview: "bg-foreground", document: "border-2 border-foreground bg-paper", market: "bg-kind-disputed" } as const;
function Needs() {
  const [gid, setGid] = useState("local");
  const [sel, setSel] = useState<number | null>(0);
  const g = d.groups.find((x) => x.id === gid)!;
  const list = d.needs[gid] ?? [];
  const n = sel != null ? list[sel] : undefined;
  return (
    <div>
      <H kicker="Their needs · heard, not yet scored" lede={`${g.name} · “${g.job}”`}
        side={<Segmented value={gid} onChange={(v) => { setGid(v); setSel(0); }} items={d.groups.map((x) => ({ id: x.id, label: x.short }))} />}>
        What {g.short.toLowerCase()} need, step by step
      </H>
      <div className="relative">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">◀ You are here · your base</span>
          <span className="font-semibold text-tone-base-ink">Your goal · close the donor gap ▶</span>
        </div>
        <div className="relative mt-4 grid h-[300px] grid-cols-8 border-y border-foreground/15">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-foreground/20" />
          {d.jobSteps.map((s) => (
            <div key={s} className="border-r border-dashed border-foreground/10 pt-3 text-center text-sm text-muted-foreground last:border-0">{s}</div>
          ))}
          {list.map(([step, row, src], k) => (
            <button key={k} aria-label={`Need ${k + 1}`} onClick={() => setSel(k)}
              className={`absolute h-5 w-5 -translate-x-1/2 rounded-full transition-all hover:scale-150 ${srcDot[src]} ${sel === k ? "scale-150 ring-[6px] ring-tone-market-ink/25" : ""}`}
              style={{ left: `${((step + 0.5) / 8) * 100}%`, top: 90 + row * 60 }} />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-[1fr_auto] items-start gap-12">
          <div key={`${gid}-${sel}`} className="screen-in min-h-[90px]">
            {n ? (
              <>
                <div className={eyebrow}>{d.jobSteps[n[0]]} · from {n[2] === "interview" ? "your interviews" : n[2] === "document" ? "your documents" : "the market"}</div>
                <p className="mt-2 font-display text-[32px] font-bold leading-tight">“{n[3]}”</p>
              </>
            ) : <p className="text-muted-foreground">Click a dot to hear the need.</p>}
          </div>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><i className={`h-3.5 w-3.5 rounded-full ${srcDot.interview}`} />Interviews</span>
            <span className="flex items-center gap-2"><i className={`h-3.5 w-3.5 rounded-full ${srcDot.document}`} />Documents</span>
            <span className="flex items-center gap-2"><i className={`h-3.5 w-3.5 rounded-full ${srcDot.market}`} />Market (Focus)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 14 · First MojoMap — reads like a statement, not a form. */
function MojoMap() {
  const m = d.mojomap;
  const Row = ({ k, tone, v, n }: { k: string; tone: Tone; v: string; n: string }) => (
    <div className="grid grid-cols-[180px_1fr] gap-10 border-t border-foreground/10 py-8">
      <div className="flex items-center gap-2 self-start pt-3 text-sm font-medium"><i className={`h-3 w-3 rounded-full ${toneInk[tone]}`} />{k}</div>
      <div><p className="font-display text-[32px] font-bold leading-[1.12] tracking-tight">{v}</p><p className={`mt-2 text-sm ${toneText[tone]}`}>{n}</p></div>
    </div>
  );
  return (
    <div className="mx-auto max-w-[1100px]">
      <H kicker="Your first MojoMap · Diagnose closed [DATE]" side={<button className={pillLine}>Board summary ↓</button>}>One problem. One goal. One market</H>
      <Row k="The problem" tone="base" v={m.problem.v} n={m.problem.n} />
      <Row k="Your goal" tone="goal" v={m.goal.v} n={m.goal.n} />
      <Row k="Your market" tone="market" v={m.market.v} n={m.market.n} />
      <div className="grid grid-cols-[180px_1fr] gap-10 border-t border-foreground/10 py-6 text-sm">
        <div className="font-medium">Your base</div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">{m.base.map(([a, b]) => <span key={a}><b>{a}</b> <span className="text-muted-foreground">· {b}</span></span>)}</div>
        <div className="font-medium text-muted-foreground">Set aside, not lost</div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-muted-foreground">{m.aside.map(([a, b]) => <span key={a}>{a} · {b}</span>)}</div>
      </div>
      <div className={`mt-6 flex items-center justify-between rounded-full ${toneBg.goal} py-3 pl-8 pr-3`}>
        <p><b>Up next · Focus.</b> {m.next}</p>
        <button className={pillDark}>Open Focus →</button>
      </div>
    </div>
  );
}

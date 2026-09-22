// First-read marks — the affordance, commit 2 (2026-09-22). Structure proofs on real components:
//   (a) NO provider → zero [data-fr-mark] nodes: every first-read act rendered with a populated read, the story's
//       MarketAct (both branches), and the surfaces that must never mount the provider (source guard);
//   (b) WITH a provider → targets exist; a frozen company → zero nodes again;
//   (c) the box (fix pass FM5/FM17–FM21): nothing preselected and an empty close writes nothing; picking a choice
//       saves with no note; typed text survives a choice switch; x / Escape / outside click each save and close;
//       an existing mark shows as it is, appends only on change, withdraws per mark; a failed save shows S6 and
//       keeps the text; reduced motion turns the opening animation off; the hover cue is on markable targets
//       only; a click on a link inside the row keeps its behaviour (no box); keys typed in the box never reach a
//       window keydown listener (the beat navigation).
// Plants: MarkTarget rendering its wrapper without a provider (a red); a preselected choice (FM18 red); the
// create call gated on a note (FM5 red); a note cleared on switch (red); the x button saving nothing (FM20 red);
// matchMedia ignored (reduced-motion red); the hover rule removed (FM17 red); stopPropagation removed (keys red).
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MarkTarget, MarksProvider, type MarksSurface } from "./MarksContext";
import type { LiveMark } from "./useFirstReadMarks";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "@/views/client/firstReadPreview/types";
import { ActFindings, ActGap, ActQuestions, ActRecord, ActWhatYouSay, ActWhoYouServe, ActWhatYouOffer, ActPromise, ActPositioning, ActStrategy, ScoreReveal, ColdOpen } from "@/views/client/firstReadPreview/acts";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useMarketPortfolio", () => ({ useMarketPortfolio: () => ({ loading: false, portfolio: { active: [], deferred: [] }, hasInternalDeclared: false }) }));
vi.mock("@/hooks/useMarketOptions", () => ({ useMarketOptions: () => ({ loading: false, options: [{ id: "o1", executor_statement: "Funders", job_statement: "Advance", basis: null, relationship_kind: "funder", market_register: "public_inferred" }] }) }));
import MarketAct from "@/components/client-view/story/movement/MarketAct";

afterEach(() => cleanup());
const SEL = "[data-fr-mark]";
const READ: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ,
  company: { name: "Fixture Co", website: "https://fixture.example" },
  coldOpen: { text: "Fixture cold open", sourceTag: null, eventDate: null, quoted: false, rung: "signal", anchorKey: "sig-c" },
  signals: [{ id: "sig-1", text: "Fixture outside signal", sourceTag: null, eventDate: null, strength: "strong", provablyVerbatim: false }],
  ownWords: [{ id: "ow-1", quote: "Fixture own words", pageUrl: "https://fixture.example/a", pageHost: "fixture.example", fidelity: "verbatim", sourceTag: null }],
  declared: [{ id: "cl-1", topic: null, facet: null, statement: "Fixture channel claim", sourceTag: null }],
  ownWordsRun: true,
  gapStatements: [{ statementId: "st-1", declared: "Fixture declared", verdict: "confirmed", evidence: [{ id: "p1", statementId: "st-1", verdict: "confirmed", declared: "Fixture declared", record: "Fixture record", sourceTag: null, eventDate: null, evidenceRank: 2, contentIdentity: "ci-1" }] }],
  gapCounts: { contradicted: 0, unechoed: 0, confirmed: 1, reverifying: 0 },
  reverseRows: [{ id: "rv-1", statement: "Fixture raised by the record", sourceTag: null, eventDate: null }],
  findings: [{ id: "f-1", body: "Fixture finding", recurrence: 0, sourceTag: null, quotes: [{ text: "Fixture quote", sourceTag: null, eventDate: null, provablyVerbatim: false, signalId: "sig-9" }], stale: false, ageMarker: null }],
  observedMarkets: [{ id: "md-1", journeyKey: "mkt-a", who: "Fixture market", job: null, relationshipKind: null, sourceTag: null }],
  unstatedGroups: [{ id: "u-1", who: "Fixture group", job: null, relationshipKind: null, outcome: "rejected_buyer", judgeReason: null, reconstructed: false, criterionVersion: 1, stale: false, originalIdentity: "oi-1" }],
  offering: { items: [{ label: "Fixture item", statement: "Fixture item statement", ownSite: "named", sourceCount: 1, earliestYear: null, latestYear: null }] },
  promise: { text: "Fixture promise", sourceTag: null },
  positioning: { category: "Fixture category", value: "Fixture value", differentiators: ["Fixture diff"], sourceTag: null },
  strategy: { aspiration: "Fixture aspiration", whereToPlay: "Fixture where", howToWin: "Fixture how", capabilities: ["Fixture cap"], managementSystems: [], sourceTag: null },
  score: { value: 62, computedAt: "2026-09-22T00:00:00Z", methodologyVersion: "outside-1" },
  questions: ["Fixture question?"],
  questionAnchors: [{ identity: "qi-1", text: "Fixture question?" }],
} as FirstReadPreviewData;

const mark = (over: Partial<LiveMark>): LiveMark => ({ id: "m1", company_id: "c1", kind: "our_mark", beat_key: "questions", anchor_kind: "question", anchor_key: "qi-1", anchor_text: "Fixture question?", anchor_text_sha256: "a".repeat(64), created_at: "2026-09-22T00:00:00Z", version: 1, note: "existing note", disposition: null, ...over });
function surface(marks: LiveMark[] = [], frozen = false) {
  const create = vi.fn<MarksSurface["create"]>(async () => ({ ok: true as const }));
  const append = vi.fn<MarksSurface["append"]>(async () => ({ ok: true as const }));
  const withdraw = vi.fn<MarksSurface["withdraw"]>(async () => ({ ok: true as const }));
  const byAnchor = new Map<string, LiveMark[]>();
  for (const m of marks) { const k = `${m.anchor_kind}|${m.anchor_key}`; byAnchor.set(k, [...(byAnchor.get(k) ?? []), m]); }
  const value: Omit<MarksSurface, "openId" | "setOpenId"> = { companyId: "c1", marks, byAnchor, frozen, currentBeat: "questions", goToBeat: vi.fn(), create, append, withdraw };
  return { value, create, append, withdraw };
}
const allActs = () => (
  <>
    <ColdOpen read={READ} onContinue={() => {}} />
    <ActRecord read={READ} /><ActWhatYouSay read={READ} /><ActGap read={READ} /><ActFindings read={READ} />
    <ActPromise read={READ} /><ActPositioning read={READ} /><ActStrategy read={READ} />
    <ActWhoYouServe read={READ} /><ActWhatYouOffer read={READ} /><ScoreReveal read={READ} /><ActQuestions read={READ} />
  </>
);

describe("(a) no provider → zero mark nodes", () => {
  it("every first-read act with a populated read renders ZERO [data-fr-mark] nodes", () => {
    const { container } = render(allActs());
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.textContent).toContain("Fixture finding");
  });
  it("the story's MarketAct renders zero mark nodes", () => {
    const { container } = render(<MarketAct />);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
  });
  it("source guard: the client story, the presenter rail and the story components never import the provider", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = ["src/views/client/ClientStoryView.tsx", "src/views/FirstReadView/index.tsx", "src/views/FirstReadView/FirstReadNav.tsx"];
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
    for (const f of [...files.map((f) => join(root, f)), ...walk(join(root, "src/components/client-view/story"))]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/MarksProvider|firstReadMarks\/MarksContext/);
    }
    // the ONE provider
    expect(readFileSync(join(root, "src/views/client/firstReadPreview/FirstReadPreviewView.tsx"), "utf8")).toMatch(/<MarksProvider/);
  });
});

describe("(b) with a provider", () => {
  it("targets exist for the markable rows; a frozen company renders none", () => {
    const { value } = surface();
    const { container } = render(<MarksProvider value={value}>{allActs()}</MarksProvider>);
    const kinds = new Set([...container.querySelectorAll("[data-fr-mark='target']")].map((n) => n.getAttribute("data-fr-mark-kind")));
    for (const k of ["signal", "own_words", "channel_claim", "gap_statement", "gap_pair", "reverse_row", "finding", "finding_quote", "market", "candidate_group", "question", "read_field", "score_value", "section", "group"]) expect([...kinds], k).toContain(k);
    expect(container.querySelector("[data-fr-mark='target'][data-fr-mark-kind='market']")!.getAttribute("data-fr-mark-key")).toBe("mkt-a");
    expect(container.querySelector("[data-fr-mark='target'][data-fr-mark-kind='candidate_group']")!.getAttribute("data-fr-mark-key")).toBe("oi-1");
    expect(container.querySelector("[data-fr-mark='target'][data-fr-mark-kind='finding_quote']")!.getAttribute("data-fr-mark-key")).toBe("f-1:sig-9");
    cleanup();
    const frozen = surface([], true);
    const { container: c2 } = render(<MarksProvider value={frozen.value}>{allActs()}</MarksProvider>);
    expect(c2.querySelectorAll(SEL)).toHaveLength(0);
  });
});

const Row = ({ children }: { children?: React.ReactNode }) => (
  <MarkTarget kind="question" keyVal="qi-1" text="Fixture question?">
    <p>Fixture question?</p>
    <a href="#x" data-testid="row-link">link</a>
    {children}
  </MarkTarget>
);
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); }); // the save awaits the hash, then up to two RPCs

describe("(c) the box", () => {
  const openBox = (container: HTMLElement) => { fireEvent.click(container.querySelector("[data-fr-mark='target'] p")!); return container.querySelector("[data-fr-mark='box']")!; };
  const noteFor = (container: HTMLElement, kind: string) => container.querySelector(`[data-fr-mark='note'][data-fr-mark-note-for='${kind}']`) as HTMLTextAreaElement | null;

  it("FM18: nothing preselected; an empty close writes nothing", async () => {
    const s = surface();
    const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    openBox(container);
    expect([...container.querySelectorAll("[data-fr-mark-choice]")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
    expect(noteFor(container, "our_mark")).toBeNull(); // its note field appears only when picked
    fireEvent.mouseDown(document.body); await flush();
    expect(s.create).not.toHaveBeenCalled();
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
  });
  it("FM5: picking a choice saves with no note (note = null); the reaction and Stood out to us each create once", async () => {
    const s = surface();
    const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='our_mark']")!);
    expect(noteFor(container, "our_mark")).not.toBeNull();
    fireEvent.mouseDown(document.body); await flush();
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(s.create.mock.calls[0][0]).toMatchObject({ beatKey: "questions", kind: "client_reaction", disposition: "important", note: null, anchor: { anchor_kind: "question", anchor_key: "qi-1", anchor_text: "Fixture question?" } });
    expect(s.create.mock.calls[1][0]).toMatchObject({ kind: "our_mark", disposition: null, note: null });
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
  });
  it("typed text survives a choice switch (both note fields keep their text); a note without a choice writes nothing", async () => {
    const s = surface();
    const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    openBox(container);
    fireEvent.change(noteFor(container, "client_reaction")!, { target: { value: "typed first" } });
    fireEvent.click(container.querySelector("[data-fr-mark-choice='interesting']")!);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='not_important']")!);
    expect(noteFor(container, "client_reaction")!.value).toBe("typed first");
    fireEvent.click(container.querySelector("[data-fr-mark-choice='our_mark']")!);
    fireEvent.change(noteFor(container, "our_mark")!, { target: { value: "ours typed" } });
    fireEvent.click(container.querySelector("[data-fr-mark-choice='our_mark']")!); // unpick hides its field
    expect(noteFor(container, "our_mark")).toBeNull();
    fireEvent.click(container.querySelector("[data-fr-mark-choice='our_mark']")!); // pick again: the text is back
    expect(noteFor(container, "our_mark")!.value).toBe("ours typed");
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!);
    expect(noteFor(container, "client_reaction")!.value).toBe("typed first");
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!); // a fresh pick undone
    expect(container.querySelector("[data-fr-mark-choice='important']")!.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(container.querySelector("[data-fr-mark-choice='our_mark']")!); // and ours unpicked
    fireEvent.mouseDown(document.body); await flush();
    expect(s.create).not.toHaveBeenCalled(); // text typed, nothing picked → nothing written
  });
  it("FM20: the x button (aria-label Close), Escape and a click outside each save and close", async () => {
    const s = surface();
    const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    // x button
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='interesting']")!);
    const x = container.querySelector("[data-fr-mark='close']")!;
    expect(x.getAttribute("aria-label")).toBe("Close");
    fireEvent.click(x); await flush();
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
    // Escape
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!);
    fireEvent.keyDown(noteFor(container, "client_reaction")!, { key: "Escape" }); await flush();
    expect(s.create).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
    // outside click
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='not_important']")!);
    fireEvent.mouseDown(document.body); await flush();
    expect(s.create).toHaveBeenCalledTimes(3);
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
    expect(s.create.mock.calls.map((c) => c[0].disposition)).toEqual(["interesting", "important", "not_important"]);
  });
  it("an existing mark: shows as it is; unchanged close → no append; a changed note / disposition appends; a cleared note appends null; withdraw per mark", async () => {
    const e = surface([mark({ kind: "client_reaction", disposition: "interesting", note: "existing note" }), mark({ id: "m2", kind: "our_mark", note: "" })]);
    const { container } = render(<MarksProvider value={e.value}><Row /></MarksProvider>);
    const t2 = container.querySelector("[data-fr-mark='target']")!;
    expect(t2.getAttribute("data-fr-marked")).toBe("client_reaction+our_mark");
    expect(container.textContent).not.toContain("existing note"); // hidden until clicked
    openBox(container);
    expect(noteFor(container, "client_reaction")!.value).toBe("existing note");
    expect(container.querySelector("[data-fr-mark-choice='interesting']")!.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-fr-mark-choice='our_mark']")!.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("[data-fr-mark='withdraw']")).toHaveLength(2);
    fireEvent.mouseDown(document.body); await flush();
    expect(e.append).not.toHaveBeenCalled();
    openBox(container);
    fireEvent.change(noteFor(container, "client_reaction")!, { target: { value: "changed note" } });
    fireEvent.mouseDown(document.body); await flush();
    expect(e.append).toHaveBeenCalledWith("m1", "changed note", null); // note only: the disposition carries forward
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='important']")!); // an existing reaction never unpicks
    expect(container.querySelector("[data-fr-mark-choice='important']")!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.mouseDown(document.body); await flush();
    expect(e.append).toHaveBeenLastCalledWith("m1", "existing note", "important");
    openBox(container);
    fireEvent.change(noteFor(container, "client_reaction")!, { target: { value: "   " } });
    fireEvent.mouseDown(document.body); await flush();
    expect(e.append).toHaveBeenLastCalledWith("m1", null, null); // cleared → null
    openBox(container);
    fireEvent.change(noteFor(container, "our_mark")!, { target: { value: "ours now" } });
    fireEvent.mouseDown(document.body); await flush();
    expect(e.append).toHaveBeenLastCalledWith("m2", "ours now", null);
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark='withdraw'][data-fr-mark-withdraw='our_mark']")!); await flush();
    expect(e.withdraw).toHaveBeenCalledWith("m2");
  });
  it("a failed save shows S6 and keeps the box and its text", async () => {
    const s = surface();
    s.create.mockResolvedValueOnce({ ok: false, error: "boom" });
    const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    openBox(container);
    fireEvent.click(container.querySelector("[data-fr-mark-choice='interesting']")!);
    fireEvent.change(noteFor(container, "client_reaction")!, { target: { value: "kept text" } });
    fireEvent.click(container.querySelector("[data-fr-mark='close']")!); await flush();
    expect(container.querySelector("[data-fr-mark='box']")).not.toBeNull();
    expect(container.querySelector("[data-fr-mark='failed']")!.textContent).toBe("That didn't save. Try again.");
    expect(noteFor(container, "client_reaction")!.value).toBe("kept text");
  });
  it("FM20: reduced motion → no opening animation (data-fr-mark-motion=none); otherwise enter", () => {
    const s = surface();
    const mm = vi.fn((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
    const prev = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: mm });
    try {
      const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
      expect(openBox(container).getAttribute("data-fr-mark-motion")).toBe("none");
      cleanup();
      mm.mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
      const { container: c2 } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
      expect(openBox(c2).getAttribute("data-fr-mark-motion")).toBe("enter");
    } finally { Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: prev }); }
    // the stylesheet animates only the "enter" state and turns it off under prefers-reduced-motion
    const css = readFileSync(join(__dirname, "..", "..", "views/client/firstReadPreview/firstRead.css"), "utf8");
    expect(css).toMatch(/\.fr-mark-box\[data-fr-mark-motion="enter"\]\s*\{\s*animation: fr-mark-box-in 150ms/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fr-mark-box\[data-fr-mark-motion="enter"\]\s*\{\s*animation: none;/);
  });
  it("FM17: the hover cue (pointer + faint outline) is on markable targets only", () => {
    const css = readFileSync(join(__dirname, "..", "..", "views/client/firstReadPreview/firstRead.css"), "utf8");
    expect(css).toMatch(/\.fr-mark-target\s*\{[^}]*cursor: pointer/);
    expect(css).toMatch(/\.fr-mark-target:hover\s*\{[^}]*outline: 1px solid hsl\(var\(--fr-hair\)\)/);
    const s = surface();
    const { container } = render(<MarksProvider value={s.value}><><Row /><MarkTarget kind="question" keyVal={null}><p data-testid="unkeyed">Not markable</p></MarkTarget></></MarksProvider>);
    expect(container.querySelectorAll(".fr-mark-target")).toHaveLength(1);
    expect(container.querySelector("[data-testid='unkeyed']")!.closest(".fr-mark-target")).toBeNull();
    cleanup();
    const { container: c2 } = render(<Row />); // no provider: no cue class anywhere
    expect(c2.querySelectorAll(".fr-mark-target")).toHaveLength(0);
  });
  it("a click on a link inside the row keeps its behaviour and opens no box", () => {
    const s = surface();
    const { container, getByTestId } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
    fireEvent.click(getByTestId("row-link"));
    expect(container.querySelector("[data-fr-mark='box']")).toBeNull();
  });
  it("keys typed in the box never reach a window keydown listener (the beat navigation)", () => {
    const s = surface();
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener("keydown", onKey);
    try {
      const { container } = render(<MarksProvider value={s.value}><Row /></MarksProvider>);
      fireEvent.click(container.querySelector("[data-fr-mark='target'] p")!);
      const note = container.querySelector("[data-fr-mark='note']")!;
      for (const key of ["ArrowRight", "ArrowLeft", "End", "Home", " ", "Enter"]) fireEvent.keyDown(note, { key });
      expect(seen).toEqual([]);
      fireEvent.keyDown(container.querySelector("[data-fr-mark='target'] p")!, { key: "ArrowRight" }); // outside the box: reaches the window
      expect(seen).toEqual(["ArrowRight"]);
    } finally { window.removeEventListener("keydown", onKey); }
  });
});

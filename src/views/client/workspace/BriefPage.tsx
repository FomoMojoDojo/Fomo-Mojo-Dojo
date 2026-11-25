// ── THE BRIEF (SP-442 / SP-424 / SP-445 / SP-446 / SP-449, 2026-11-19; board BR4, SP-674) ─────────
//
// The conversation brief, built by MojoMap out of its own stored rows instead of by hand. Operators
// only (SP-424): the route is already closed to a non-admin by AdminModeRoute + InternalViewOnlyRoute
// (App.tsx), the Tools tile is hidden by the operatorOnly flag, and the page's own default render —
// no operator context — is the absent state, which is what tests/workspace/f-no-operator-nodes
// asserts for every workspace route.
//
// FOUR SECTIONS, each from need_evidence under SP-406 counting (useBriefNeeds):
//   Hotspots    the needs that clear the bar, most-evidenced first. One overview row per need — a
//               bar of its counted quotes by polarity, the count, the sites — then one section for
//               each need that has patterns, with what keeps happening under it (PatternBand).
//   What works  the needs whose counted quotes say the outcome IS met (SP-449). A need can sit in
//               both: the same outcome can be met for some customers and missed for others.
//   Thin spots  the needs that do not clear the bar, with WHICH floor they missed and what the
//               merger rule withheld — so a thin spot says what would have changed it.
//   Questions   the live open questions from the outside read, newest first.
//
// EVERY NEED ROW OPENS ITS QUOTES (SP-674 ruling 2): a hotspot with patterns through "All {n}
// quotes" in its section, every other row in place. Each quote shows brand · site · date with the
// reviewer's name masked (QuoteList → displayQuote). No number on this page is read from a stored
// count (SP-447) and no counting rule is restated here.
//
// A pattern's claim opens the evidence panel (BriefPanel). From 1024px the panel sits BESIDE the
// page, which narrows; below that it sits in the flow under its row. It never covers the page.
//
// "DRAFT, NOT SIGNED" stands until the sign step is built (SP-424).
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useBriefNeeds, type BriefNeed } from "@/hooks/useBriefNeeds";
import { useNeedPatterns, type NeedPattern } from "@/hooks/useNeedPatterns";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { useSupersededQuestionCount } from "@/hooks/useSupersededQuestionCount";
import { brandTotals, hotspots, isAtTheBar, polarityTotals, thinSpots, whatWorks } from "@/lib/briefSections";
import { tallyNeed, type EvidenceRow, type NeedTally } from "@/lib/needEvidenceCounting";
import { OUTSIDE_VOICE_MARK, isOutsideVoiceSourced } from "@/lib/outsideVoiceMark";
import { brandWords, type QuoteRow } from "@/lib/reviewQuote";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { BriefPanel } from "./BriefPanel";
import { PatternBand, PolarityCounts } from "./PatternBand";
import { QuoteList } from "./QuoteList";
import { WorkspaceReadPage } from "./WorkspaceReadPage";
import { thinReasonLine, thinWithheldLine } from "./briefStrings";
import {
  POLARITY_ORDER, WORKSPACE_STRINGS, allQuotesLine, brandLabel, countedQuotesSitesLine, orderShownPatterns, pageLabel,
  questionsFootLine, showAllLine, sitesLine, workspaceDocumentTitle,
} from "./workspaceNav";

/** The questions column shows this many until the reveal control opens the rest (SP-456). */
const QUESTIONS_SHOWN = 5;
/** The What works column shows this many until the reveal control opens the rest (SP-674 ruling 8). */
const WORKS_SHOWN = 6;
/** need_evidence's sentinel for a page that named no brand; brandLabel maps it to its signed label. */
const BRAND_NOT_RECORDED = "brand_not_recorded";

type SectionKey = "hotspots" | "what-works" | "thin-spots" | "questions";
const sectionId = (k: SectionKey) => `brief-${k}`;
const hotId = (needId: string) => `brief-hot-${needId}`;

/** True from 1024px: the panel sits beside the page. Where matchMedia does not exist, it is wide. */
function usePanelBeside(): boolean {
  const query = "(min-width: 1024px)";
  const read = () => (typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(query).matches);
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Scroll a section into view and hand it focus, so the keyboard follows the link. */
function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView?.({ block: "start" });
  el.focus?.({ preventScroll: true });
}

/** A tally's counted quotes by polarity, in the order every list here reads them, zeros left out. */
function polarityCounts(t: NeedTally): Array<{ polarity: string; n: number }> {
  const totals = polarityTotals(t);
  const by: Record<string, number> = { "not working": totals.notWorking, mixed: totals.mixed, working: totals.working };
  return POLARITY_ORDER.map((polarity) => ({ polarity, n: by[polarity] })).filter((x) => x.n > 0);
}

/** One bar of a need's counted quotes: a segment per polarity, grown by its count. The bar's name is
 *  the counts in words, so the bar says nothing the words do not. */
function PolarityBar({ tally, width }: { tally: NeedTally; width: string }) {
  const split = polarityCounts(tally);
  return (
    <span className="fr-ws-brief-bar" role="img" aria-label={split.map((s) => `${s.n} ${s.polarity}`).join(" · ")} style={{ width }} data-testid="brief-bar">
      {split.map((s) => (
        <i key={s.polarity} className="fr-ws-pattern-polarity" data-fr-polarity={s.polarity} data-fr-n={s.n} style={{ flexGrow: s.n }} />
      ))}
    </span>
  );
}

/** A tally over a SUBSET of a need's counted quotes — used by What works, so its row counts the
 *  working quotes and their sites and nothing else. Every quote in the subset bears and counts. */
function tallyOf(quotes: readonly QuoteRow[], polarity: string | null) {
  const rows: EvidenceRow[] = quotes.map((q) => ({ bears: true, polarity, brand: q.brand, eventDate: q.eventDate, sourceUrl: q.sourceUrl }));
  return tallyNeed(rows);
}

/** The need's tags: the outside-voice mark and, for a need nobody has ruled on, the proposed mark
 *  (SP-458) — two tags, because both can be true of one need. */
function NeedTags({ need, outside = true }: { need: BriefNeed; outside?: boolean }) {
  return (
    <>
      {outside && isOutsideVoiceSourced(need.sourcePath) ? <span className="fr-ws-review-tag fr-mono" data-testid="review-card-mark">{OUTSIDE_VOICE_MARK}</span> : null}
      {need.proposed ? <span className="fr-ws-review-tag fr-ws-review-tag--proposed fr-mono" data-testid="review-card-proposed">{WORKSPACE_STRINGS.proposedNeedMark}</span> : null}
    </>
  );
}

/** A row of the ending's first two columns: the need and a count, one control that opens the quotes
 *  behind that count in place. The control's name carries the counted-quotes line (B-10). */
function EndRow({ need, quotes, brands, count, dotPolarity, openKey, openId, setOpenId, testId, children }: {
  need: BriefNeed;
  quotes: readonly QuoteRow[];
  brands: readonly string[];
  count: { counted: number; sites: number };
  dotPolarity?: string;
  openKey: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  testId: string;
  children?: React.ReactNode;
}) {
  const open = openId === openKey;
  const line = countedQuotesSitesLine(count.counted, count.sites);
  return (
    <li className="fr-ws-brief-endrow-li" data-testid={testId} data-fr-open={open ? "true" : undefined}>
      <button type="button" className="fr-ws-brief-endrow" aria-expanded={open} aria-label={`${need.statement} · ${line}`}
        onClick={() => setOpenId(open ? null : openKey)} data-testid="brief-row-open" data-fr-count-line={line}>
        <span className="fr-ws-brief-endrow-name" data-testid="brief-row-name">{need.statement}</span>
        <span className="fr-ws-brief-endrow-n">
          {dotPolarity ? <i className="fr-ws-dot fr-ws-pattern-polarity" data-fr-polarity={dotPolarity} aria-hidden="true" /> : null}
          <span data-testid="brief-row-count">{count.counted}</span>
        </span>
      </button>
      {children}
      {open ? <div className="fr-ws-brief-inplace"><QuoteList quotes={quotes} brands={brands} /></div> : null}
    </li>
  );
}

export default function BriefPage() {
  const { activeCompany } = useCompany();
  const operator = useOperatorControls();
  const companyId = operator ? activeCompany?.id : undefined;
  const { needs, storedBrands, loading } = useBriefNeeds(companyId ?? null);
  const { patterns, assignedByNeed } = useNeedPatterns(companyId ?? null);
  const { rows: questions, loading: questionsLoading } = useFirstReadOpenQuestions(companyId);
  const superseded = useSupersededQuestionCount(companyId ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [worksAll, setWorksAll] = useState(false);
  const [questionsAll, setQuestionsAll] = useState(false);
  const [current, setCurrent] = useState<SectionKey>("hotspots");
  const beside = usePanelBeside();

  // SP-440: "<Page> — <company name>". The previous title is restored on unmount, so leaving the
  // Brief does not leave its name on another page.
  useEffect(() => {
    if (!operator) return;
    const previous = document.title;
    document.title = workspaceDocumentTitle(WORKSPACE_STRINGS.briefLabel, activeCompany?.name);
    return () => { document.title = previous; };
  }, [operator, activeCompany?.name]);

  // Closing the panel hands focus back to the row that opened it.
  const panelIdRef = useRef<string | null>(null);
  panelIdRef.current = panelId;
  const closePanel = useCallback(() => {
    const id = panelIdRef.current;
    setPanelId(null);
    if (id) document.querySelector<HTMLElement>(`[data-fr-pattern-id="${id}"] [data-testid="pattern-name"]`)?.focus();
  }, []);
  // Escape closes the panel from anywhere on the page. The shell's own keys (←/→, the launcher's
  // Escape while it is open) are untouched: this listens only while a panel is open.
  useEffect(() => {
    if (!panelId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelId, closePanel]);

  // The section link in view is the current one: the first section, in page order, on screen.
  useEffect(() => {
    if (!operator || loading || typeof IntersectionObserver === "undefined") return;
    const keys: SectionKey[] = ["hotspots", "what-works", "thin-spots", "questions"];
    const visible = new Set<SectionKey>();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.frRegion as SectionKey;
        if (e.isIntersecting) visible.add(key); else visible.delete(key);
      }
      const first = keys.find((k) => visible.has(k));
      if (first) setCurrent((prev) => (visible.has(prev) ? prev : first));
    });
    for (const k of keys) { const el = document.getElementById(sectionId(k)); if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [operator, loading, needs.length, questions.length]);

  if (!operator) {
    return (
      <WorkspaceReadPage eyebrow={pageLabel("brief")} statement={null}>
        <WorkspaceAbsent what="brief" />
      </WorkspaceReadPage>
    );
  }

  // SP-455c: the words the mask must not take for a reviewer, from stored values only.
  const brands = brandWords(activeCompany?.name, storedBrands);
  const rows = needs.map((need) => ({ need, tally: need.tally }));
  const hot = hotspots(rows);
  const patternsByNeed = new Map<string, NeedPattern[]>();
  for (const p of patterns) (patternsByNeed.get(p.needId) ?? patternsByNeed.set(p.needId, []).get(p.needId)!).push(p);
  const works = whatWorks(rows);
  const thin = thinSpots(rows);
  const hotWithPatterns = hot.filter(({ need }) => (patternsByNeed.get(need.id) ?? []).length > 0);
  const maxCounted = Math.max(1, ...hot.map(({ need }) => need.tally.counted));
  const showQuestions = !questionsLoading && questions.length > 0;
  // Newest first: the one list reads oldest-first with a deterministic tie-break, so reversing it is
  // newest-first and just as deterministic.
  const orderedQuestions = [...questions].reverse();
  const shownQuestions = questionsAll ? orderedQuestions : orderedQuestions.slice(0, QUESTIONS_SHOWN);
  const shownWorks = worksAll ? works : works.slice(0, WORKS_SHOWN);

  // The open pattern, its place among its need's shown patterns, and its supporting quotes. A quote's
  // brand is need_evidence's, which the need's own counted quotes carry; a supporting quote with no
  // match there shows the signed "Brand not recorded".
  const panelPattern = panelId ? patterns.find((p) => p.id === panelId) ?? null : null;
  const panelNeed = panelPattern ? needs.find((n) => n.id === panelPattern.needId) ?? null : null;
  const panelShown = panelPattern
    ? orderShownPatterns((patternsByNeed.get(panelPattern.needId) ?? []).filter((p) => p.strength !== "too thin"))
    : [];
  const brandBySignal = new Map((panelNeed?.quotes ?? []).map((q) => [q.signalId, q.brand]));
  const panelQuotes: QuoteRow[] = (panelPattern?.quotes ?? []).map((q) => ({ ...q, brand: brandBySignal.get(q.signalId) || BRAND_NOT_RECORDED }));
  const panel = panelPattern ? (
    <BriefPanel
      pattern={panelPattern}
      index={panelShown.findIndex((p) => p.id === panelPattern.id) + 1}
      total={panelShown.length}
      quotes={panelQuotes}
      brands={brands}
      inflow={!beside}
      onClose={closePanel}
    />
  ) : null;

  const tabs: Array<{ key: SectionKey; label: string; n: number }> = [
    ...(hot.length > 0 ? [{ key: "hotspots" as const, label: WORKSPACE_STRINGS.bandHotspots, n: hot.length }] : []),
    ...(works.length > 0 ? [{ key: "what-works" as const, label: WORKSPACE_STRINGS.bandWhatWorks, n: works.length }] : []),
    ...(thin.length > 0 ? [{ key: "thin-spots" as const, label: WORKSPACE_STRINGS.bandThinSpots, n: thin.length }] : []),
    ...(showQuestions ? [{ key: "questions" as const, label: WORKSPACE_STRINGS.briefOpenQuestionsShort, n: questions.length }] : []),
  ];
  const onTab = (event: MouseEvent, key: SectionKey) => { event.preventDefault(); setCurrent(key); goTo(sectionId(key)); };

  return (
    <div {...{ [OPERATOR_MARK.attr]: "brief" }} data-testid="brief-page">
      <WorkspaceReadPage eyebrow={pageLabel("brief")} statement={WORKSPACE_STRINGS.briefKicker}>
        <div className="fr-ws-brief" data-fr-panel={panel && beside ? "open" : undefined}>
          <div className="fr-ws-brief-main">
            <div className="fr-ws-brief-head">
              <div>
                <p className="fr-ws-brief-draft fr-mono" data-testid="brief-draft">{WORKSPACE_STRINGS.briefDraftMark}</p>
                <p className="fr-ws-brief-note" data-testid="brief-note">{WORKSPACE_STRINGS.briefNote}</p>
              </div>
              {loading ? null : (
                <dl className="fr-ws-brief-stats" data-testid="brief-stats">
                  {[
                    { key: "hotspots", label: WORKSPACE_STRINGS.bandHotspots, n: hot.length },
                    { key: "with-patterns", label: WORKSPACE_STRINGS.briefStatWithPatterns, n: hotWithPatterns.length },
                    { key: "thin-spots", label: WORKSPACE_STRINGS.bandThinSpots, n: thin.length },
                    { key: "questions", label: WORKSPACE_STRINGS.briefOpenQuestionsShort, n: questionsLoading ? 0 : questions.length },
                  ].map((s) => (
                    <div key={s.key} className="fr-ws-brief-stat" data-testid="brief-stat" data-fr-stat={s.key}>
                      <dt className="fr-ws-scorecell-label fr-mono">{s.label}</dt>
                      <dd className="fr-ws-scorecell-value">{s.n}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {loading ? null : (
              <>
                <nav className="fr-ws-brief-tabs" aria-label={WORKSPACE_STRINGS.briefSectionsAria} data-testid="brief-tabs">
                  {tabs.map((t) => (
                    <a key={t.key} href={`#${sectionId(t.key)}`} className="fr-ws-control fr-ws-brief-tab fr-mono" aria-current={current === t.key ? "true" : undefined}
                      onClick={(e) => onTab(e, t.key)} data-testid="brief-tab" data-fr-tab={t.key}>
                      {t.label}<span className="fr-ws-brief-tab-n">{t.n}</span>
                    </a>
                  ))}
                  <p className="fr-ws-brief-notbuilt fr-mono" data-testid="brief-not-built">
                    {WORKSPACE_STRINGS.briefNotBuiltYet} {"·"} {WORKSPACE_STRINGS.briefNotBuiltSections}
                  </p>
                </nav>

                {hot.length > 0 ? (
                  <section className="fr-ws-brief-section" id={sectionId("hotspots")} data-fr-region="hotspots" tabIndex={-1}>
                    <div className="fr-ws-brief-sectionhead">
                      <div>
                        <h2 className="fr-ws-brief-h2">{WORKSPACE_STRINGS.bandHotspots}</h2>
                        <p className="fr-ws-brief-lede" data-testid="brief-hotspots-lede">{WORKSPACE_STRINGS.briefHotspotsLede}</p>
                      </div>
                      {/* The legend shows the stored polarity values; CSS capitalizes them. */}
                      <p className="fr-ws-brief-legend" data-testid="brief-legend">
                        {POLARITY_ORDER.map((pol) => (
                          <span key={pol} className="fr-ws-pol-count">
                            <i className="fr-ws-dot fr-ws-pattern-polarity" data-fr-polarity={pol} aria-hidden="true" />
                            <span className="fr-ws-pol-word">{pol}</span>
                          </span>
                        ))}
                      </p>
                    </div>
                    <ul className="fr-ws-brief-chart" data-testid="brief-overview">
                      {hot.map(({ need }) => {
                        const hasPatterns = (patternsByNeed.get(need.id) ?? []).length > 0;
                        const openKey = `hot:${need.id}`;
                        const open = openId === openKey;
                        const sites = need.tally.sites.length;
                        return (
                          <li key={need.id} className="fr-ws-brief-chart-row" data-testid="brief-overview-row"
                            data-fr-patterns={hasPatterns ? "true" : undefined} data-fr-open={open ? "true" : undefined}>
                            <div className="fr-ws-brief-chart-line">
                              <span className="fr-ws-brief-chart-name">
                                {hasPatterns ? (
                                  <a className="fr-ws-brief-chart-text" href={`#${hotId(need.id)}`} title={need.statement} data-testid="brief-overview-name"
                                    onClick={(e) => { e.preventDefault(); goTo(hotId(need.id)); }}>{need.statement}</a>
                                ) : (
                                  <span className="fr-ws-brief-chart-text" title={need.statement} data-testid="brief-overview-name">{need.statement}</span>
                                )}
                                <NeedTags need={need} outside={false} />
                                {hasPatterns ? <span className="fr-ws-review-tag fr-mono" data-testid="brief-patterns-tag">{WORKSPACE_STRINGS.patternsTag}</span> : null}
                                {isAtTheBar(need.tally) ? <span className="fr-ws-bar-mark fr-mono" data-testid="review-card-bar">{WORKSPACE_STRINGS.atTheBar}</span> : null}
                              </span>
                              <PolarityBar tally={need.tally} width={`${(need.tally.counted / maxCounted) * 100}%`} />
                              {hasPatterns ? (
                                <>
                                  <span className="fr-ws-brief-chart-count" data-testid="brief-overview-count">{need.tally.counted}</span>
                                  <span className="fr-ws-brief-chart-sites fr-mono">{sitesLine(sites)}</span>
                                </>
                              ) : (
                                <button type="button" className="fr-ws-brief-chart-open" aria-expanded={open} aria-label={countedQuotesSitesLine(need.tally.counted, sites)}
                                  onClick={() => setOpenId(open ? null : openKey)} data-testid="brief-overview-open">
                                  <span className="fr-ws-brief-chart-count" data-testid="brief-overview-count">{need.tally.counted}</span>
                                  <span className="fr-ws-brief-chart-sites fr-mono">{sitesLine(sites)} {open ? "↑" : "↓"}</span>
                                </button>
                              )}
                            </div>
                            {open && !hasPatterns ? (
                              <div className="fr-ws-brief-inplace">
                                {isOutsideVoiceSourced(need.sourcePath) ? (
                                  <p className="fr-ws-brief-inplace-tags"><span className="fr-ws-review-tag fr-mono" data-testid="review-card-mark">{OUTSIDE_VOICE_MARK}</span></p>
                                ) : null}
                                <QuoteList quotes={need.quotes} brands={brands} />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>

                    {hotWithPatterns.map(({ need }) => {
                      const needPatterns = patternsByNeed.get(need.id) ?? [];
                      const openKey = `all:${need.id}`;
                      const open = openId === openKey;
                      const tagged = isOutsideVoiceSourced(need.sourcePath) || need.proposed;
                      return (
                        <article key={need.id} className="fr-ws-hot" id={hotId(need.id)} data-testid="brief-need" tabIndex={-1} data-fr-open={open ? "true" : undefined}>
                          <div className="fr-ws-hot-count">
                            <span className="fr-display fr-ws-hot-num" data-testid="brief-hot-count">{need.tally.counted}</span>
                            <span className="fr-mono">{WORKSPACE_STRINGS.countedQuotesLabel}</span>
                            <span className="fr-mono" data-testid="brief-hot-sites">{sitesLine(need.tally.sites.length)}</span>
                          </div>
                          <div className="fr-ws-hot-body">
                            {tagged ? <p className="fr-ws-hot-tags"><NeedTags need={need} /></p> : null}
                            <h3 className="fr-ws-hot-title" data-testid="brief-need-title">{need.statement}</h3>
                            <p className="fr-ws-hot-status" data-testid="brief-hot-status">
                              {/* 6px a counted quote, as the board draws it; never wider than the column. */}
                              <PolarityBar tally={need.tally} width={`min(100%, ${need.tally.counted * 6}px)`} />
                              <PolarityCounts split={polarityCounts(need.tally)} testId="brief-hot-polarity" />
                              <span className="fr-ws-hot-brands" data-testid="brief-brand-split">
                                {brandTotals(need.tally).map((b, i) => (
                                  <span key={b.brand}>{i > 0 ? " · " : ""}<span className="fr-ws-hot-brand">{brandLabel(b.brand)}</span> {b.counted}</span>
                                ))}
                              </span>
                            </p>
                            <PatternBand
                              patterns={needPatterns}
                              brands={brands}
                              counted={need.tally.counted}
                              assigned={assignedByNeed[need.id] ?? 0}
                              selectedId={panelId}
                              onSelect={(id) => setPanelId((prev) => (prev === id ? prev : id))}
                              panelSlot={!beside ? panel : null}
                            />
                            <p className="fr-ws-hot-all">
                              <button type="button" className="fr-ws-review-open fr-mono" aria-expanded={open} onClick={() => setOpenId(open ? null : openKey)} data-testid="review-card-open">
                                {allQuotesLine(need.tally.counted)} {open ? "↑" : "↓"}
                              </button>
                            </p>
                            {open ? <div className="fr-ws-review-body"><QuoteList quotes={need.quotes} brands={brands} /></div> : null}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ) : null}

                {works.length > 0 || thin.length > 0 || showQuestions ? (
                  <div className="fr-ws-brief-ending" data-testid="brief-ending">
                    {works.length > 0 ? (
                      <section className="fr-ws-brief-section" id={sectionId("what-works")} data-fr-region="what-works" tabIndex={-1}>
                        <h2 className="fr-ws-brief-colhead">{WORKSPACE_STRINGS.bandWhatWorks}<span className="fr-ws-brief-colhead-n">{works.length}</span></h2>
                        <ul className="fr-ws-brief-endrows">
                          {shownWorks.map(({ need }) => {
                            const t = tallyOf(need.workingQuotes, "working");
                            return (
                              <EndRow key={need.id} need={need} quotes={need.workingQuotes} brands={brands} testId="brief-works-row"
                                count={{ counted: t.counted, sites: t.sites.length }} dotPolarity="working"
                                openKey={`works:${need.id}`} openId={openId} setOpenId={setOpenId} />
                            );
                          })}
                        </ul>
                        {works.length > WORKS_SHOWN ? (
                          <button type="button" className="fr-ws-quote-more fr-mono" aria-expanded={worksAll} onClick={() => setWorksAll((v) => !v)} data-testid="brief-works-show-all">
                            <span aria-hidden className="fr-ws-quote-more-caret" data-open={worksAll ? "true" : undefined}>&rsaquo;</span>
                            {worksAll ? WORKSPACE_STRINGS.showFewer : showAllLine(works.length)}
                          </button>
                        ) : null}
                      </section>
                    ) : null}

                    {thin.length > 0 ? (
                      <section className="fr-ws-brief-section" id={sectionId("thin-spots")} data-fr-region="thin-spots" tabIndex={-1}>
                        <h2 className="fr-ws-brief-colhead">{WORKSPACE_STRINGS.bandThinSpots}<span className="fr-ws-brief-colhead-n">{thin.length}</span></h2>
                        <ul className="fr-ws-brief-endrows">
                          {thin.map(({ need }) => (
                            <EndRow key={need.id} need={need} quotes={need.quotes} brands={brands} testId="brief-thin-row"
                              count={{ counted: need.tally.counted, sites: need.tally.sites.length }}
                              openKey={`thin:${need.id}`} openId={openId} setOpenId={setOpenId}>
                              {isOutsideVoiceSourced(need.sourcePath) || need.proposed ? <p className="fr-ws-brief-endrow-tags"><NeedTags need={need} /></p> : null}
                              <p className="fr-ws-brief-reason fr-mono" data-testid="brief-thin-reason">
                                <span className="fr-ws-bar-mark" data-testid="review-card-bar">{WORKSPACE_STRINGS.belowTheBar}</span>
                                {" \u00b7 "}
                                <span data-testid="brief-thin-why">{thinReasonLine(need.tally)} {"·"} {thinWithheldLine(need.tally)}</span>
                              </p>
                            </EndRow>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {showQuestions ? (
                      <section className="fr-ws-brief-section" id={sectionId("questions")} data-fr-region="questions" tabIndex={-1}>
                        <h2 className="fr-ws-brief-colhead">{WORKSPACE_STRINGS.briefOpenQuestionsShort}<span className="fr-ws-brief-colhead-n">{questions.length}</span></h2>
                        <ul className="fr-ws-brief-endrows" data-fr-showing={shownQuestions.length}>
                          {shownQuestions.map((q, i) => (
                            <li key={`${q.question_identity ?? i}`} className="fr-ws-brief-question-li" data-testid="brief-question">
                              <p className="fr-ws-brief-question">{q.question_text.trim()}</p>
                            </li>
                          ))}
                        </ul>
                        {/* SP-456: every live question can be read — the First Read's own reveal pair. */}
                        {orderedQuestions.length > QUESTIONS_SHOWN ? (
                          <button type="button" className="fr-ws-quote-more fr-mono" aria-expanded={questionsAll} onClick={() => setQuestionsAll((v) => !v)} data-testid="brief-questions-show-all">
                            <span aria-hidden className="fr-ws-quote-more-caret" data-open={questionsAll ? "true" : undefined}>&rsaquo;</span>
                            {questionsAll ? WORKSPACE_STRINGS.showFewer : showAllLine(orderedQuestions.length)}
                          </button>
                        ) : null}
                        <p className="fr-ws-brief-foot fr-mono" data-testid="brief-questions-foot">{questionsFootLine(questions.length, superseded)}</p>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
          {beside ? panel : null}
        </div>
      </WorkspaceReadPage>
    </div>
  );
}

// MH1 HOME (/home) — the app screen, phase bar "Diagnose · about two weeks".
//
// PORTED FROM routes/index.tsx: the header gutter, the title row and the draggable canvas on its
// 28px dot grid.
//
// N5 (Nov 9) — THE BOTTOM SCRUBBER IS GONE. The handoff's scale carried a position thumb and the
// signed TODAY · FOCUS · FLOW marks, and it was a second way to do the one thing the segmented
// Before / Today / Ahead control already does. Two controls for one movement is one too many, and
// the scale's marks named zones the canvas does not have edges for.
//
// M1 (Nov 9) — NAVIGATION LIVES IN THE BOTTOM BAR ON THE APP SCREENS. This reverses the Nov 7
// top-nav ruling and restores the Nov 6 spec §5 and the handoff: ☰ See all · Now · Dojo · + Add on
// the left, then What changed, then the MojoScore block running to the page edge. The header keeps
// the breadcrumb and the two destinations that have one. Walk screens are untouched — Back and Next
// stay in their header, the composer and score stay in their bar.
//
// THE + ADD MENU OPENS UPWARD, because the button is now at the foot of the page. Its two targets
// are disabled (no destination in slice 1), but the menu itself is real: its strings were signed
// for this screen and have been waiting for a surface to render on.
//
// SLICE 1 DISABLES WHAT HAS NO DESTINATION (spec): See all, Dojo, the + Add targets and What changed
// are present but disabled; Now scrolls to Today. The "What changed [n]" badge is omitted because
// slice 1 has no store for n (P12) and G8 forbids a literal bracket on a live screen — the same
// treatment G3 gives a zero segment.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE, clientRefineDiagnosePath } from "@/lib/clientRefinePreview";
import { Breadcrumb, Headline, ScoreBlock } from "../walk";
import { HOME, SHARED } from "../strings";
import type { ScreenProps } from "../screens/gather";
import { Before } from "./Before";
import { Today } from "./Today";
import { Ahead } from "./Ahead";
import { SeeAll } from "./SeeAll";

type Section = "before" | "today" | "ahead";

export function HomeScreen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const navigate = useNavigate();
  const strip = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<Section>("today");
  const [dragging, setDragging] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const drag = useRef<{ x: number; left: number } | null>(null);

  /** The handoff's three targets: the start, Today CENTRED, and the canvas's far end — so "Ahead"
   *  lands on the cone's mouth, where the rings and the route names are, not on its apex. */
  const targetFor = (section: Section, el: HTMLDivElement) => {
    if (section === "before") return 0;
    if (section === "ahead") return el.scrollWidth;
    const today = el.querySelector('[data-dg-section="today"]') as HTMLElement | null;
    return today ? today.offsetLeft + today.offsetWidth / 2 - el.clientWidth / 2 : 0;
  };

  const scrollTo = useCallback((section: Section) => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: targetFor(section, el), behavior: "smooth" });
    setActive(section);
  }, []);

  // Open centred on Today, without animating there from the left edge.
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = targetFor("today", el);
  }, []);

  /** Which zone the canvas is looking at — read off the canvas, so the segmented control follows a
   *  drag as well as a click. */
  const onScroll = useCallback(() => {
    const el = strip.current;
    if (!el || el.scrollWidth === 0) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    const at = (s: Section) => {
      const n = el.querySelector(`[data-dg-section="${s}"]`) as HTMLElement | null;
      return n ? n.offsetLeft + n.offsetWidth : 0;
    };
    setActive(mid < at("before") ? "before" : mid < at("today") ? "today" : "ahead");
  }, []);

  useEffect(() => { onScroll(); }, [onScroll, data.loading]);

  return (
    <div className="dg-page" data-dg-screen="home">
      <header className="dg-header">
        <Breadcrumb company={company} phase={SHARED.phaseApp} />
        <div className="dg-nav">
          <button type="button" className="dg-nav-btn" onClick={() => navigate(clientRefineDiagnosePath(companyId, "welcome"))}>
            {HOME.walkThrough}
          </button>
          <button
            type="button"
            className="dg-nav-btn"
            style={{ opacity: 0.6 }}
            onClick={() => navigate(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/${companyId}`)}
          >
            {HOME.theFirstRead}
          </button>
        </div>
      </header>

      <div className="dg-home-head dg-enter">
        <div>
          <h1 className="dg-h dg-home-title"><Headline text={HOME.title(company)} /></h1>
          <p className="dg-lede">{HOME.lede}</p>
        </div>
        <div className="dg-seg-group">
          {([["before", HOME.segBefore], ["today", HOME.segToday], ["ahead", HOME.segAhead]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="dg-seg-btn"
              aria-pressed={active === key}
              onClick={() => scrollTo(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="dg-strip"
        ref={strip}
        data-dragging={dragging}
        onScroll={onScroll}
        onPointerDown={(e) => {
          if (!strip.current) return;
          drag.current = { x: e.clientX, left: strip.current.scrollLeft };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !strip.current) return;
          strip.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
        }}
        onPointerUp={() => { drag.current = null; setDragging(false); }}
        onPointerLeave={() => { drag.current = null; setDragging(false); }}
      >
        <Before data={data} />
        <Today data={data} />
        <Ahead data={data} />
      </div>

      <footer className="dg-bottom">
        <div className="dg-bottom-nav">
          {/* O3 — See all has a destination now: the overlay, on this same page */}
          <button type="button" className="dg-bar-btn" data-dg-seeall-open onClick={() => setSeeAllOpen(true)}>
            {HOME.seeAll}
          </button>
          <button type="button" className="dg-bar-btn" onClick={() => scrollTo("today")}>{HOME.now}</button>
          <button type="button" className="dg-bar-btn" disabled>{HOME.dojo}</button>
          <div className="dg-add">
            <button
              type="button"
              className="dg-bar-btn dg-nav-add"
              aria-expanded={addOpen}
              onClick={() => setAddOpen((v) => !v)}
            >
              {/* The glyph rides in the filled ink square; the word sits beside it. Both halves are
                * the one signed string, split on its space — no new literal enters the page. */}
              <span className="dg-nav-add-sq">
                {/* the GLYPH turns, not the square: a square rotated 45° is a diamond, and the
                  * shape law keeps the square square */}
                <span className="dg-nav-add-glyph" data-open={addOpen}>
                  {HOME.addNav.slice(0, HOME.addNav.indexOf(" "))}
                </span>
              </span>
              {HOME.addNav.slice(HOME.addNav.indexOf(" ") + 1)}
            </button>
            {addOpen ? (
              <div className="dg-add-menu" data-dg-add-menu>
                <span className="dg-mono dg-add-title">{HOME.addToTheMap}</span>
                {([[HOME.addDocument, HOME.addDocumentBody], [HOME.addPerson, HOME.addPersonBody]] as const).map(
                  ([title, body]) => (
                    <button type="button" className="dg-add-item" key={title} disabled>
                      <span className="dg-add-item-t">{title}</span>
                      <span className="dg-add-item-d">{body}</span>
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
        <button type="button" className="dg-bar-btn dg-whatchanged" disabled>
          {HOME.whatChanged}
          {/* The amber square badge, carrying nothing: slice 1 has no store for n (P12). */}
          <span className="dg-nav-badge" />
        </button>
        <ScoreBlock score={data.score?.total_score ?? null} app />
      </footer>

      {seeAllOpen ? <SeeAll data={data} onClose={() => setSeeAllOpen(false)} onGoTo={scrollTo} /> : null}
    </div>
  );
}

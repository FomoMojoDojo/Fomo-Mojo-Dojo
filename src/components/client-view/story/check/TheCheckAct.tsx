/*
 * First Read · The Check (content) — v2 slot 4 ("Where the customer agrees").
 *
 * FR-V2-1: LAZY-MINT. The Check renders with NO session (the findings, no verdicts).
 * The FIRST verdict tap mints the open session (single-flight, via the rail's
 * ensureSession) and records the verdict — no prep, no honest-empty message. A
 * proposal_issued session renders FROZEN (Gate 2). No lifecycle transitions here —
 * issuance (open → proposal_issued) is the Proposal.
 */

import { useEffect, useMemo, useState } from "react";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import type { AsyncState } from "@/hooks/useAsyncRead";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";
import SayVsSeeExhibit from "./SayVsSeeExhibit";
import OutsideRaisedSection from "./OutsideRaisedSection";
import CuratedTensionSection from "./CuratedTensionSection";
import FeaturedExhibitCard from "./FeaturedExhibitCard";
import { ThemeHeadline, ThemeMore } from "./ThemeSection";
import {
  THEME_1_HEADLINE, THEME_2_HEADLINE, THEME_3_HEADLINE,
  THEME_1_LEAD, theme2Lead, THEME_3_LEAD, NO_FEATURED_PROMPT, FEATURED_MISSING_PROMPT,
  THEME_AUTO_LEAD, FIRST_READ_OUTSIDE_FRAMING,
} from "@/lib/firstRead/themeCopy";
import { useFeaturedItems, type FeaturedPointer } from "@/hooks/useFeaturedItems";
import { useCuratedTensions } from "@/hooks/useCuratedTensions";
import { useAuth } from "@/hooks/useAuth";
import { ActData } from "../ActData";
import ActRecap from "../ActRecap";
import { CHECK_RECAP } from "../recapCopy";

// ── Client-facing copy ───────────────────────────────────────────────────────
// V2-9 SWEEP: freeze/lock/session machinery removed from room copy (the freeze still
// happens silently at issuance). PENDING OPERATOR SIGNATURE.
const FROZEN_MSG = "This read has been shared with the client.";
// ─────────────────────────────────────────────────────────────────────────────

export default function TheCheckAct({
  companyId,
  sessionId,
  ensureSession,
}: {
  companyId: string;
  sessionId: string;
  /** FR-V2-1 lazy-mint — mints the session on the first verdict tap. */
  ensureSession?: () => Promise<string>;
}) {
  const [error, setError] = useState<string | null>(null);

  const { items, tally, loading, identityError, frozen, setVerdict, deltaState } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
    ensureSession,
  );

  // The item area is gated by the identity compute (contentIdentity → crypto.subtle). On an
  // insecure origin that throws and the effect now records `identityError`; routing the area
  // through <ActData> terminates it into the signed ACT_DATA_ERROR instead of the eternal
  // "Loading items…". loading → the loading line; ready → the exhibit + check list.
  const itemArea: AsyncState<true> = identityError
    ? { status: "error", error: identityError }
    : loading
      ? { status: "loading" }
      : { status: "ready", data: true };

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  // V2-7 — the say-vs-see delta items render in the exhibit ABOVE; the non-delta findings/
  // markets/differentiators render in the Check list below. Same session/verdict/tally.
  const deltaItems = useMemo(() => items.filter((i) => i.kind === "delta"), [items]);
  // Option B — the internally_silent items partition OUT of the say-vs-see exhibit (which is
  // say-anchored, three groups) into their own observed-anchored section below it.
  const sayVsSeeItems = useMemo(
    () => deltaItems.filter((i) => i.delta?.deltaType !== "internally_silent"),
    [deltaItems],
  );
  const outsideRaisedItems = useMemo(
    () => deltaItems.filter((i) => i.delta?.deltaType === "internally_silent"),
    [deltaItems],
  );
  const checkItems = useMemo(() => items.filter((i) => i.kind !== "delta"), [items]);

  // ROLLUP Gate 2 — per-theme featured item (operator-picked, content-identity anchored). The
  // picker + absent/missing prompts are ADMIN-only (presenter surface); a client sees only the
  // featured card + the "…and N more" tail. A pointer that no longer resolves (item struck /
  // re-worded / rebuilt) renders NOTHING for the slot and flags the internal surface — never a
  // stale ghost.
  const { isAdmin } = useAuth();
  // AMENDMENT 1: ratify-in-place stays in the hook but renders NO control — featuring another item
  // is the only visible action, so `ratify` is intentionally not destructured here.
  const { featured, feature, ensureDefaults } = useFeaturedItems(companyId);
  // Theme-1 ordering: a live curated tension WINS over a say-vs-see featured pointer.
  const { render: curatedRender } = useCuratedTensions(companyId);

  // Gate 2.5 — rail-open lazy: the presenter (admin) triggers the auto-default compute once. The
  // edge function writes origin='auto'/'auto_judged' pointers ONLY where none live (never operator).
  useEffect(() => { if (isAdmin) void ensureDefaults(); }, [isAdmin, ensureDefaults]);

  const featuredSayVsSee = useMemo(() => {
    const id = featured.say_vs_see?.itemIdentity;
    return id ? sayVsSeeItems.find((i) => i.identity === id) ?? null : null;
  }, [featured, sayVsSeeItems]);
  const featuredOutside = useMemo(() => {
    const id = featured.outside_raised?.itemIdentity;
    return id ? outsideRaisedItems.find((i) => i.identity === id) ?? null : null;
  }, [featured, outsideRaisedItems]);
  const featuredFinding = useMemo(() => {
    const id = featured.findings?.itemIdentity;
    return id ? checkItems.find((i) => i.identity === id) ?? null : null;
  }, [featured, checkItems]);
  // Pointer set but unresolved → the item vanished (internal flag, never a client ghost).
  const outsideMissing = !!featured.outside_raised && !featuredOutside;
  const findingsMissing = !!featured.findings && !featuredFinding;
  // The tail excludes the featured item, so "…and N more" counts the rest.
  const sayVsSeeRest = useMemo(
    () => (featuredSayVsSee && !curatedRender ? sayVsSeeItems.filter((i) => i.identity !== featuredSayVsSee.identity) : sayVsSeeItems),
    [sayVsSeeItems, featuredSayVsSee, curatedRender],
  );
  const outsideRest = useMemo(
    () => (featuredOutside ? outsideRaisedItems.filter((i) => i.identity !== featuredOutside.identity) : outsideRaisedItems),
    [outsideRaisedItems, featuredOutside],
  );
  const checkRest = useMemo(
    () => (featuredFinding ? checkItems.filter((i) => i.identity !== featuredFinding.identity) : checkItems),
    [checkItems, featuredFinding],
  );

  // Render a theme's featured lead + card. Choice-language lead renders ONLY for origin='operator';
  // an auto/auto_judged default renders the NEUTRAL THEME_AUTO_LEAD. AMENDMENT 1/2: no meta-line, no
  // ratify button — the default renders quietly; the judge's one-line reason (auto_judged) still
  // shows to the presenter in the italic meta style. signedLead is optional.
  const renderFeatured = (
    pointer: FeaturedPointer | undefined,
    item: CheckItem | null,
    signedLead: string | undefined,
  ) => {
    if (!pointer || !item) return null;
    const lead = pointer.origin === "operator" ? signedLead : THEME_AUTO_LEAD;
    return (
      <>
        {lead && <p className="cvs-theme-lead">{lead}</p>}
        <FeaturedExhibitCard item={item} />
        {isAdmin && pointer.judgeReason && <p className="cvs-theme-origin-note">{pointer.judgeReason}</p>}
      </>
    );
  };

  return (
    <div className="cvs-fr-check">
      {/* V2-9 SWEEP: the raw session-id/status bar (machinery) is removed from room copy. */}
      <CheckTally tally={tally} />

      {/* PROVENANCE GATE — the First Read is the outside view; renders once, at the opening. */}
      <p className="cvs-outside-framing">{FIRST_READ_OUTSIDE_FRAMING}</p>

      {/* ROLLUP (Gate 1): three themed overviews, not a wall of per-item batteries. THEME 1's
          featured exhibit is the curated single-instance tension — its own read
          (useCuratedTensions), independent of the verdict machinery; renders nothing when there is
          no live curated row. Kept ABOVE the item-area gate so it stays resilient (it needs no item
          identities), exactly as before. Featured pickers for themes 2/3 arrive in Gate 2; the
          batteries inside the tails come off in Gate 3. */}
      <ThemeHeadline>{THEME_1_HEADLINE}</ThemeHeadline>
      <CuratedTensionSection companyId={companyId} />

      {frozen && <p className="cvs-check-frozen">{FROZEN_MSG}</p>}
      {error && !frozen && <p className="cvs-check-refusal">{error}</p>}

      {/* GATE (honest identity-compute): the item area terminates into the signed error on an
          identity-compute failure (crypto.subtle undefined on an insecure origin), never an
          eternal loading string. loading → "Loading items…"; error → ACT_DATA_ERROR. */}
      <ActData state={itemArea} loading={<p className="cvs-support">Loading items…</p>}>
        {() => (
          <>
            {/* THEME 1 fallback (Gate 2.5): when NO live curated tension, a say-vs-see featured
                pointer (auto or operator) leads instead. Curated wins when present. */}
            {!curatedRender && renderFeatured(featured.say_vs_see, featuredSayVsSee, THEME_1_LEAD)}

            {/* THEME 1 tail — say-vs-see, collapsed behind "…and N more like this". GATE B: gated
                on the delta read's honest state. A FAILED or never-returning delta read renders the
                signed error via <ActData>, NOT the three signed group-empty lines, which are only
                reachable in the ready branch. deltaItems carry the verdict join from `items`. */}
            <ThemeMore count={sayVsSeeRest.length}>
              <ActData state={deltaState} loading={null}>
                {() => <SayVsSeeExhibit items={sayVsSeeRest} onSet={onSet} disabled={frozen} />}
              </ActData>
            </ThemeMore>

            {/* THEME 2 — outside-raised. Leads with the operator-picked featured exhibit (Gate 2)
                + lead line; the rest collapse behind "…and N more". The section is INSIDE the delta
                ready branch, so its honest-empty string is unreachable on a failed/pending read. */}
            <ThemeHeadline>{THEME_2_HEADLINE}</ThemeHeadline>
            {renderFeatured(featured.outside_raised, featuredOutside, theme2Lead(outsideRaisedItems.length))}
            {isAdmin && !featuredOutside && (
              <p className="cvs-theme-internal-prompt">{outsideMissing ? FEATURED_MISSING_PROMPT : NO_FEATURED_PROMPT}</p>
            )}
            <ThemeMore count={outsideRest.length}>
              <ActData state={deltaState} loading={null}>
                {() => (
                  <OutsideRaisedSection
                    items={outsideRest}
                    onSet={onSet}
                    disabled={frozen}
                    showHeading={false}
                    onFeature={isAdmin ? (it) => void feature("outside_raised", it.identity) : undefined}
                  />
                )}
              </ActData>
            </ThemeMore>

            {/* THEME 3 — what we found (findings; differentiators fold in as the closing list).
                Leads with the operator-picked featured finding (Gate 2) + lead line. */}
            <ThemeHeadline>{THEME_3_HEADLINE}</ThemeHeadline>
            {renderFeatured(featured.findings, featuredFinding, THEME_3_LEAD)}
            {isAdmin && !featuredFinding && (
              <p className="cvs-theme-internal-prompt">{findingsMissing ? FEATURED_MISSING_PROMPT : NO_FEATURED_PROMPT}</p>
            )}
            <ThemeMore count={checkRest.length}>
              {checkRest.length === 0 ? (
                <p className="cvs-support">No other checkable items surfaced for this company yet.</p>
              ) : (
                <div className="cvs-check-list">
                  {checkRest.map((item) => (
                    <CheckItemRow
                      key={item.identity}
                      item={item}
                      onSet={onSet}
                      disabled={frozen}
                      onFeature={isAdmin ? () => void feature("findings", item.identity) : undefined}
                    />
                  ))}
                </div>
              )}
            </ThemeMore>
          </>
        )}
      </ActData>
      {/* Name-the-moves recap — suppressed when there is nothing to check (items === 0). */}
      <ActRecap recap={CHECK_RECAP} hasContent={items.length > 0} />
    </div>
  );
}

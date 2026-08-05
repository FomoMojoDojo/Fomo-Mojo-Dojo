import { useCompany } from "@/hooks/useCompany";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import type { PositioningItem } from "@/lib/types";
import ActDefinition from "@/components/client-view/story/ActDefinition";

/*
 * MPD-3 — Act B: the positioning we can see (Outside MovementShell, INFERRED
 * lane — same register as Act A). A pure client render of PRE-COMPUTED proof
 * tiers stamped at generation by judgeAttributeEvidence; no judge, no model, no
 * write happens here.
 *
 * Signed render rulings (do not re-litigate):
 * - DIFFERENTIATORS ONLY (item.unique_attributes). Category/value/best-fit/
 *   tagline/competitive_alternatives carry no proof tier and are NOT rendered —
 *   they would read as false confidence beside the tiered content.
 * - FRAMING, NOT CHIPS: partition by evidence_status into grouped sections with
 *   headers (Act A's "honesty lives in framing" precedent). No per-item badge.
 * - THREE STATES, evidence_status is the ONLY leak guard. ONLY 'corroborated'
 *   may read as outside-backed. 'self_reported' → yours-to-prove; anything else
 *   (undefined/absent — absence of a verdict is NOT a verdict) → its own
 *   "not yet checked" group, NEVER folded into yours-to-prove.
 * - NO basis_urls to the client: corroborated gets the framing only; the citing
 *   URLs stay internal. Never print a raw URL on this surface.
 * - Honest-empty: no market_read canvas OR zero differentiators → "not read yet"
 *   + operator-directed, NEVER a fabricated position.
 */

// ── Client-facing copy — SIGNED AS-IS 2026-07-16 (Act B copy) ────────────────
const EYEBROW = "ACT B · THE POSITION WE CAN SEE";
const HEADLINE = "What you claim only you offer";
const CORROBORATED_HEAD = "Echoed by outside voices";
const CORROBORATED_SUB = "We found these repeated back in what we've read.";
const SELF_REPORTED_HEAD = "Yours to prove";
const SELF_REPORTED_SUB = "You claim these — we haven't found them repeated in what we've read.";
const NOT_CHECKED_HEAD = "Not yet checked";
const NOT_CHECKED_SUB = "We haven't tested these against outside voices.";
const EMPTY_HEADLINE = "We haven't read your positioning yet.";
const EMPTY_SUB = "Once a public read lands, the strengths we can see will show here.";
// ─────────────────────────────────────────────────────────────────────────────

// ── Definitional copy — OPERATOR-SIGNED VERBATIM 2026-07-20 (DEF-1) ──────────
// Defines "differentiator" ONLY. It must NEVER restate or paraphrase the
// proof-tier group headers below (corroborated / yours-to-prove / not-yet-
// checked) — those carry their own signed framing, and duplicating the proof
// signal here would undercut FRAMING-NOT-CHIPS by sounding it twice.
// Suppressed on honest-empty by ActDefinition — see that file's header.
const DEFINITION =
  "A differentiator is something you claim that, as far as the record shows, only you offer.";
// ─────────────────────────────────────────────────────────────────────────────

type Group = { key: "corroborated" | "self_reported" | "not_checked"; head: string; sub: string; items: PositioningItem[] };

function AttrGroup({ group }: { group: Group }) {
  if (group.items.length === 0) return null;
  return (
    <div className={`cvs-mv-posgroup is-${group.key}`}>
      <p className="cvs-mv-posgroup-head">{group.head}</p>
      <p className="cvs-mv-posgroup-sub">{group.sub}</p>
      <ul className="cvs-mv-poslist">
        {group.items.map((a) => (
          <li className="cvs-mv-posattr" key={a.id}>
            <p className="cvs-mv-posattr-name">{a.name}</p>
            {a.description ? <p className="cvs-mv-posattr-desc">{a.description}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// V2-5 — `bare` suppresses this act's own eyebrow when it renders INSIDE an Act 3 band.
export default function PositionAct({ bare = false }: { bare?: boolean } = {}) {
  const { activeCompany } = useCompany();
  const { loading, item } = usePositioningCanvas(activeCompany?.id);

  const attrs = item?.unique_attributes ?? [];
  // Leak guard: ONLY an exact 'corroborated' verdict may read as outside-backed.
  // Everything that is neither corroborated nor self_reported (undefined/absent,
  // or any unexpected value) falls to "not yet checked" — never to yours-to-prove.
  const groups: Group[] = [
    { key: "corroborated", head: CORROBORATED_HEAD, sub: CORROBORATED_SUB, items: attrs.filter((a) => a.evidence_status === "corroborated") },
    { key: "self_reported", head: SELF_REPORTED_HEAD, sub: SELF_REPORTED_SUB, items: attrs.filter((a) => a.evidence_status === "self_reported") },
    { key: "not_checked", head: NOT_CHECKED_HEAD, sub: NOT_CHECKED_SUB, items: attrs.filter((a) => a.evidence_status !== "corroborated" && a.evidence_status !== "self_reported") },
  ];

  return (
    <section className="cvs-act" aria-label="Act B — positioning (inferred register)">
      {!bare && <p className="cvs-act-eyebrow">{EYEBROW}</p>}
      {/* Content-gated: no canvas, zero differentiators, or still loading →
          no definition. Mirrors the render condition of the branch below. */}
      <ActDefinition
        definition={DEFINITION}
        hasContent={!loading && item !== null && attrs.length > 0}
      />

      {loading ? (
        <p className="cvs-hero-empty">Reading your positioning…</p>
      ) : item === null || attrs.length === 0 ? (
        <div className="cvs-mv-empty">
          <p className="cvs-mv-empty-headline">{EMPTY_HEADLINE}</p>
          {/* Operator-directed, NOT a client-clickable run affordance. */}
          <p className="cvs-mv-empty-prompt">{EMPTY_SUB}</p>
        </div>
      ) : (
        <>
          <p className="cvs-support" style={{ marginTop: 0 }}>{HEADLINE}</p>
          <div className="cvs-mv-posgroups">
            {groups.map((g) => (
              <AttrGroup group={g} key={g.key} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useIndustryReferenceMaps, type ReferenceMap } from "@/hooks/useIndustryReferenceMaps";

/*
 * FD-3 — FrontDoorMapAct: the cold-open industry-standard job-map act.
 *
 * The standard, shown true-by-reference BEFORE a company shares anything. It is
 * NOT a reading of the company (FD-1 wall) — it is the published standard shape of
 * the industry's customer job. No consistency scoring, no register, no company
 * data beyond the auto-select key.
 *
 * AUTO-SELECT: companies.industry_key is matched EXACTLY against the published
 * industry_key set. A match renders that map with NO picker. No match → the
 * operator-only fallback selector (published industries only). NEVER fuzzy: a
 * mismatch falls back, never renders a wrong map.
 *
 * Mounts inside StandardsShell at the TOP of the Outside phase and STANDS there —
 * it never collapses when company data exists (operator ruling).
 */

// ── Client-facing copy — OPERATOR-SIGNED VERBATIM (FD-3) ─────────────────────
const ACT_EYEBROW = "How this job is done — the standard shape";
const ACT_SUB =
  "The standard way your industry's customer gets this job done — a reference model on the Jobs-to-be-Done framework, the same for everyone. Not a reading of your business.";
// Attribution is STRUCTURAL (referenceLibrary contract) — always printed when a
// map renders. {taxonomy_version} is interpolated from the map's own row. This is
// method-attribution, not a publisher claim: the maps are generated on the JTBD/
// ODI framework, not transcribed from an external published work.
const attributionLine = (taxonomyVersion: string | null) =>
  `Reference model · Jobs-to-be-Done / ODI framework · ${taxonomyVersion ?? "unversioned"}`;
// ─────────────────────────────────────────────────────────────────────────────

// ── Fallback-state copy — PROPOSED (operator first-real-use look) ────────────
const FALLBACK_PROMPT = "No standard map matched this company's industry yet. Choose one:";
const DEFENSIVE_EMPTY = "That industry map isn't published yet.";
// ─────────────────────────────────────────────────────────────────────────────

function MapBody({ map }: { map: ReferenceMap }) {
  return (
    <div className="cvs-std-map">
      <ol className="cvs-std-steps">
        {map.steps.map((s) => (
          <li className="cvs-std-step" key={s.step_number}>
            <span className="cvs-std-step-num">{s.step_number}</span>
            <div className="cvs-std-step-body">
              <p className="cvs-std-step-label">{s.step_label}</p>
              <p className="cvs-std-step-desc">{s.description}</p>
            </div>
          </li>
        ))}
      </ol>
      {/* Attribution — always printed on a rendered map (structural warrant). */}
      <p className="cvs-std-attribution">{attributionLine(map.taxonomy_version)}</p>
    </div>
  );
}

export default function FrontDoorMapAct() {
  const { activeCompany } = useCompany();
  const { maps, keys, loading } = useIndustryReferenceMaps();
  const [fallbackKey, setFallbackKey] = useState<string | null>(null);

  // EXACT match only — never fuzzy. A key not in the published set → no match.
  const companyKey = activeCompany?.industry_key ?? null;
  const matched = companyKey && maps.has(companyKey) ? maps.get(companyKey)! : null;
  const selected = matched ?? (fallbackKey ? maps.get(fallbackKey) ?? null : null);

  return (
    <section className="cvs-std-act" aria-label="Industry-standard job map">
      <p className="cvs-std-act-eyebrow">{ACT_EYEBROW}</p>
      <p className="cvs-std-act-sub">{ACT_SUB}</p>

      {loading ? (
        <p className="cvs-std-empty">Loading the standard map…</p>
      ) : keys.length === 0 ? (
        // Defensive: no published maps exist at all. Should be unreachable.
        <p className="cvs-std-empty">{DEFENSIVE_EMPTY}</p>
      ) : selected ? (
        // Matched (auto-select) OR fallback-picked. In the matched state NO
        // picker renders — the map stands alone.
        <>
          {!matched ? (
            <FallbackSelector keys={keys} maps={maps} value={fallbackKey} onChange={setFallbackKey} />
          ) : null}
          <MapBody map={selected} />
        </>
      ) : (
        // No company match and nothing picked yet → the fallback selector only.
        <FallbackSelector keys={keys} maps={maps} value={fallbackKey} onChange={setFallbackKey} />
      )}
    </section>
  );
}

// Operator-only fallback selector — lists PUBLISHED industries only. Renders
// solely in the no-match state; never in the matched state.
function FallbackSelector({
  keys, maps, value, onChange,
}: {
  keys: string[];
  maps: Map<string, ReferenceMap>;
  value: string | null;
  onChange: (k: string | null) => void;
}) {
  return (
    <div className="cvs-std-fallback">
      <label className="cvs-std-fallback-prompt" htmlFor="cvs-std-fallback-select">{FALLBACK_PROMPT}</label>
      <select
        id="cvs-std-fallback-select"
        className="cvs-std-fallback-select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">—</option>
        {keys.map((k) => (
          <option value={k} key={k}>{maps.get(k)?.industry_label ?? k}</option>
        ))}
      </select>
    </div>
  );
}

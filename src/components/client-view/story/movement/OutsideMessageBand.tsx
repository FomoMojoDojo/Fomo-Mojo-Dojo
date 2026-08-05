// V2-5 — Act 3 "Message" band: how the OUTSIDE describes the company (public perception).
//
// REGISTER LOCK (the render IS the guard): every claim passes isPublicProvenance before
// it renders — an internal_declared claim is excluded here (that contrast is Act 4's job).
// A plain list of the public record's own descriptions; no URLs, no framework names, no
// bars. Honest-absence when no public claim survives the guard.
import { useCompany } from "@/hooks/useCompany";
import { useOutsidePerception, type PerceptionClaim } from "@/hooks/useOutsidePerception";
import { type AsyncState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";
import { isPublicProvenance } from "@/lib/registerGuard";
import { outsideBand } from "@/lib/firstRead/outsideBands";
import { splitPerception } from "@/lib/firstRead/perceptionGuard";
import { dedupeByContainment } from "@/lib/firstRead/outsideCollapse";

// Light formatting only (matches the findings acts): capitalize + terminal punctuation.
function formatStatement(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…"']$/.test(cased) ? cased : `${cased}.`;
}

export default function OutsideMessageBand() {
  const { activeCompany } = useCompany();

  // GATE B — the read's honest outcome (10s deadline + error) comes from useOutsidePerception,
  // reconstructed here into a discriminated AsyncState and gated through <ActData>. A failed or
  // never-returning query renders the signed error, NOT the signed honest-absence line
  // "We haven't found this company described in its own words." (which is reachable only in the
  // ready branch, on a successful zero-row read — byte-identical to before).
  const { claims, loading, error } = useOutsidePerception(activeCompany?.id);
  const state: AsyncState<PerceptionClaim[]> =
    error != null ? { status: "error", error }
    : loading ? { status: "loading" }
    : { status: "ready", data: claims };

  return (
    <ActData state={state} loading={<p className="cvs-hero-empty">Reading how the outside describes you…</p>}>
      {(claims) => {
        // Render-boundary register lock: public_observed only, internal_declared blocked.
        const publicClaims = claims.filter((c) => isPublicProvenance(c.provenance));
        // V2-5b — data-borne exclusions: framework tokens (ODI/JTBD) and analytic voice never
        // reach this band even when mislabeled public_observed. Excluded rows are reported for
        // upstream fixing (dev console). Then near-duplicates collapse to the fuller variant.
        const { admitted, excluded } = splitPerception(publicClaims, (c) => c.statement);
        if (excluded.length > 0 && typeof console !== "undefined") {
          // V2-5c — newborns from analysis now carry provenance='analytic' (blocked upstream by
          // isPublicProvenance), so anything excluded HERE is a public_observed row: a LEGACY
          // mislabel (born before V2-5c, birth-immutable) that this guard covers. A NON-legacy
          // anomaly would be a genuinely public row that happens to trip the guard — worth a look.
          console.info("[Act3 Message] excluded from a public_observed row (legacy mislabel — pre-V2-5c, immutable; guard covers):",
            excluded.map((e) => ({ id: e.item.id, reason: e.reason, text: e.item.statement })));
        }
        const shown = dedupeByContainment(admitted, (c) => c.statement);

        // Genuine no-data case — byte-identical to pre-Gate-B: the signed honest-absence
        // line renders ONLY here, on a SUCCESSFUL query that returned zero public claims.
        if (shown.length === 0) {
          return <p className="cvs-hero-empty cvs-ob-empty">{outsideBand("message").empty}</p>;
        }

        return (
          <ul className="cvs-ob-msglist">
            {shown.map((c) => (
              <li className="cvs-ob-msg" key={c.id}>{formatStatement(c.statement)}</li>
            ))}
          </ul>
        );
      }}
    </ActData>
  );
}

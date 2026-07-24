// V2-5 — Act 3 "Message" band: how the OUTSIDE describes the company (public perception).
//
// REGISTER LOCK (the render IS the guard): every claim passes isPublicProvenance before
// it renders — an internal_declared claim is excluded here (that contrast is Act 4's job).
// A plain list of the public record's own descriptions; no URLs, no framework names, no
// bars. Honest-absence when no public claim survives the guard.
import { useCompany } from "@/hooks/useCompany";
import { useOutsidePerception } from "@/hooks/useOutsidePerception";
import { isPublicProvenance } from "@/lib/registerGuard";
import { outsideBand } from "@/lib/firstRead/outsideBands";

// Light formatting only (matches the findings acts): capitalize + terminal punctuation.
function formatStatement(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const cased = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…"']$/.test(cased) ? cased : `${cased}.`;
}

export default function OutsideMessageBand() {
  const { activeCompany } = useCompany();
  const { claims, loading } = useOutsidePerception(activeCompany?.id);

  // Render-boundary register lock: public_observed only, internal_declared blocked.
  const publicClaims = claims.filter((c) => isPublicProvenance(c.provenance));

  if (loading) return <p className="cvs-hero-empty">Reading how the outside describes you…</p>;
  if (publicClaims.length === 0) {
    return <p className="cvs-hero-empty cvs-ob-empty">{outsideBand("message").empty}</p>;
  }

  return (
    <ul className="cvs-ob-msglist">
      {publicClaims.map((c) => (
        <li className="cvs-ob-msg" key={c.id}>{formatStatement(c.statement)}</li>
      ))}
    </ul>
  );
}

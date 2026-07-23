// FR-V2-1 — the honest placeholder for a v2 act whose content isn't built yet.
// Renders an operator-facing "under construction" line and NO fabricated client
// substance (absence-is-honest). Copy is PENDING OPERATOR SIGNATURE.

const UNDER_CONSTRUCTION = "This part of the read is still being built.";

export default function ActUnderConstruction() {
  return <p className="cvs-support cvs-fr-underconstruction">{UNDER_CONSTRUCTION}</p>;
}

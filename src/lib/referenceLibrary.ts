/*
 * EOV-1 — the shared REFERENCE-LIBRARY contract (design gate: Elements of Value,
 * 2026-07-20).
 *
 * Reference/framework data is published taxonomy content shown AS the standard —
 * true-by-reference. It is NOT company data and must be INCAPABLE of entering the
 * corroboration/claims machinery. The FD-1 migration
 * (20260717060000_industry_reference_job_maps.sql) states that law for the
 * DB-resident half of this class; this module is the TS-resident half.
 *
 * The wall here is achieved by having no schema at all: a static constant has no
 * company_id to add by accident and no join to write. What the two halves share
 * is not a store — it is this contract:
 *
 *   * REFERENCE_PROVENANCE — the SAME literal the FD-1 CHECK constraint pins. One
 *     greppable token for "true-by-reference, never scored", spanning table and
 *     constant alike.
 *   * ReferenceAttribution — attribution is STRUCTURAL, not copy. A reference
 *     surface with no visible source has no warrant to call itself the standard,
 *     so the render contract takes attribution as data and always prints it.
 *
 * Nothing in this module may carry: company_id, source_url, host, verdict,
 * distinct_host_count, score, or any consistency tier. If a field like that is
 * ever wanted here, the content is not reference data.
 */

/** The exact provenance literal pinned by the FD-1 migration's CHECK constraint. */
export const REFERENCE_PROVENANCE = "industry_standard_reference" as const;

export type ReferenceProvenance = typeof REFERENCE_PROVENANCE;

/**
 * Publication credit for a reference library. Rendered on-surface, verbatim —
 * never a tooltip, never a footnote. This is the warrant, not decoration.
 */
export type ReferenceAttribution = {
  /** Publishing body, e.g. "Bain & Company". */
  source: string;
  /** The published work, e.g. '"The Elements of Value", Harvard Business Review, 2016'. */
  publication: string;
  /** Optional canonical link. Never rendered as a raw URL in the client register. */
  url?: string;
  /** Optional note on how/when the taxonomy was transcribed. */
  retrievedNote?: string;
};

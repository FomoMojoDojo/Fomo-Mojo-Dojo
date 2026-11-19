// Single-source external-admissible provenance (operator ruling, 2026-06-18).
//
// Law: anything in the system is INTERNAL — including operator-curated `manual`,
// generated `framework_adjudicated`, and `odi_survey` customer data. The only
// public action is crawling public data; internal content may be COMPARED against
// public but NEVER sent on an external (OpenAI) run, now or under a future hosted
// private model. So only PUBLIC-derived provenance may cross an external boundary.
//
// This set is the ONE authority consumed by BOTH driftExternalGate and
// strategyArtifactGate, so the two external gates can never silently diverge.
// NULL is not a member → fail-closed (unproven provenance never goes external).
export const EXTERNAL_ADMISSIBLE_PROVENANCE = new Set([
  "public_research",
  "public_baseline",
]);

// ── OPERATOR AUTHORSHIP (ruling Q3, 2026-11-06) ───────────────────────────────
//
// A provenance LABEL does not know who typed the row. saveManualEdit stamped
// `source='manual_inline'` — a REGEN-protection marker, not an authorship flag — and left
// provenance_type alone, so four Edgewood rows and one FomoMojoDojo row sat stamped
// `public_research` while carrying operator prose, and both external gates admitted them.
// `operator_edited_at` is the authorship flag. Non-NULL ⇒ operator-authored material ⇒ never
// external, whatever the provenance says. provenance_type is NOT restamped (out of scope).
//
// THE FLAG IS AN ARGUMENT, NOT AN OPTION. Every predicate below takes it explicitly and every
// caller must supply it: a defaulted parameter would fail OPEN the moment a new consumer forgot
// to select the column, which is the exact failure mode this ruling exists to close.
//
// XOR IS PRESERVED BY CONSTRUCTION. Each local predicate is the literal negation of its external
// twin, flag included, so an operator-edited public row does not fall through both lanes and
// vanish — it moves to the LOCAL lane and is still judged, just never by an outside model.
/** Non-NULL, non-blank ⇒ the row carries operator authorship. */
export function isOperatorEdited(operatorEditedAt: string | null | undefined): boolean {
  return typeof operatorEditedAt === "string" && operatorEditedAt.trim().length > 0;
}

// ── Subject partition (LOCAL LANE, 2026-06-18) ────────────────────────────────
// Every subject surface carries a provenance_type from this enum (or NULL). The
// six enum values, single-sourced here so the partition below is provably total.
export const PROVENANCE_TYPE_ENUM = [
  "public_research",
  "framework_adjudicated",
  "odi_survey",
  "manual",
  "internal_declared",
  "internal_hypothesis",
] as const;

// `public_baseline` is in EXTERNAL_ADMISSIBLE_PROVENANCE but is a strategy
// artifact_role / public_baselines concept — it is NOT a member of
// provenance_type_enum, so it never appears as a SUBJECT provenance and is
// excluded from this subject partition. On the gated subject tables the only
// external-admissible enum value is `public_research`.
export const EXTERNAL_ADMISSIBLE_ON_ENUM = PROVENANCE_TYPE_ENUM.filter((p) =>
  EXTERNAL_ADMISSIBLE_PROVENANCE.has(p)
); // → ["public_research"]

// THERE IS NO ENUMERATED LOCAL SET, AND ONE MUST NOT BE RE-CREATED (SP-432, 2026-11-19).
//
// `LOCAL_LANE_PROVENANCE` stood here: the enum complement of the external-admissible set. It was
// deleted because it had NO READER anywhere in the tree — not one call site, not one test — and it
// was already wrong: it was derived from PROVENANCE_TYPE_ENUM, which lists 6 of the DB enum's 9
// values (`client_attested`, `market_interviewed` and `file_derived` were absent, and
// `client_attested` is live on 6 odi_needs rows). A dead export whose only possible future use is as
// an admission test is a trap: used that way it would have silently withheld every row carrying one
// of the three missing values.
//
// The local lane needs no such set, because it is decided by LITERAL NEGATION:
// `isSubjectLocalAdmissible` is `!isSubjectExternallyAdmissible(...)` and `isCascadeLocalAdmissible`
// is `!isCascadeExternallyAdmissible(...)`. That is a stronger guarantee than an enumerated
// complement — every row is admitted by exactly one lane BY CONSTRUCTION, including a NULL
// provenance, an operator-edited row, and any enum value added after this comment was written.

// ── A need is public only by its SOURCE (B1, operator ruling 2026-11-15) ──────
//
// The SP-346 / SP-349 / F1 rule, for odi_needs. A provenance LABEL is a claim about the row; the
// source columns say what the row rests on. The upload dialog stamped needs derived from a
// third-party document `public_research`, and every need gate admitted them on the label alone, so
// a private upload's content could reach OpenAI through six click-started functions (hold H4).
//
// ALLOWLIST POLARITY, as SP-346: a need is public by source ONLY when its source_path is a known
// public value — every live public need carries the column default 'public_research' — and nothing
// links it to an interview, an intake or a file analysis. Anything else is private: a storage path,
// 'interview', 'intake.quiz', any free text, NULL, and a column the caller never SELECTED (undefined),
// so a consumer that forgets the columns fails CLOSED. The upload markers below are belt and braces
// for a row whose source_path was left at its default.
export const NEED_SOURCE_COLUMNS = [
  "source_path", "step_label", "frameworks_used", "interview_record_id", "source_proposal_id",
] as const;
const PUBLIC_NEED_SOURCE_PATHS: ReadonlySet<string> = new Set(["public_research"]);
const UPLOAD_STEP_LABEL_PREFIXES = ["Upload-derived", "Reanalyzed existing file"] as const;
const UPLOAD_FRAMEWORK_MARKS: ReadonlySet<string> = new Set(["Local Upload Analysis", "Existing File Reanalysis"]);

/** True when the need rests on private material (an upload, an interview, an intake, a file
 *  analysis) or its source cannot be read. Unknown ⇒ private. */
export function needRestsOnPrivateSource(row: Record<string, unknown> | null | undefined): boolean {
  if (!row || typeof row !== "object") return true;
  for (const col of NEED_SOURCE_COLUMNS) {
    if (!(col in row) || row[col] === undefined) return true;   // not selected ⇒ unknown ⇒ private
  }
  if (row.interview_record_id != null) return true;
  if (row.source_proposal_id != null) return true;
  if (typeof row.source_path !== "string" || !PUBLIC_NEED_SOURCE_PATHS.has(row.source_path)) return true;
  const label = typeof row.step_label === "string" ? row.step_label : "";
  if (UPLOAD_STEP_LABEL_PREFIXES.some((p) => label.startsWith(p))) return true;
  const frameworks = Array.isArray(row.frameworks_used) ? row.frameworks_used : [];
  if (frameworks.some((f) => UPLOAD_FRAMEWORK_MARKS.has(String(f)))) return true;
  return false;
}

// ── Need rows (Gate 0, operator ruling 2026-09-16) ────────────────────────────
// The ONE predicate for an odi_needs row entering an OpenAI payload as CONTEXT
// (propose-positioning-changes, propose-cascade-changes, council-review — the
// three collectors that used to send every row on the company). Allowlist
// polarity: only an explicitly external-admissible provenance passes; NULL, every
// internal enum value, and any value that does not exist yet are withheld.
// Consumers filter at the collection point and report the withheld count —
// omission is visible, never silent.
// Q3 (2026-11-06): also withheld when the row carries operator authorship. Row-shaped, so a
// consumer that selects the row gets the flag for free — but a consumer that does NOT select
// operator_edited_at reads undefined and would fail open, so the need-row collectors must select
// it. src/lib/operatorEditedSelectGate.test.ts asserts the column is in every gated select list.
export function isExternalAdmissibleNeed(
  row: { provenance_type?: unknown; operator_edited_at?: unknown } | null | undefined,
): boolean {
  // B1 (2026-11-16): the SOURCE is tested first — a need resting on an upload, an interview or an
  // intake is private whatever its marking says, and a row without its source columns is private.
  if (needRestsOnPrivateSource(row as Record<string, unknown> | null | undefined)) return false;
  const p = row?.provenance_type;
  const edited = row?.operator_edited_at;
  if (isOperatorEdited(typeof edited === "string" ? edited : edited == null ? null : String(edited))) return false;
  return typeof p === "string" && EXTERNAL_ADMISSIBLE_PROVENANCE.has(p);
}

/** The subject (route / need / opportunity) EXTERNAL test — the one authority, flag included. */
export function isSubjectExternallyAdmissible(
  provenance: string | null | undefined,
  operatorEditedAt: string | null | undefined,
): boolean {
  if (isOperatorEdited(operatorEditedAt)) return false;   // operator-authored → never external
  return provenance != null && EXTERNAL_ADMISSIBLE_PROVENANCE.has(String(provenance));
}

export function isSubjectLocalAdmissible(
  provenance: string | null | undefined,
  operatorEditedAt: string | null | undefined,
): boolean {
  // The LITERAL negation of the external test — NULL provenance, every internal enum value, any
  // unknown value, AND every operator-edited row land here. Local is where a refused row is still
  // judged; nothing falls through both lanes.
  return !isSubjectExternallyAdmissible(provenance, operatorEditedAt);
}

// ── Cascade partition (Phase 3a) ──────────────────────────────────────────────
// The cascade SUBJECT external gate keys on BOTH artifact_role AND provenance (a
// cascade goes external only as the public market_read read). This is the ONE
// authority for that test — consumed by strategyArtifactGate (external) and NEGATED
// by gateCascadeSubjectForLocal (local), so the cascade XOR partition holds by
// construction (one predicate, never a re-typed boolean that can drift — the same
// one-authority law as the single identity hash).
// Q3 (2026-11-06): operatorEditedAt joins role and provenance as a third REQUIRED dimension. An
// operator-edited market_read/public_research cascade — Edgewood 00f9d893, FomoMojoDojo b9f2318b —
// is refused here and judged on the local lane instead.
export function isCascadeExternallyAdmissible(
  artifactRole: string | null | undefined,
  provenance: string | null | undefined,
  operatorEditedAt: string | null | undefined,
): boolean {
  if (isOperatorEdited(operatorEditedAt)) return false;
  return String(artifactRole ?? "") === "market_read"
    && provenance != null
    && EXTERNAL_ADMISSIBLE_PROVENANCE.has(String(provenance));
}

// Local-admit is the LITERAL negation — every cascade row is admitted by exactly one
// lane (externalAdmit XOR cascadeLocalAdmit), never neither, never both.
export function isCascadeLocalAdmissible(
  artifactRole: string | null | undefined,
  provenance: string | null | undefined,
  operatorEditedAt: string | null | undefined,
): boolean {
  return !isCascadeExternallyAdmissible(artifactRole, provenance, operatorEditedAt);
}

// InterviewCaptureForm (gate 4, operator rulings 2026-09-16) — capture an interview finding on the job
// map without leaving the step. System proposes, operator edits: fill the record (or reuse one), get
// the local model's proposed statement, edit it, save — the row appears on the step with its origin
// chip, and the record stays selected for the next finding.
//
//   record block    speaker_role · person · role (optional) · interviewed on (default today) ·
//                   interviewer (default: the signed-in display name) · consent basis · verbatim.
//                   "Reuse an interview" lists the company's live records and collapses the block.
//   placement       read-only, from context: the viewed market's lens title, the selected step.
//                   A market with no steps: the function's own 422 renders inline, with a link to the
//                   existing "Generate job map" control (no client string).
//   actions         Propose statement → dry_run → the proposal in an editable textarea, the model
//                   named beneath. Save finding (after a proposal or a typed statement) → the function
//                   with `statement` → onSaved (the caller re-reads needs) → the record stays, the
//                   verbatim / statement clear. Done closes.
//   errors          every refusal (422 no_market_definition / no_step / market_key_mismatch /
//                   statement_not_odi, 502 model_unavailable, 409 write_refused …) renders its own
//                   message inline — nothing is swallowed into a toast.
// Operator-only (behind the glyph); strings from interviewCaptureStrings (PROPOSED); fr-* tokens only.
// No direct table writes — useRecordInterviewFinding is the only path.
import { useEffect, useMemo, useState } from "react";
import type { InterviewRecordRow } from "@/hooks/useInterviewRecords";
import { useRecordInterviewFinding, type FindingRefusal, type RecordInterviewFindingApi, type SpeakerRole } from "@/hooks/useRecordInterviewFinding";
import { formatInterviewDate } from "./InterviewOrigin";
import { INTERVIEW_CAPTURE_STRINGS as S } from "./interviewCaptureStrings";
import { WORKSPACE_STRINGS } from "./workspaceNav";

export type InterviewCaptureFormProps = {
  companyId: string;
  journeyKey: string;
  /** The viewed key's lens title (falls back to the key). */
  marketTitle: string;
  /** The selected step, or null when the market has no job map. */
  step: { step_number: number; step_label: string } | null;
  /** The company's live interview records (useInterviewRecords). */
  records: InterviewRecordRow[];
  defaultInterviewer?: string;
  /** After a successful write — the caller re-reads needs (and records). */
  onSaved: (result: { record_id: string; need_id: string; reused_record: boolean }) => void;
  onDone: () => void;
  /** Where the existing "Generate job map" control lives (an in-page anchor), for the no-step refusal. */
  generateJobMapHref?: string;
  /** Injectable for tests. */
  api?: RecordInterviewFindingApi;
};

export const REQUIRED_RECORD_FIELDS = ["person_name", "interviewed_at", "interviewer", "consent_basis", "verbatim"] as const;
const FIELD_LABEL: Record<(typeof REQUIRED_RECORD_FIELDS)[number], string> = {
  person_name: S.personName, interviewed_at: S.interviewedAt, interviewer: S.interviewer, consent_basis: S.consentBasis, verbatim: S.verbatim,
};

const pad = (n: number) => String(n).padStart(2, "0");
/** The operator's LOCAL calendar date (fold 1) — never UTC's, which is already tomorrow on a late evening. */
export const localDateIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => localDateIso();
const recordLabel = (r: InterviewRecordRow) => [r.person_name, r.person_role, formatInterviewDate(r.interviewed_at)].filter((x) => x && String(x).trim()).join(" · ");

export function InterviewCaptureForm({ companyId, journeyKey, marketTitle, step, records, defaultInterviewer = "", onSaved, onDone, generateJobMapHref, api }: InterviewCaptureFormProps) {
  const { propose, save, busy } = useRecordInterviewFinding(api);
  const [recordId, setRecordId] = useState<string>("");
  const [speakerRole, setSpeakerRole] = useState<SpeakerRole>("client_stakeholder");
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [interviewedAt, setInterviewedAt] = useState(todayIso);
  const [interviewer, setInterviewer] = useState(defaultInterviewer);
  const [consentBasis, setConsentBasis] = useState("");
  const [verbatim, setVerbatim] = useState("");
  const [statement, setStatement] = useState("");
  const [proposedBy, setProposedBy] = useState<string | null>(null);
  // The definition the last dry run resolved — sent on save as expected_definition_id (fold 2).
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<FindingRefusal | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  // The record just written, until the caller's re-read lists it (so the select can show it selected).
  const [justSaved, setJustSaved] = useState<InterviewRecordRow | null>(null);
  useEffect(() => { if (defaultInterviewer && !interviewer) setInterviewer(defaultInterviewer); }, [defaultInterviewer]); // eslint-disable-line react-hooks/exhaustive-deps

  const reusing = Boolean(recordId);
  const options = useMemo(() => (justSaved && !records.some((r) => r.id === justSaved.id) ? [justSaved, ...records] : records), [records, justSaved]);
  const missing = useMemo(() => {
    if (reusing) return [] as string[];
    const v = { person_name: personName, interviewed_at: interviewedAt, interviewer, consent_basis: consentBasis, verbatim };
    return REQUIRED_RECORD_FIELDS.filter((k) => !v[k].trim()).map((k) => FIELD_LABEL[k]);
  }, [reusing, personName, interviewedAt, interviewer, consentBasis, verbatim]);
  const recordReady = reusing || missing.length === 0;
  const stepNumber = step?.step_number ?? 1; // no step → the function refuses 422 no_step with its own wording
  const canPropose = recordReady && !busy;
  const canSave = recordReady && statement.trim().length > 0 && !busy;

  const request = () => ({
    company_id: companyId,
    journey_key: journeyKey,
    step_number: stepNumber,
    ...(reusing
      ? { interview_record_id: recordId, record: null }
      : { interview_record_id: null, record: {
          speaker_role: speakerRole, person_name: personName.trim(), person_role: personRole.trim() || null,
          journey_key: speakerRole === "market_participant" ? journeyKey : null,
          interviewed_at: `${interviewedAt}T00:00:00Z` /* midnight UTC of the picked day: gate 3's chip formats in UTC, so it shows this day */, interviewer: interviewer.trim(), consent_basis: consentBasis.trim(), verbatim: verbatim.trim(),
        } }),
  });

  const doPropose = async () => {
    if (!canPropose) return;
    setRefusal(null); setSavedNote(false);
    const r = await propose(request());
    if (r.ok === false) { setRefusal(r); return; }
    setStatement(r.proposed_statement);
    setProposedBy(r.model || null);
    setDefinitionId(r.definition_id || null);
  };
  const doSave = async () => {
    if (!canSave) return;
    setRefusal(null); setSavedNote(false);
    const r = await save({ ...request(), statement: statement.trim(), expected_definition_id: definitionId });
    if (r.ok === false) { setRefusal(r); return; }
    onSaved({ record_id: r.record_id, need_id: r.need_id, reused_record: r.reused_record });
    // the record stays selected for the next finding; the finding-specific fields clear
    if (!reusing) setJustSaved({ id: r.record_id, speaker_role: speakerRole, person_name: personName.trim(), person_role: personRole.trim() || null, journey_key: speakerRole === "market_participant" ? journeyKey : null, interviewed_at: `${interviewedAt}T00:00:00Z` });
    setRecordId(r.record_id);
    setVerbatim(""); setStatement(""); setProposedBy(null); setDefinitionId(null);
    setSavedNote(true);
  };

  return (
    <form className="fr-ws-capture" data-testid="interview-capture" onSubmit={(e) => { e.preventDefault(); void doSave(); }}>
      {/* ── record ── */}
      <label className="fr-ws-capture-field">
        <span className="fr-tag fr-mono">{S.reuse}</span>
        <select className="fr-ws-select fr-mono" value={recordId} onChange={(e) => { setRecordId(e.target.value); setRefusal(null); setSavedNote(false); }} data-testid="capture-reuse">
          <option value="">{S.reuseNone}</option>
          {options.map((r) => <option key={r.id} value={r.id}>{recordLabel(r)}</option>)}
        </select>
      </label>
      {reusing ? null : (
        <fieldset className="fr-ws-capture-record" data-testid="capture-record">
          <div className="fr-ws-capture-field" role="radiogroup" aria-label={S.speaker}>
            <span className="fr-tag fr-mono">{S.speaker}</span>
            <label className="fr-ws-capture-radio"><input type="radio" name="speaker_role" value="client_stakeholder" checked={speakerRole === "client_stakeholder"} onChange={() => setSpeakerRole("client_stakeholder")} data-testid="capture-speaker-stakeholder" /> {S.speakerStakeholder}</label>
            <label className="fr-ws-capture-radio"><input type="radio" name="speaker_role" value="market_participant" checked={speakerRole === "market_participant"} onChange={() => setSpeakerRole("market_participant")} data-testid="capture-speaker-market" /> {S.speakerMarket}</label>
          </div>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.personName}</span><input className="fr-ws-capture-input" value={personName} onChange={(e) => setPersonName(e.target.value)} data-testid="capture-person" /></label>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.personRole}</span><input className="fr-ws-capture-input" value={personRole} onChange={(e) => setPersonRole(e.target.value)} data-testid="capture-person-role" /></label>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.interviewedAt}</span><input className="fr-ws-capture-input fr-mono" type="date" value={interviewedAt} onChange={(e) => setInterviewedAt(e.target.value)} data-testid="capture-date" /></label>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.interviewer}</span><input className="fr-ws-capture-input" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} data-testid="capture-interviewer" /></label>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.consentBasis}</span><input className="fr-ws-capture-input" value={consentBasis} onChange={(e) => setConsentBasis(e.target.value)} data-testid="capture-consent" /></label>
          <label className="fr-ws-capture-field"><span className="fr-tag fr-mono">{S.verbatim}</span><textarea className="fr-ws-capture-textarea" rows={4} value={verbatim} onChange={(e) => setVerbatim(e.target.value)} data-testid="capture-verbatim" /></label>
          {missing.length > 0 ? <p className="fr-ws-capture-missing fr-mono" data-testid="capture-missing">{S.missingPrefix}{missing.join(" · ")}</p> : null}
        </fieldset>
      )}

      {/* ── placement (read-only) ── */}
      <dl className="fr-ws-capture-placement fr-mono" data-testid="capture-placement">
        <dt>{S.placementMarket}</dt><dd data-testid="capture-placement-market">{marketTitle}</dd>
        <dt>{S.placementStep}</dt><dd data-testid="capture-placement-step">{step ? `${pad(step.step_number)} · ${step.step_label}` : S.placementNoStep}</dd>
      </dl>

      {/* ── statement ── */}
      <div className="fr-ws-capture-actions">
        <button type="button" className="fr-ws-control fr-mono" disabled={!canPropose} onClick={() => { void doPropose(); }} data-testid="capture-propose">
          {busy === "propose" ? WORKSPACE_STRINGS.working : S.propose}
        </button>
      </div>
      <label className="fr-ws-capture-field">
        <span className="fr-tag fr-mono">{S.statement}</span>
        <textarea className="fr-ws-capture-textarea fr-ws-capture-statement" rows={3} value={statement} onChange={(e) => { setStatement(e.target.value); setSavedNote(false); }} data-testid="capture-statement" />
        {proposedBy ? <span className="fr-ws-capture-model fr-mono" data-testid="capture-model">{S.proposedBy}{proposedBy}</span> : null}
      </label>

      {/* ── refusal, verbatim from the function ── */}
      {refusal ? (
        <div className="fr-ws-generate-failed" role="alert" data-testid="capture-refusal" data-fr-error={refusal.error}>
          <p className="fr-ws-generate-failed-note">{refusal.message || refusal.error}</p>
          <p className="fr-ws-generate-failed-detail fr-mono" data-testid="capture-refusal-code">{refusal.status ? `${refusal.status} ` : ""}{refusal.error}</p>
          {refusal.error === "no_step" && generateJobMapHref ? (
            <a className="fr-ws-control fr-mono" href={generateJobMapHref} data-testid="capture-generate-link">{WORKSPACE_STRINGS.generateJobMap}</a>
          ) : null}
        </div>
      ) : null}
      {savedNote ? <p className="fr-ws-capture-saved fr-mono" data-testid="capture-saved">{S.saved}</p> : null}

      <div className="fr-ws-capture-actions">
        <button type="submit" className="fr-ws-control fr-mono" disabled={!canSave} data-testid="capture-save">
          {busy === "save" ? WORKSPACE_STRINGS.working : S.save}
        </button>
        <button type="button" className="fr-ws-control fr-mono" onClick={onDone} data-testid="capture-done">{S.close}</button>
      </div>
    </form>
  );
}

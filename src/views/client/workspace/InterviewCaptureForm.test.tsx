// InterviewCaptureForm (gate 4, 2026-09-16) — component level, the API injected (no invoke, no supabase):
//   required fields gate Propose / Save; reuse collapses the record block; propose fills the statement
//   and enables Save; Save sends the function's request shape WITH the edited statement; every refusal
//   renders its own message inline (never a toast); after a save the record stays selected and the
//   verbatim / statement clear.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { InterviewCaptureForm, localDateIso } from "./InterviewCaptureForm";
import { INTERVIEW_CAPTURE_STRINGS as S } from "./interviewCaptureStrings";
import { WORKSPACE_STRINGS } from "./workspaceNav";
import type { RecordInterviewFindingApi } from "@/hooks/useRecordInterviewFinding";

const calls = { propose: [] as unknown[], save: [] as unknown[] };
const responses = { propose: null as unknown, save: null as unknown };
const api: RecordInterviewFindingApi = {
  propose: vi.fn(async (req) => { calls.propose.push(req); return responses.propose as never; }),
  save: vi.fn(async (req) => { calls.save.push(req); return responses.save as never; }),
};
const RECORDS = [{ id: "rec-1", speaker_role: "client_stakeholder", person_name: "Jordan", person_role: "Program director", journey_key: null, interviewed_at: "2026-09-10T00:00:00Z" }];
const onSaved = vi.fn(); const onDone = vi.fn();
const mount = (over: Partial<Parameters<typeof InterviewCaptureForm>[0]> = {}) => render(
  <InterviewCaptureForm companyId="c1" journeyKey="customer" marketTitle="Families in crisis" step={{ step_number: 2, step_label: "Find a program" }} records={RECORDS} defaultInterviewer="Bob" onSaved={onSaved} onDone={onDone} generateJobMapHref="#jobmap-generate" api={api} {...over} />,
);
const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid=${id}]`) as HTMLElement;
const fill = (c: HTMLElement) => {
  fireEvent.change(q(c, "capture-person"), { target: { value: "Jordan (test)" } });
  fireEvent.change(q(c, "capture-consent"), { target: { value: "verbal" } });
  fireEvent.change(q(c, "capture-verbatim"), { target: { value: "Nobody calls the family back in the first week." } });
};
afterEach(() => { vi.useRealTimers(); });
beforeEach(() => { calls.propose.length = 0; calls.save.length = 0; responses.propose = { ok: true, proposed_statement: "Minimize the time before a family hears back", model: "qwen2.5:14b-instruct", definition_id: "def-live", step_label: "Find a program", would_reuse_record: false }; responses.save = { ok: true, record_id: "rec-new", need_id: "need-new", reused_record: false, statement_source: "operator" }; onSaved.mockClear(); onDone.mockClear(); });

describe("InterviewCaptureForm", () => {
  it("required fields: Propose and Save are disabled until person / consent / verbatim are filled; the missing line names them", () => {
    const { container } = mount();
    expect((q(container, "capture-propose") as HTMLButtonElement).disabled).toBe(true);
    expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(true);
    expect(q(container, "capture-missing").textContent).toBe(`${S.missingPrefix}${S.personName} · ${S.consentBasis} · ${S.verbatim}`);
    expect((q(container, "capture-interviewer") as HTMLInputElement).value).toBe("Bob");      // the default interviewer
    expect((q(container, "capture-date") as HTMLInputElement).value).toBe(localDateIso()); // today, LOCAL
    fill(container);
    expect(q(container, "capture-missing")).toBeNull();
    expect((q(container, "capture-propose") as HTMLButtonElement).disabled).toBe(false);
    expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(true); // no statement yet
  });
  it("fold 1: 'Interviewed on' defaults to the operator's LOCAL calendar date, not UTC's — mounted at 23:30 local", () => {
    const lateEvening = new Date(2026, 8, 16, 23, 30, 0); // local 2026-09-16 23:30
    vi.useFakeTimers({ now: lateEvening });
    const { container } = mount();
    const value = (q(container, "capture-date") as HTMLInputElement).value;
    expect(value).toBe("2026-09-16");
    // in any zone west of UTC this is already the 17th in UTC — the form must not show that
    if (lateEvening.toISOString().slice(0, 10) !== "2026-09-16") expect(value).not.toBe(lateEvening.toISOString().slice(0, 10));
    // and the stored value is midnight UTC of the PICKED day, which gate 3's UTC formatter renders as that day
    fill(container);
    fireEvent.click(q(container, "capture-propose"));
    return vi.waitFor(() => { expect((calls.propose[0] as { record: { interviewed_at: string } }).record.interviewed_at).toBe("2026-09-16T00:00:00Z"); });
  });
  it("placement is read-only from context: market title + step number · label", () => {
    const { container } = mount();
    expect(q(container, "capture-placement-market").textContent).toBe("Families in crisis");
    expect(q(container, "capture-placement-step").textContent).toBe("02 · Find a program");
    expect(container.querySelector("[data-testid=capture-placement] input")).toBeNull();
  });
  it("reuse: choosing a live record collapses the record block and lifts the required-field gate", () => {
    const { container } = mount();
    expect(q(container, "capture-record")).not.toBeNull();
    fireEvent.change(q(container, "capture-reuse"), { target: { value: "rec-1" } });
    expect(q(container, "capture-record")).toBeNull();
    expect((q(container, "capture-propose") as HTMLButtonElement).disabled).toBe(false);
    expect(Array.from(container.querySelectorAll("[data-testid=capture-reuse] option")).map((o) => o.textContent)).toEqual([S.reuseNone, "Jordan · Program director · Sep 10"]);
  });
  it("propose: dry_run request with the record; the statement fills, the model is named, Save enables", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.click(q(container, "capture-propose"));
    await waitFor(() => expect((q(container, "capture-statement") as HTMLTextAreaElement).value).toBe("Minimize the time before a family hears back"));
    expect(calls.propose).toEqual([{ company_id: "c1", journey_key: "customer", step_number: 2, interview_record_id: null, record: { speaker_role: "client_stakeholder", person_name: "Jordan (test)", person_role: null, journey_key: null, interviewed_at: `${localDateIso()}T00:00:00Z`, interviewer: "Bob", consent_basis: "verbal", verbatim: "Nobody calls the family back in the first week." } }]);
    expect(q(container, "capture-model").textContent).toBe(`${S.proposedBy}qwen2.5:14b-instruct`);
    expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(false);
  });
  it("save: the edited statement rides in the request; on success onSaved fires, the record stays selected, verbatim/statement clear", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.click(q(container, "capture-propose"));
    await waitFor(() => expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(q(container, "capture-statement"), { target: { value: "Reduce the time before a family hears back " } });
    fireEvent.click(q(container, "capture-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ record_id: "rec-new", need_id: "need-new", reused_record: false }));
    expect(calls.save).toHaveLength(1);
    expect((calls.save[0] as { statement: string }).statement).toBe("Reduce the time before a family hears back");
    expect((calls.save[0] as { expected_definition_id: string }).expected_definition_id).toBe("def-live"); // fold 2: the last dry run's definition
    expect((calls.save[0] as { record: unknown }).record).not.toBeNull();
    // post-save: the record stays (selected → block collapsed), the finding fields clear
    expect((q(container, "capture-reuse") as HTMLSelectElement).value).toBe("rec-new");
    expect(q(container, "capture-record")).toBeNull();
    expect((q(container, "capture-statement") as HTMLTextAreaElement).value).toBe("");
    expect(q(container, "capture-saved").textContent).toBe(S.saved);
    expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(true);
  });
  it("market participant: the record carries the viewed market's key", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.click(q(container, "capture-speaker-market"));
    fireEvent.click(q(container, "capture-propose"));
    await waitFor(() => expect(calls.propose).toHaveLength(1));
    expect((calls.propose[0] as { record: { speaker_role: string; journey_key: string } }).record).toMatchObject({ speaker_role: "market_participant", journey_key: "customer" });
  });
  it("a typed statement (no proposal) enables Save on its own", () => {
    const { container } = mount();
    fill(container);
    fireEvent.change(q(container, "capture-statement"), { target: { value: "Avoid losing the family in week one" } });
    expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(false);
    expect(calls.propose).toHaveLength(0);
  });
  it("fold 2: with no dry run behind it, a typed-statement save carries expected_definition_id: null (the function resolves live)", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.change(q(container, "capture-statement"), { target: { value: "Avoid losing the family in week one" } });
    fireEvent.click(q(container, "capture-save"));
    await waitFor(() => expect(calls.save).toHaveLength(1));
    expect((calls.save[0] as { expected_definition_id: string | null }).expected_definition_id).toBeNull();
  });
  it("fold 2: a 409 placement_changed on save renders inline like every other refusal", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.click(q(container, "capture-propose"));
    await waitFor(() => expect((q(container, "capture-save") as HTMLButtonElement).disabled).toBe(false));
    responses.save = { ok: false, status: 409, error: "placement_changed", message: "The market definition for 'customer' changed since the proposal (expected def-live, now def-new). Propose again against the live placement — nothing was written." };
    fireEvent.click(q(container, "capture-save"));
    await waitFor(() => expect(q(container, "capture-refusal")).not.toBeNull());
    expect(q(container, "capture-refusal").getAttribute("data-fr-error")).toBe("placement_changed");
    expect(q(container, "capture-refusal-code").textContent).toBe("409 placement_changed");
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("every refusal renders the function's own message inline with its code; no_step adds the Generate job map link", async () => {
    const refusals = [
      { status: 422, error: "no_market_definition", message: "No live market definition for 'customer'. Define the market before recording a finding on it — nothing was written." },
      { status: 422, error: "no_step", message: "'mkt-funders' has no job step 1. … generate its job map first. Nothing was written." },
      { status: 422, error: "market_key_mismatch", message: "a market participant's finding attaches only to that participant's own market — nothing was written." },
      { status: 422, error: "statement_not_odi", message: "The statement must start with a direction verb — nothing was written." },
      { status: 502, error: "model_unavailable", message: "local model failed: connection refused — nothing was written (no template fallback)." },
      { status: 409, error: "write_refused", message: "duplicate key value violates unique constraint" },
    ];
    for (const r of refusals) {
      responses.propose = { ok: false, ...r };
      const { container, unmount } = mount({ step: r.error === "no_step" ? null : undefined });
      fill(container);
      fireEvent.click(q(container, "capture-propose"));
      await waitFor(() => expect(q(container, "capture-refusal")).not.toBeNull());
      expect(q(container, "capture-refusal").getAttribute("data-fr-error")).toBe(r.error);
      expect(q(container, "capture-refusal").querySelector(".fr-ws-generate-failed-note")!.textContent).toBe(r.message);
      expect(q(container, "capture-refusal-code").textContent).toBe(`${r.status} ${r.error}`);
      const link = q(container, "capture-generate-link");
      if (r.error === "no_step") { expect(link.textContent).toBe(WORKSPACE_STRINGS.generateJobMap); expect(link.getAttribute("href")).toBe("#jobmap-generate"); expect(q(container, "capture-placement-step").textContent).toBe(S.placementNoStep); }
      else expect(link).toBeNull();
      unmount();
    }
  });
  it("a save refusal keeps the statement so the operator can fix it; Done calls onDone", async () => {
    const { container } = mount();
    fill(container);
    fireEvent.change(q(container, "capture-statement"), { target: { value: "Families want a call back" } });
    responses.save = { ok: false, status: 422, error: "statement_not_odi", message: "The statement must start with a direction verb — nothing was written." };
    fireEvent.click(q(container, "capture-save"));
    await waitFor(() => expect(q(container, "capture-refusal")).not.toBeNull());
    expect((q(container, "capture-statement") as HTMLTextAreaElement).value).toBe("Families want a call back");
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(q(container, "capture-done"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

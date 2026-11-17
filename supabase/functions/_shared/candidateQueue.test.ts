// SP-324 / SP-321: the queue planner is pure — these pin what each queued row says about its item.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  candidateText,
  combineVoices,
  ledByAnalystVerb,
  planCandidateQueueWithDrops,
  effectiveAuthorship,
  planCandidateQueue,
  type QueueSignal,
  signalVoice,
} from "./candidateQueue.ts";

// G1: a signal backs an item only through its STORED excerpt, so the fixture's evidence sits there.
const sig = (id: string, evidence: string, over: Partial<QueueSignal> = {}): QueueSignal => ({
  id, source_type: "uploaded_file", signal_band: "organization", voice_class: null,
  evidence_excerpt: evidence, raw_payload: { evidence }, ...over,
});

Deno.test("an item rests on the signals whose evidence contains its own", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", candidate_needs: [{ desired_outcome: "x", evidence: "Alpha beta gamma delta epsilon" }] },
    signals: [sig("s1", "…alpha, beta gamma — delta epsilon zeta"), sig("s2", "unrelated words entirely here")],
    docAuthorship: "client",
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].surface_type, "candidate_need");
  assertEquals(rows[0].current_state, null);
  assertEquals(rows[0].status, "pending");
  assertEquals(rows[0].proposed_state.evidence_signal_ids, ["s1"]);
  assertEquals(rows[0].raw_payload.evidence_match, "matched");
  assertEquals(rows[0].raw_payload.file_proposal_id, "p1");
  assertEquals(rows[0].raw_payload.candidate_index, "0");
});

Deno.test("an unmatched item is still queued, with no ids and says so", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", possible_routes: [{ title: "t", evidence: "nothing in any signal matches this" }] },
    signals: [sig("s1", "other text")],
    docAuthorship: "client",
  });
  assertEquals(rows[0].surface_type, "candidate_route");
  assertEquals(rows[0].proposed_state.evidence_signal_ids, []);
  assertEquals(rows[0].raw_payload.evidence_match, "unmatched");
  assertEquals(rows[0].proposed_state.evidence_voice, "unlabeled");
});

Deno.test("evidence too short to name a signal matches nothing", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: null, candidate_outcomes: [{ outcome: "o", evidence: "short" }] },
    signals: [sig("s1", "this has short inside it")],
    docAuthorship: null,
  });
  assertEquals(rows[0].proposed_state.evidence_signal_ids, []);
});

Deno.test("all five lists queue, each under its own surface type; non-objects are skipped", () => {
  const e = { evidence: "" };
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: {
      id: "p1", file_id: "f1",
      candidate_needs: [e, "not an object"], candidate_job_steps: [e], candidate_outcomes: [e],
      possible_routes: [e], candidate_positioning_updates: [e],
    },
    signals: [], docAuthorship: "client",
  });
  assertEquals(rows.map((r) => r.surface_type), ["candidate_need", "candidate_job_step", "candidate_outcome", "candidate_route", "candidate_positioning"]);
});

Deno.test("SP-321: a company's own document is company voice; a third party's is outside", () => {
  const up = { source_type: "uploaded_file", signal_band: "outside", voice_class: "outside_voice_about_client" };
  assertEquals(signalVoice(up, "client"), "company");
  assertEquals(signalVoice(up, "third_party"), "outside");
  assertEquals(signalVoice(up, "us"), "unlabeled");
  assertEquals(signalVoice(up, "uncertain"), "unlabeled");
  assertEquals(signalVoice(up, null), "unlabeled");
  assertEquals(signalVoice({ source_type: "public_baseline_run", signal_band: "outside", voice_class: "outside_voice_about_client" }, null), "outside");
  assertEquals(signalVoice({ source_type: "public_baseline_run", signal_band: "outside", voice_class: "client_voice" }, null), "company");
  assertEquals(signalVoice({ source_type: "public_baseline_run", signal_band: "outside", voice_class: "analysis" }, null), "unlabeled");
});

Deno.test("voices combine: both ⇒ mixed, unlabeled only when alone", () => {
  assertEquals(combineVoices(["company", "outside"]), "mixed");
  assertEquals(combineVoices(["company", "unlabeled"]), "company");
  assertEquals(combineVoices(["unlabeled"]), "unlabeled");
  assertEquals(combineVoices([]), "unlabeled");
});

Deno.test("an operator override wins over the classifier's authorship", () => {
  assertEquals(effectiveAuthorship([
    { authorship: "third_party", operator_override: null, created_at: "2026-11-13" },
    { authorship: null, operator_override: "client_voice", created_at: "2026-11-14" },
  ]), "client");
  assertEquals(effectiveAuthorship([{ authorship: "third_party", operator_override: null, created_at: "2026-11-13" }]), "third_party");
  assert(effectiveAuthorship([]) === null);
});

// ── G1 (2026-11-16): the backstop ──────────────────────────────────────────────────────────────────
const EV = "The most common reason for lapsing was not hearing back after the first gift.";

Deno.test("G1: a blank stored excerpt backs nothing, whatever raw_payload.evidence says", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", candidate_needs: [{ desired_outcome: "Hear back after a first gift", evidence: EV }] },
    signals: [sig("s1", EV, { evidence_excerpt: "" }), sig("s2", EV, { evidence_excerpt: null })],
    docAuthorship: "client",
  });
  assertEquals(rows[0].raw_payload.evidence_match, "unmatched");
  assertEquals(rows[0].proposed_state.evidence_signal_ids, []);
});

Deno.test("G1: an item led by an analyst verb is dropped, with its reason", () => {
  for (const t of ["Understand the financial impact of acquisitions", "To understand the financial impact of X",
                   "Analyze financial impact of acquisitions", "analyse churn", "Review donor lapses", "Assess the risk"]) {
    assert(ledByAnalystVerb(t), t);
  }
  for (const t of ["Families cannot understand the fees", "Reduce the time to reach a counselor", "Reviewers sign off"]) {
    assert(!ledByAnalystVerb(t), t);
  }
  const { rows, drops } = planCandidateQueueWithDrops({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", possible_routes: [{ title: "Analyze financial impact of acquisitions", evidence: "x" }, { title: "Open a second site", evidence: "y" }] },
    signals: [], docAuthorship: "client",
  });
  assertEquals(rows.map((r) => r.proposed_state.item.title), ["Open a second site"]);
  assertEquals(drops, [{ list: "possible_routes", index: 0, reason: "analyst_verb", text: "Analyze financial impact of acquisitions" }]);
  assertEquals(rows[0].raw_payload.candidate_index, "1");   // the analysis's own index survives the drop
});

Deno.test("G1: one idea in four lists queues once — the need — and the rest are dropped as duplicates", () => {
  const { rows, drops } = planCandidateQueueWithDrops({
    companyId: "c1",
    proposal: {
      id: "p1", file_id: "f1",
      candidate_needs: [{ desired_outcome: "Donors hear back after their first gift", evidence: EV }],
      candidate_job_steps: [{ step_label: "Thank first-time donors", evidence: EV }],
      candidate_outcomes: [{ outcome: "Donors hear back after their first gift", evidence: "a different sentence entirely, long enough" }],
      possible_routes: [{ title: "Start a 48-hour thank-you call", evidence: "the board approved a 48-hour thank-you call" }],
    },
    signals: [sig("s1", EV)], docAuthorship: "client",
  });
  assertEquals(rows.map((r) => r.surface_type), ["candidate_need", "candidate_route"]);
  assertEquals(drops.map((d) => [d.list, d.reason, d.of]), [
    ["candidate_job_steps", "duplicate_evidence", "candidate_needs"],
    ["candidate_outcomes", "duplicate_text", "candidate_needs"],
  ]);
});

Deno.test("G1: repeats inside ONE list are not the backstop's business", () => {
  const { rows, drops } = planCandidateQueueWithDrops({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", candidate_needs: [{ desired_outcome: "Same", evidence: EV }, { desired_outcome: "Same", evidence: EV }] },
    signals: [], docAuthorship: "client",
  });
  assertEquals([rows.length, drops.length], [2, 0]);
});

Deno.test("G1: each list is judged on the words it is about", () => {
  assertEquals(candidateText("candidate_needs", { desired_outcome: "A" }), "A");
  assertEquals(candidateText("candidate_job_steps", { step_label: "B", step_description: "x" }), "B");
  assertEquals(candidateText("candidate_outcomes", { outcome: "C" }), "C");
  assertEquals(candidateText("possible_routes", { title: "D" }), "D");
  assertEquals(candidateText("candidate_positioning_updates", { suggested_update: "E" }), "E");
});

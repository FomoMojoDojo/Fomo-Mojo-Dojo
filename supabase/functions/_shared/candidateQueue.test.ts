// SP-324 / SP-321: the queue planner is pure — these pin what each queued row says about its item.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  candidateText,
  combineVoices,
  ledByAnalystVerb,
  planCandidateQueueWithDrops,
  effectiveAuthorship,
  excerptBacksEvidence,
  normalizeEvidence,
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

// M1: the REAL failing pair — Charter's earnings release, analysis 515ccb3c (workflow 52410e4f), signal
// 0faa0afc. The framework finding's evidence was cut by C1's 150-character schema cap; the candidate need's
// evidence (180-character cap) is the whole sentence, which is verbatim in the document's sidecar.
const CUT = "Spectrum increasingly offers symmetrical and multi-gigabit Internet speeds across its entire footprint and has launched symmetrical Internet service";
const WHOLE = "Spectrum increasingly offers symmetrical and multi-gigabit Internet speeds across its entire footprint and has launched symmetrical Internet service in several markets.";

Deno.test("M1: a stored excerpt cut at the schema cap still backs the item whose evidence it begins", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", candidate_needs: [{ desired_outcome: "To benefit from symmetrical and multi-gigabit internet speeds.", evidence: WHOLE }] },
    signals: [sig("0faa0afc", CUT, { raw_payload: { evidence: CUT } })],
    docAuthorship: "client",
  });
  assertEquals(rows[0].proposed_state.evidence_signal_ids, ["0faa0afc"]);
  assertEquals(rows[0].raw_payload.evidence_match, "matched");
  assertEquals(rows[0].proposed_state.evidence_voice, "company");
});

Deno.test("M1: the prefix rule is bounded — not mid-sentence, not short, not a small share, not a blank excerpt", () => {
  const ev = normalizeEvidence(WHOLE);
  assert(excerptBacksEvidence(normalizeEvidence(CUT), ev));
  // a piece from the MIDDLE of the quote is not a cut tail
  assert(!excerptBacksEvidence(normalizeEvidence("multi-gigabit Internet speeds across its entire footprint and has launched symmetrical"), ev));
  // a prefix under MIN_PREFIX_CHARS names too much
  assert(!excerptBacksEvidence(normalizeEvidence("Spectrum increasingly offers"), ev));
  // a prefix of 40+ characters that covers under MIN_PREFIX_SHARE of the item is not its quote
  assert(!excerptBacksEvidence(normalizeEvidence("Spectrum increasingly offers symmetrical and multi-gigabit"), ev));
  // blank stays blank (G1 backstop 3)
  assert(!excerptBacksEvidence("", ev));
  // the old direction is unchanged
  assert(excerptBacksEvidence(normalizeEvidence("… " + WHOLE + " More text."), ev));
});

Deno.test("M1: a blanked excerpt still backs nothing even when raw_payload.evidence is the cut quote", () => {
  const rows = planCandidateQueue({
    companyId: "c1",
    proposal: { id: "p1", file_id: "f1", candidate_needs: [{ desired_outcome: "x", evidence: WHOLE }] },
    signals: [sig("s1", "", { raw_payload: { evidence: CUT } })],
    docAuthorship: "client",
  });
  assertEquals(rows[0].raw_payload.evidence_match, "unmatched");
});

// F-4: on a FOCUSED run the customer-side cards obey their own label; an unfocused run is unchanged.
const STAMP = [
  { rank: 1, market_definition_id: "m-d", journey_key: "pmk-donors", job_executor: "Individual donors", jtbd: "", signed_at: null },
  { rank: 2, market_definition_id: "m-f", journey_key: "customer", job_executor: "Families", jtbd: "", signed_at: null },
];
const LISTS = {
  id: "p1", file_id: "f1",
  candidate_needs: [
    { desired_outcome: "Minimize the effort to give monthly", evidence: "Donors told us monthly giving takes too many steps to set up.", subject_party: "focus", focus_index: 1 },
    { desired_outcome: "Increase the foundation's grantmaking reach", evidence: "The foundation aims to expand its grantmaking across the region.", subject_party: "other", focus_index: 0 },
    { desired_outcome: "Increase unrestricted giving to Edgewood", evidence: "Edgewood plans to raise unrestricted giving by twenty percent.", subject_party: "company", focus_index: 0 },
  ],
  candidate_job_steps: [{ step_label: "Find a support group", evidence: "Families search for a support group near home before calling us.", subject_party: "focus", focus_index: 2 }],
  candidate_outcomes: [{ outcome: "Feel confident the gift helped", evidence: "Donors want to know their gift made a difference to a child.", subject_party: "focus", focus_index: 7 }],
  possible_routes: [{ title: "Launch a monthly giving page", evidence: "A monthly giving page could make setup a single step for donors." }],
};

Deno.test("F-4: a focused run drops company cards, counts other-party cards, and gives focus cards their journey", () => {
  const { rows, drops } = planCandidateQueueWithDrops({ companyId: "c1", proposal: LISTS as never, signals: [], docAuthorship: "client", focus: STAMP });
  assertEquals(drops.map((d) => d.reason).sort(), ["company_subject", "other_party"]);
  const need = rows.find((r) => r.surface_type === "candidate_need")!;
  assertEquals(need.proposed_state.journey_key, "pmk-donors");
  assertEquals(need.raw_payload.subject_party, "focus");
  assertEquals(rows.find((r) => r.surface_type === "candidate_job_step")!.proposed_state.journey_key, "customer");
  const outcome = rows.find((r) => r.surface_type === "candidate_outcome")!;
  assertEquals(outcome.raw_payload.subject_party, "focus_unresolved");   // index 7 of a 2-market set
  assertEquals(outcome.proposed_state.journey_key, undefined);
  const route = rows.find((r) => r.surface_type === "candidate_route")!;
  assertEquals(route.raw_payload.subject_party, undefined);              // routes are the company's moves: no label
});

Deno.test("F-4: an unfocused run (decision 4) queues every card as before — no party filter, no journey", () => {
  for (const focus of [null, []]) {
    const { rows, drops } = planCandidateQueueWithDrops({ companyId: "c1", proposal: LISTS as never, signals: [], docAuthorship: "client", focus });
    assertEquals(drops.length, 0);
    assertEquals(rows.length, 6);
    assert(rows.every((r) => r.proposed_state.journey_key === undefined));
  }
});

Deno.test("F-4: a focused run whose workflow emits no label withholds nothing", () => {
  const unlabelled = { ...LISTS, candidate_needs: LISTS.candidate_needs.map(({ subject_party: _s, focus_index: _f, ...rest }) => rest) };
  const { rows, drops } = planCandidateQueueWithDrops({ companyId: "c1", proposal: unlabelled as never, signals: [], docAuthorship: "client", focus: STAMP });
  assertEquals(drops.length, 0);
  assertEquals(rows.filter((r) => r.surface_type === "candidate_need").every((r) => r.raw_payload.subject_party === "unlabelled"), true);
});

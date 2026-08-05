// ECHO-CRITERION FALSIFICATION HARNESS (throwaway, local ollama; WRITES NOTHING).
// Runs the tightened echo criterion + structural span gate through the real
// llama3:70b judge on the two known Edgewood pairs. Recorded per gate ruling.
//
// OUTCOME (this run, temperature 0 / seed 42, reproduced twice — deterministic):
//   MUST FLIP    → FLIPPED to NOT-A-PAIR ✓  (judge: observed lacks specific
//                  early-detection language; relation null, empty span)
//   MUST SURVIVE → did NOT survive ✗  (judge: the CSU-only-unit observed confirms
//                  a sub-component, not the declared "cohesive pathway of care";
//                  relation null, empty span)
//   Planted bad span → rejected by verifyObservedSpan ✓ (harness can fail)
// Falsification therefore did NOT pass. Per the gate rule the criterion was NOT
// tuned to force a pass; recompute stays BLOCKED pending operator ruling.
// Run: node scripts/oneoff/echo-criterion-falsify.mjs
// Throwaway falsification harness — runs the NEW echo criterion + span gate through
// the real llama3:70b judge on the two known pairs. WRITES NOTHING (no supabase import,
// no DB handle — zero-write by construction). Reports whatever happens.
import { readFileSync } from "node:fs";

const OLLAMA = "http://127.0.0.1:11434/api/chat";
const JUDGE_MODEL = "llama3:70b";
const SRC = "/Users/fomomojodojo/dev/happy-file-hugger-main/supabase/functions/_shared/claimDeltaSynthesis.ts";

// --- verbatim copy of the shipped JUDGE_SYSTEM (asserted against source below) ---
const JUDGE_SYSTEM =
  "You are a strict reviewer of a proposed pairing between an internally-DECLARED strategy statement and a publicly-OBSERVED statement. " +
  "Criteria: (i) SPECIFIC — the OBSERVED statement must speak to the SPECIFIC assertion the declared statement makes, not merely a shared topic; shared buzzwords or general theme overlap are NOT sufficient; an observed statement that would equally confirm many unrelated declared claims is NOT an echo of any of them; " +
  "(ii) RELATION — 'echo' means the public statement is consistent with the declared intent; 'divergent' means it contradicts or materially mis-states it; " +
  "(iii) SPAN — you MUST copy, VERBATIM, a span of words FROM THE OBSERVED STATEMENT that carries the confirmation or contradiction; the span must be text that actually appears in the OBSERVED statement (not the declared one, not a paraphrase). If no such specific span exists, there is no pairing: return relation null; " +
  "(iv) CONFIDENT — true only when the subject match and relation are unambiguous. " +
  "Reject vibes-pairings. Never force a match. " +
  'JSON only: {"same_subject":true|false,"relation":"echo"|"divergent"|null,"confident":true|false,"span":"<verbatim words copied from the OBSERVED statement>","reason":"<one short clause>"}.';

const buildPairUser = (declared, publicStmt) =>
  `DECLARED (internal, authoritative about intent): ${declared}\nOBSERVED (public): ${publicStmt}\nAre these the same subject, and if so does the public statement echo or diverge from the declared intent?`;

// --- byte-identical copy of the shipped verifyObservedSpan (unit-tested in the module) ---
const MIN_SPAN_CHARS = 8;
const MIN_SPAN_TOKENS = 2;
const normalizeSpan = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
function verifyObservedSpan(span, observed) {
  if (!span) return false;
  const nSpan = normalizeSpan(span);
  if (nSpan.length < MIN_SPAN_CHARS) return false;
  if (nSpan.split(" ").filter(Boolean).length < MIN_SPAN_TOKENS) return false;
  return normalizeSpan(observed).includes(nSpan);
}

// Fidelity guard: prove this harness uses the SHIPPED prompt + minimums, not a drift.
const src = readFileSync(SRC, "utf8");
for (const clause of [
  "the OBSERVED statement must speak to the SPECIFIC assertion",
  "would equally confirm many unrelated declared claims is NOT an echo",
  "you MUST copy, VERBATIM, a span of words FROM THE OBSERVED STATEMENT",
]) {
  if (!src.includes(clause)) { console.error("FIDELITY FAIL — shipped prompt missing clause:", clause); process.exit(2); }
}
if (!src.includes("MIN_SPAN_CHARS = 8") || !src.includes("MIN_SPAN_TOKENS = 2")) {
  console.error("FIDELITY FAIL — shipped minimums differ from harness"); process.exit(2);
}
console.log("fidelity: harness prompt + minimums match the shipped source.\n");

const PAIRS = [
  {
    name: "MUST FLIP (early-detection x generic well-established nonprofit)",
    expect: "not-echo",
    declared: "Emphasis on early detection and intervention to prevent escalation of mental health issues and reduce reliance on high-cost residential services.",
    observed: "Edgewood is a well-established nonprofit focused on holistic youth mental health care integrating clinical and community services.",
  },
  {
    name: "MUST SURVIVE (cohesive pathway/crisis stabilization x CSU only crisis stabilization unit)",
    expect: "echo",
    declared: "Edgewood provides a cohesive pathway of care that includes crisis stabilization, residential treatment, intensive community-based support, and school-linked services without gaps or discontinuities.",
    observed: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.",
  },
];

async function judge(declared, observed) {
  const resp = await fetch(OLLAMA, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify({
      model: JUDGE_MODEL, format: "json", stream: false,
      options: { num_ctx: 8192, temperature: 0, seed: 42 },
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: buildPairUser(declared, observed) },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}`);
  const data = await resp.json();
  return JSON.parse(String(data?.message?.content ?? "{}"));
}

// Prove the harness CAN reject: plant a bad span (not in observed).
const planted = verifyObservedSpan("early detection and intervention", PAIRS[0].observed);
console.log(`planted-bad-span check: verifyObservedSpan(bad) = ${planted}  (expect false) => ${planted === false ? "REJECTS ✓" : "DID NOT REJECT ✗"}\n`);
if (planted !== false) { console.error("HARNESS CANNOT REJECT — aborting"); process.exit(2); }

for (const pr of PAIRS) {
  const v = await judge(pr.declared, pr.observed);
  const relation = v.relation === "echo" || v.relation === "divergent" ? v.relation : null;
  const spanOk = verifyObservedSpan(v.span, pr.observed);
  // Final result mirrors the compute flow: a pairing requires same_subject + relation + verified span.
  const paired = v.same_subject === true && relation !== null && spanOk;
  const finalEcho = paired && relation === "echo";
  console.log("──────────────────────────────────────────────────────────────");
  console.log(pr.name);
  console.log(`  expect:        ${pr.expect}`);
  console.log(`  judge said:    same_subject=${v.same_subject} relation=${JSON.stringify(v.relation)} confident=${v.confident}`);
  console.log(`  judge reason:  ${v.reason}`);
  console.log(`  span returned: ${JSON.stringify(v.span)}`);
  console.log(`  span verified: ${spanOk}   (real substring of observed AND >= ${MIN_SPAN_CHARS} chars / ${MIN_SPAN_TOKENS} tokens)`);
  console.log(`  FINAL:         ${paired ? relation.toUpperCase() : "NOT A PAIR (falls to silence rails)"}`);
  const pass = (pr.expect === "echo" && finalEcho) || (pr.expect === "not-echo" && !finalEcho);
  console.log(`  OUTCOME:       ${pass ? "AS EXPECTED ✓" : "*** UNEXPECTED ✗ ***"}`);
}
console.log("──────────────────────────────────────────────────────────────");
console.log("harness complete — no DB handle opened, zero writes.");

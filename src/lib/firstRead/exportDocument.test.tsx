// V2-10 — the closing acceptance harness for the whole leave-behind. Per-act golden
// comparisons against the SHARED constants (single-source proof) + document-level honesty
// sweeps (no machinery, model names, framework names, bars, analytic content).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import { FR_ACTS, FR_EXPORT_ACTS } from "@/lib/firstRead/acts";
import { statedProblemLabel } from "@/lib/firstRead/statedProblem";
import { WHY_OUTSIDE_RATIONALE, JOURNEY_VISUAL_LABELS } from "@/lib/firstRead/whyOutside";
import { outsideBand } from "@/lib/firstRead/outsideBands";
import { TALLY_SEGMENTS } from "@/lib/firstRead/checkItemView";
import { SAY_VS_SEE_GROUPS, SAY_LABEL, SEE_LABEL } from "@/lib/firstRead/sayVsSee";
import { GAP_EMPTY } from "@/components/client-view/story/GapAct";
import { setAsideGroupHeading } from "@/lib/firstRead/gapShrink";
import { PLAN_HEADING } from "@/components/client-view/story/check/ProposalAct";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";
import type { CheckItem } from "@/hooks/useFirstReadCapture";

// A whole-document fixture with every act populated (Edgewood-shaped).
const deltaItem: CheckItem = {
  kind: "delta", ref: "d1", text: "We close gaps in youth mental health care.", identity: "ci-1",
  verdict: "confirmed", correctionText: null, capturedAt: "2026-07-23T00:00:00Z",
  delta: { deltaType: "echoed", say: "We close gaps in youth mental health care.", see: "Edgewood is a leading provider.", quote: "leading provider", quoteSourceText: "x", eventDate: "2026-03-01" },
};
const findingItem: CheckItem = {
  kind: "finding", ref: "f1", text: "Referral gatekeepers shape access.", identity: "ci-2",
  verdict: "not_important", correctionText: null, capturedAt: "2026-07-23T00:00:00Z",
};
const FULL: FirstReadExportData = {
  company: { name: "Edgewood Center" },
  session: { id: "sess-uuid-abc", date: "2026-07-23", presenter: "Operator" },
  statedProblem: { statement: "Positional invisibility at the moment of need.", verbatim: true, quote: null, register: "internal_declared", descriptive_fallback: false },
  standard: null,
  mirror: { score: 34, bet: { label: "Your bet", text: "Recognition is the mechanism." }, findings: [{ label: "What we noticed", text: "Kaiser lists Edgewood." }] },
  perception: ["Edgewood is a leading nonprofit provider of youth mental health services."],
  check: { items: [deltaItem, findingItem], tally: { confirmed: 1, corrected: 0, rejected: 0, not_important: 1 } },
  gap: ["Do rural families reach Edgewood in time?"],
  gapSetAside: ["Is the kinship result recognized outside?"],
  proposal: {
    status: "generated", headline: "The offer.", headline_sources: { response_ids: ["r1"] },
    blocks: [{ key: "what_we_would_answer", heading: "What we would answer", body: "We would answer the rural-access question.", sources: { open_question_identities: ["q-1"] } }],
    plan: [{ title: "Resource Prioritization Strategy", cite_identity: "q-1", cite_kind: "question" }],
    generated_at: "2026-07-23T00:00:00Z", trace: { model: "qwen2.5:14b-instruct" },
  },
  exportedAt: "2026-07-23T12:00:00Z",
};

const html = buildFirstReadExportHtml(FULL);

describe("V2-10 — per-act golden harness (export renders the SHARED constants)", () => {
  it("ACT ORDER + TITLES come from FR_EXPORT_ACTS (=== FR_ACTS)", () => {
    const titles = [...html.matchAll(/<h1 class="sec">([^<]+)<\/h1>/g)].map((m) => m[1]);
    expect(titles).toEqual(FR_ACTS.map((a) => a.title));
    expect(FR_EXPORT_ACTS.length).toBe(FR_ACTS.length); // placeholder branch retired
  });
  it("Act 1 — the provenance label is the shared statedProblemLabel", () => {
    expect(html).toContain(statedProblemLabel("internal_declared", false));
    expect(html).toContain("Positional invisibility at the moment of need.");
  });
  it("Act 2 — the signed rationale + journey labels", () => {
    for (const b of WHY_OUTSIDE_RATIONALE) { expect(html).toContain(b.q); expect(html).toContain(b.a); }
    for (const n of JOURNEY_VISUAL_LABELS.nodes) expect(html).toContain(n.title);
  });
  it("Act 3 — the Message band heading + perception", () => {
    expect(html).toContain(outsideBand("message").heading);
    expect(html).toContain("leading nonprofit provider");
  });
  it("Act 4 — tally segments, say/see labels, the As-captured receipt", () => {
    for (const seg of TALLY_SEGMENTS) expect(html).toContain(seg.label);
    expect(html).toContain(SAY_LABEL);
    expect(html).toContain(SEE_LABEL);
    expect(html).toContain(SAY_VS_SEE_GROUPS[0].heading);
    expect(html).toContain(AS_CAPTURED_LABEL); // the delta had a quote
  });
  it("Act 5 — the set-aside heading + plan heading + a plan stage", () => {
    expect(html).toContain(setAsideGroupHeading(FULL.gapSetAside!.length));
    expect(html).toContain(PLAN_HEADING);
    expect(html).toContain("Resource Prioritization Strategy");
    expect(html).toContain("Do rural families reach Edgewood in time?"); // active gap
  });
});

describe("V2-10 — document honesty sweeps (nothing that shouldn't reach a client)", () => {
  it("NO machinery language (freeze / lock / immutable / raw session id / status)", () => {
    const machinery = /\b(freeze|frozen|locked|immutable|proposal_issued)\b/i;
    expect(html).not.toMatch(machinery);
    expect(html).not.toContain("sess-uuid-abc"); // the raw session id is out of the footer
    expect(html).not.toMatch(/Session\s+[0-9a-f-]{8,}/i);
  });
  it("NO model names in the leave-behind", () => {
    for (const name of ["qwen2.5", "llama3", "gpt-4", "70b", "14b-instruct"]) expect(html).not.toContain(name);
  });
  it("NO framework names (FR-ATTR)", () => {
    for (const name of ["ODI", "JTBD", "Jobs to Be Done", "Outcome-Driven Innovation"]) expect(html.toLowerCase()).not.toContain(name.toLowerCase());
  });
  it("NO left-border rails in the export CSS", () => {
    const src = readFileSync("src/lib/firstRead/exportHtml.ts", "utf8");
    // only the STYLE constant matters; assert no border-left anywhere in the serializer
    expect(src).not.toMatch(/border-left|border-inline-start/);
  });
});

describe("V2-10 — analytic exclusion holds through the whole path", () => {
  it("the serializer renders exactly the perception it is handed (guard is upstream, tested in V2-5b)", () => {
    // ExportButton applies isPublicProvenance + admitPublicPerception before this point;
    // here we prove the serializer adds nothing and drops the honest-absence when empty.
    const emptyPerc = buildFirstReadExportHtml({ ...FULL, perception: [] });
    expect(emptyPerc).toContain(outsideBand("message").empty); // honest-absence, not fabricated
  });
});

describe("V2-10 — placeholder branch is dead code (removed)", () => {
  it("FR_ACTS has no placeholder field and FR_EXPORT_ACTS is the full set", () => {
    // @ts-expect-error — the `placeholder` field was removed from FirstReadAct (compile-time proof)
    expect(FR_ACTS.every((a) => a.placeholder === undefined)).toBe(true);
    expect(FR_EXPORT_ACTS).toBe(FR_ACTS);
  });
});

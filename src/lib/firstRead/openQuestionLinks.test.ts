// FR-FLOW-2a — the open-question → finding linkage LAW.

import { describe, it, expect } from "vitest";
import { deriveOpenQuestionRows } from "./openQuestionLinks";
import { contentIdentity } from "../../../supabase/functions/_shared/contentIdentity";

const FINDING = "Their service footprint covers most US states";
const Q_LINKED = "Do they actually serve rural markets, or just metros?";
const Q_LINKLESS = "What is their annual churn rate?";

describe("deriveOpenQuestionRows — content-identity linkage", () => {
  it("links a question to a REAL finding identity; leaves an undeclared question linkless", async () => {
    const fi = await contentIdentity(FINDING);
    const rows = await deriveOpenQuestionRows({
      companyId: "c1",
      runId: "34",
      questions: [Q_LINKED, Q_LINKLESS],
      linkHints: [{ question: Q_LINKED, depends_on: FINDING }],
      findingIdentities: new Set([fi]),
    });
    expect(rows).toHaveLength(2);
    // linked
    expect(rows[0].question_identity).toBe(await contentIdentity(Q_LINKED));
    expect(rows[0].finding_identity).toBe(fi);
    // undeclared → linkless (honest absence)
    expect(rows[1].finding_identity).toBeNull();
  });

  it("REFUSES a bogus dependency: a declared finding not in the run is stored linkless, never fabricated", async () => {
    const fi = await contentIdentity(FINDING);
    const rows = await deriveOpenQuestionRows({
      companyId: "c1",
      runId: "34",
      questions: [Q_LINKED],
      // depends_on names a finding that DOES NOT exist in the run
      linkHints: [{ question: Q_LINKED, depends_on: "A finding the model hallucinated" }],
      findingIdentities: new Set([fi]),
    });
    expect(rows[0].finding_identity).toBeNull(); // refused — not a real finding

    // FALSIFICATION: the SAME question, declared against the REAL finding, DOES link —
    // proving the null above is the failed match, not a dead code path.
    const linked = await deriveOpenQuestionRows({
      companyId: "c1", runId: "34", questions: [Q_LINKED],
      linkHints: [{ question: Q_LINKED, depends_on: FINDING }],
      findingIdentities: new Set([fi]),
    });
    expect(linked[0].finding_identity).toBe(fi);
  });

  it("dedupes by question identity within a run; drops empty questions", async () => {
    const rows = await deriveOpenQuestionRows({
      companyId: "c1", runId: "34",
      questions: [Q_LINKED, Q_LINKED, "  "],
      findingIdentities: new Set(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].finding_identity).toBeNull(); // no hints → linkless
  });
});

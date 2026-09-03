// OPERATOR RELEVANCE CONTROLS — guards (stage 3, operator ruling 2026-09-03). LAW: client views never
// render operator controls. Proves, on DOM STRUCTURE (the data-fr-operator markers), never text regex:
//   (a) ActGap WITHOUT the provider and the client story's DeltaItemRow with an echoed delta → ZERO
//       [data-fr-operator] nodes (RED if the context gate is removed);
//   (b) the preview mount (provider present) → both markers present: relevance-controls in the pair
//       tag line, struck-pairs under the statement, Spare inside the struck block;
//   (c) an EMPTY reason never reaches the write: Record inert, decide not called, RPC not called;
//       a non-empty reason writes through set_relevance_override with the identity + trimmed reason;
//   (d) an operator-decided pair wears the provenance tag and Withdraw, not Strike.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { ActGap } from "./acts";
import { OperatorControlsContext, type OperatorControls, type OperatorDecision } from "./operatorControls";
import { OPERATOR_MARK, OPERATOR_STRINGS } from "./operatorStrings";
import { decideRelevance, setRelevanceOverride, FROZEN_COMPANY_ID, RELEVANCE_STEP_FN } from "./relevanceOverrideAction";
import { groupGapStatements, orderGapPairs } from "./mapping";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair } from "./types";
import { assembleDeltaItems } from "@/lib/firstRead/deltaItems";
import DeltaItemRow from "@/components/client-view/story/check/DeltaItemRow";
import type { CheckItem } from "@/hooks/useFirstReadCapture";

const SEL = `[${OPERATOR_MARK.attr}]`;
const SEL_CONTROLS = `[${OPERATOR_MARK.attr}="${OPERATOR_MARK.controls}"]`;
const SEL_STRUCK = `[${OPERATOR_MARK.attr}="${OPERATOR_MARK.struck}"]`;

const pair = (over: Partial<FRGapPair>): FRGapPair => ({
  id: "p", statementId: "s1", verdict: "confirmed",
  declared: "We don't train on your data.", record: "geniant does not train models on client data.",
  sourceTag: { label: "example.com · read September 2, 2026" }, eventDate: "2026-09-01",
  evidenceRank: 2, contentIdentity: `ident-${over.id ?? "p"}`, relevanceVerdict: "relevant",
  relevanceProvider: "deterministic", relevanceModel: "router", relevanceReason: "2 distinctive tokens shared",
  ...over,
});

/** One statement with an active (relevant) pair and a router-struck pair; a second, all-struck statement. */
function readWith(extra: Partial<FRGapPair>[] = []): FirstReadPreviewData {
  const pairs: FRGapPair[] = [
    pair({ id: "active" }),
    pair({ id: "struck", relevanceVerdict: "orthogonal", relevanceReason: "no distinctive token shared with the claim", record: "Unrelated co-mention of geniant at a gala." }),
    pair({ id: "struck-2", statementId: "s2", declared: "We are remote-first.", verdict: "confirmed", relevanceVerdict: "orthogonal", relevanceReason: "no distinctive token shared with the claim" }),
    ...extra.map(pair),
  ];
  const ordered = orderGapPairs(pairs);
  const gapStatements = groupGapStatements(ordered);
  return {
    ...EMPTY_FIRST_READ,
    company: { name: "Geniant", website: "https://geniant.com" },
    gapPairs: ordered,
    gapStatements,
    gapCounts: {
      contradicted: gapStatements.filter((s) => s.verdict === "contradicted").length,
      unechoed: gapStatements.filter((s) => s.verdict === "unechoed").length,
      confirmed: gapStatements.filter((s) => s.verdict === "confirmed").length,
      reverifying: 0,
    },
  } as unknown as FirstReadPreviewData;
}

function mountPreview(read: FirstReadPreviewData, decide = vi.fn<(d: OperatorDecision) => Promise<void>>(async () => {})) {
  const ctx: OperatorControls = { decide };
  const utils = render(
    <OperatorControlsContext.Provider value={ctx}>
      <ActGap read={read} />
    </OperatorControlsContext.Provider>,
  );
  return { ...utils, decide };
}

describe("(a) client surfaces render ZERO operator controls", () => {
  it("ActGap without the provider: no [data-fr-operator] node, even with an active + a struck pair present", () => {
    const { container } = render(<ActGap read={readWith()} />);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
  it("client story DeltaItemRow with an echoed delta: no [data-fr-operator] node", () => {
    const raw = assembleDeltaItems([{
      id: "d1", delta_type: "echoed", content_identity: "ci-1",
      declared_statement: "We close gaps in youth mental health care.",
      public_statement: "Edgewood is a leading nonprofit provider of youth mental health services.",
      public_provenance: "public_observed", quote: null, quote_source_text: null, event_date: null,
    }]);
    expect(raw).toHaveLength(1);
    const items: CheckItem[] = [{ kind: raw[0].kind, ref: raw[0].ref, text: raw[0].text, identity: raw[0].identity ?? "ci-1", delta: raw[0].delta, verdict: null, correctionText: null, capturedAt: null }];
    const { container } = render(<DeltaItemRow item={items[0]} onSet={vi.fn()} />);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
  });
});

describe("(b) the preview mount renders both markers in their slots", () => {
  it("relevance-controls in the ACTIVE pair's tag line; struck-pairs block under the statement, carrying Spare", () => {
    const { container } = mountPreview(readWith());
    const controls = container.querySelectorAll(SEL_CONTROLS);
    expect(controls.length).toBeGreaterThan(0);
    // the active pair's control is a Strike, sitting in its tag line (the flex meta row) — DOM position, not text
    const strike = container.querySelector(`${SEL_CONTROLS}[data-fr-action="strike"]`);
    expect(strike).not.toBeNull();
    expect(strike!.parentElement!.className).toContain("flex");
    expect(strike!.parentElement!.querySelector("span")!.textContent).toContain("Source:");
    // one struck block per statement that has struck pairs (s1 and s2) — each holds a Spare
    const blocks = container.querySelectorAll(SEL_STRUCK);
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(b.querySelector('[data-fr-struck-pair]')).not.toBeNull();
      expect(b.querySelector(`${SEL_CONTROLS}[data-fr-action="spare"]`)).not.toBeNull();
      // the struck block is INSIDE the statement's row (the evidence column), not a separate section
      expect(b.closest(".fr-row")).not.toBeNull();
    }
    // the machine's reason line is prefixed by who decided
    expect(blocks[0].textContent).toContain(`${OPERATOR_STRINGS.routerPrefix}no distinctive token shared with the claim`);
    // the signed labels are the ones rendered (one home)
    expect(strike!.textContent).toBe(OPERATOR_STRINGS.strike);
  });
});

describe("(c) an empty reason never reaches the write", () => {
  it("Record is inert with an empty/whitespace reason; decide is called once with the trimmed reason otherwise", async () => {
    const { container, decide } = mountPreview(readWith());
    fireEvent.click(container.querySelector(`${SEL_CONTROLS}[data-fr-action="strike"]`)!);
    const prompt = container.querySelector(`${SEL_CONTROLS}[data-fr-prompt="open"]`);
    expect(prompt).not.toBeNull();
    const input = prompt!.querySelector("input")!;
    const record = prompt!.querySelector("[data-fr-record]") as HTMLButtonElement;
    expect(input.placeholder).toBe(OPERATOR_STRINGS.reasonPlaceholder);
    expect(record.disabled).toBe(true);
    fireEvent.click(record);
    fireEvent.change(input, { target: { value: "   " } });
    expect(record.disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "  test spare — geniant fixture  " } });
    expect(record.disabled).toBe(false);
    fireEvent.click(record);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide.mock.calls[0][0]).toMatchObject({ verdict: "orthogonal", reason: "test spare — geniant fixture", pair: { id: "active", contentIdentity: "ident-active" } });
    // the prompt closes after a successful decision
    await waitFor(() => expect(container.querySelector(`${SEL_CONTROLS}[data-fr-prompt="open"]`)).toBeNull());
  });

  it("Spare from the struck block decides 'relevant' on the struck pair's identity", async () => {
    const { container, decide } = mountPreview(readWith());
    const spare = container.querySelector(`${SEL_STRUCK} ${SEL_CONTROLS}[data-fr-action="spare"]`)!;
    fireEvent.click(spare);
    const prompt = container.querySelector(`${SEL_CONTROLS}[data-fr-prompt="open"]`)!;
    fireEvent.change(prompt.querySelector("input")!, { target: { value: "test spare — geniant fixture" } });
    fireEvent.click(prompt.querySelector("[data-fr-record]")!);
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1));
    expect(decide.mock.calls[0][0]).toMatchObject({ verdict: "relevant", pair: { relevanceVerdict: "orthogonal" } });
  });

  it("write path: empty reason / no identity / frozen CB1 → RPC never called; a real decision calls set_relevance_override", async () => {
    const rpc = vi.fn(async () => ({ data: { override_id: "o1", superseded: null, patched: 1 }, error: null }));
    const client = { rpc };
    expect(await setRelevanceOverride(client, { companyId: "co", contentIdentity: "ident", verdict: "relevant", reason: "  " })).toEqual({ ok: false, skipped: "empty_reason" });
    expect(await setRelevanceOverride(client, { companyId: "co", contentIdentity: null, verdict: "relevant", reason: "x" })).toEqual({ ok: false, skipped: "no_identity" });
    expect(await setRelevanceOverride(client, { companyId: FROZEN_COMPANY_ID, contentIdentity: "ident", verdict: "relevant", reason: "x" })).toEqual({ ok: false, skipped: "frozen_company" });
    expect(rpc).not.toHaveBeenCalled();
    const out = await setRelevanceOverride(client, { companyId: "co", contentIdentity: "ident", verdict: "withdrawn", reason: " hand it back " });
    expect(out.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_relevance_override", {
      p_company_id: "co", p_pairing_kind: "public_vs_public", p_content_identity: "ident", p_verdict: "withdrawn", p_reason: "hand it back",
    });
  });
});

describe("(d) an operator-decided pair wears the provenance tag and Withdraw", () => {
  it("operator-spared ACTIVE pair: 'Operator · spared · September 3, 2026' + Withdraw, no Strike on that pair", () => {
    const read = readWith([{ id: "op-spared", statementId: "s3", declared: "We are SOC 2 certified.", relevanceVerdict: "relevant", relevanceProvider: "operator", relevanceModel: "operator_override", relevanceReason: "operator spares", relevanceDecidedAt: "2026-09-03T22:10:00.000Z" }]);
    const { container } = mountPreview(read);
    const tag = container.querySelector('[data-fr-operator-provenance="relevant"]')!;
    expect(tag).not.toBeNull();
    expect(tag.textContent).toBe("Operator · spared · September 3, 2026");
    const line = tag.parentElement!;
    expect(line.querySelector(`${SEL_CONTROLS}[data-fr-action="withdraw"]`)).not.toBeNull();
    expect(line.querySelector(`${SEL_CONTROLS}[data-fr-action="strike"]`)).toBeNull();
  });
  it("operator-STRUCK pair sits in the struck block with 'Operator · struck · <date>' + Withdraw, no Spare, no machine reason line", () => {
    const read = readWith([{ id: "op-struck", statementId: "s1", relevanceVerdict: "orthogonal", relevanceProvider: "operator", relevanceModel: "operator_override", relevanceReason: "operator strikes", relevanceDecidedAt: "2026-09-03" }]);
    const { container } = mountPreview(read);
    const row = container.querySelector('[data-fr-struck-pair="op-struck"]')!;
    expect(row.closest(SEL_STRUCK)).not.toBeNull();
    expect(row.querySelector('[data-fr-operator-provenance="orthogonal"]')!.textContent).toBe("Operator · struck · September 3, 2026");
    expect(row.querySelector('[data-fr-action="withdraw"]')).not.toBeNull();
    expect(row.querySelector('[data-fr-action="spare"]')).toBeNull();
    expect(row.textContent).not.toContain(OPERATOR_STRINGS.judgePrefix);
  });
});

describe("(e) Withdraw re-stamps in the same refresh — the relevance step fires once, only on a withdrawal", () => {
  const rpcOk = () => vi.fn(async () => ({ data: { override_id: "o", superseded: null, patched: 1 }, error: null }));
  const stepOk = () => vi.fn(async () => ({ data: { ok: true, drained: true }, error: null }));

  it("withdrawn → set_relevance_override once, then refresh-relevance-step exactly once with the company id", async () => {
    const rpc = rpcOk(); const invoke = stepOk();
    const out = await decideRelevance({ rpc }, { invoke }, { companyId: "co", contentIdentity: "ident", verdict: "withdrawn", reason: "hand it back" });
    expect(out.ok).toBe(true);
    expect(out.restamped).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(RELEVANCE_STEP_FN, { body: { company_id: "co" } });
    // ordering: the write lands before the step is asked to re-stamp
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
  });

  it("spare (relevant) and strike (orthogonal) → the step is NOT invoked", async () => {
    const rpc = rpcOk(); const invoke = stepOk();
    await decideRelevance({ rpc }, { invoke }, { companyId: "co", contentIdentity: "ident", verdict: "relevant", reason: "spare" });
    await decideRelevance({ rpc }, { invoke }, { companyId: "co", contentIdentity: "ident", verdict: "orthogonal", reason: "strike" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a refused/failed withdrawal write never fires the step", async () => {
    const invoke = stepOk();
    const failing = { rpc: vi.fn(async () => ({ data: null, error: { message: "frozen" } })) };
    await decideRelevance(failing, { invoke }, { companyId: "co", contentIdentity: "ident", verdict: "withdrawn", reason: "x" });
    await decideRelevance({ rpc: rpcOk() }, { invoke }, { companyId: "co", contentIdentity: "ident", verdict: "withdrawn", reason: "   " });
    expect(invoke).not.toHaveBeenCalled();
  });
});

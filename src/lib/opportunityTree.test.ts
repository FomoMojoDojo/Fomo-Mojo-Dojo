import { describe, expect, it } from "vitest";
import {
  buildOpportunityTree,
  collectLeafNodes,
  flattenOpportunityTree,
  pickDefaultOpenOpportunityId,
  type OpportunityTreeItem,
} from "./opportunityTree";

describe("opportunityTree", () => {
  it("builds parent-child hierarchy and flattens in parent-first order", () => {
    const rows: OpportunityTreeItem[] = [
      { id: "opp-1", opportunity_score: 15 },
      { id: "opp-2", parent_opportunity_id: "opp-1", opportunity_score: 14 },
      { id: "opp-3", parent_opportunity_id: "opp-2", opportunity_score: 13 },
      { id: "opp-4", parent_opportunity_id: "opp-1", opportunity_score: 12 },
    ];

    const tree = buildOpportunityTree(rows);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.id).toBe("opp-1");

    const ordered = flattenOpportunityTree(tree.roots).map((node) => node.id);
    expect(ordered.indexOf("opp-1")).toBeLessThan(ordered.indexOf("opp-2"));
    expect(ordered.indexOf("opp-2")).toBeLessThan(ordered.indexOf("opp-3"));
  });

  it("guards against cycles by dropping invalid parent links", () => {
    const rows: OpportunityTreeItem[] = [
      { id: "opp-a", parent_opportunity_id: "opp-b", opportunity_score: 10 },
      { id: "opp-b", parent_opportunity_id: "opp-a", opportunity_score: 9 },
    ];

    const tree = buildOpportunityTree(rows);
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(tree.nodesById.get("opp-a")?.parentId).toBeNull();
  });

  it("picks highest-ranked deepest leaf as default open node", () => {
    const rows: OpportunityTreeItem[] = [
      { id: "root", opportunity_score: 10 },
      { id: "child-low", parent_opportunity_id: "root", opportunity_score: 8 },
      { id: "child-high", parent_opportunity_id: "root", opportunity_score: 16 },
      { id: "grandchild", parent_opportunity_id: "child-high", opportunity_score: 16 },
    ];

    const tree = buildOpportunityTree(rows);
    const leaves = collectLeafNodes(tree.roots).map((node) => node.id);
    expect(leaves).toContain("grandchild");
    expect(pickDefaultOpenOpportunityId(tree.roots)).toBe("grandchild");
  });
});

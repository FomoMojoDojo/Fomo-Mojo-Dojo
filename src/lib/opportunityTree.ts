export type OpportunityTreeItem = {
  id: string;
  parent_opportunity_id?: string | null;
  opportunity_score?: number | null;
  step_number?: number | null;
  created_at?: string | null;
};

export type OpportunityTreeNode<T extends OpportunityTreeItem = OpportunityTreeItem> = {
  id: string;
  item: T;
  parentId: string | null;
  depth: number;
  children: OpportunityTreeNode<T>[];
};

function asNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nodeSort<T extends OpportunityTreeItem>(a: OpportunityTreeNode<T>, b: OpportunityTreeNode<T>) {
  const scoreDelta = asNumber(b.item.opportunity_score, 0) - asNumber(a.item.opportunity_score, 0);
  if (scoreDelta !== 0) return scoreDelta;

  const stepDelta = asNumber(a.item.step_number, 999) - asNumber(b.item.step_number, 999);
  if (stepDelta !== 0) return stepDelta;

  const createdAtDelta = Date.parse(String(b.item.created_at || "")) - Date.parse(String(a.item.created_at || ""));
  if (Number.isFinite(createdAtDelta) && createdAtDelta !== 0) return createdAtDelta;

  return String(a.id).localeCompare(String(b.id));
}

function normalizeParentId<T extends OpportunityTreeItem>(node: OpportunityTreeNode<T>, map: Map<string, OpportunityTreeNode<T>>) {
  const parentId = String(node.parentId || "").trim();
  if (!parentId || parentId === node.id || !map.has(parentId)) {
    node.parentId = null;
    return;
  }

  const seen = new Set<string>([node.id]);
  let cursor: string | null = parentId;

  while (cursor) {
    if (seen.has(cursor)) {
      node.parentId = null;
      return;
    }
    seen.add(cursor);
    const candidate = map.get(cursor);
    if (!candidate) {
      node.parentId = null;
      return;
    }
    const next = String(candidate.parentId || "").trim();
    cursor = next || null;
  }

  node.parentId = parentId;
}

function assignDepth<T extends OpportunityTreeItem>(node: OpportunityTreeNode<T>, depth: number, visited: Set<string>) {
  if (visited.has(node.id)) return;
  visited.add(node.id);
  node.depth = depth;
  node.children.sort(nodeSort);
  for (const child of node.children) {
    assignDepth(child, depth + 1, visited);
  }
}

export function flattenOpportunityTree<T extends OpportunityTreeItem>(roots: OpportunityTreeNode<T>[]) {
  const ordered: OpportunityTreeNode<T>[] = [];
  const walk = (node: OpportunityTreeNode<T>) => {
    ordered.push(node);
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return ordered;
}

export function collectLeafNodes<T extends OpportunityTreeItem>(roots: OpportunityTreeNode<T>[]) {
  const leaves: OpportunityTreeNode<T>[] = [];
  const walk = (node: OpportunityTreeNode<T>) => {
    if (node.children.length === 0) {
      leaves.push(node);
      return;
    }
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return leaves;
}

export function pickDefaultOpenOpportunityId<T extends OpportunityTreeItem>(roots: OpportunityTreeNode<T>[]) {
  const leaves = collectLeafNodes(roots);
  if (leaves.length === 0) return null;

  const ranked = [...leaves].sort((a, b) => {
    const scoreDelta = asNumber(b.item.opportunity_score, 0) - asNumber(a.item.opportunity_score, 0);
    if (scoreDelta !== 0) return scoreDelta;
    const depthDelta = b.depth - a.depth;
    if (depthDelta !== 0) return depthDelta;
    return nodeSort(a, b);
  });

  return ranked[0]?.id || null;
}

export function buildOpportunityTree<T extends OpportunityTreeItem>(items: T[]) {
  const nodesById = new Map<string, OpportunityTreeNode<T>>();
  const safeItems = Array.isArray(items) ? items : [];

  for (const item of safeItems) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    nodesById.set(id, {
      id,
      item,
      parentId: String(item.parent_opportunity_id || "").trim() || null,
      depth: 0,
      children: [],
    });
  }

  for (const node of nodesById.values()) {
    normalizeParentId(node, nodesById);
  }

  const roots: OpportunityTreeNode<T>[] = [];
  for (const node of nodesById.values()) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }
    const parent = nodesById.get(node.parentId);
    if (!parent) {
      node.parentId = null;
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  roots.sort(nodeSort);

  const visited = new Set<string>();
  for (const root of roots) {
    assignDepth(root, 0, visited);
  }

  const ordered = flattenOpportunityTree(roots);
  return {
    roots,
    nodesById,
    ordered,
  };
}

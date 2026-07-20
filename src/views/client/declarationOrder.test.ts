// BRT-1 fix — temporal-dead-zone guard for the workshop view.
//
// BRT-1 read `companyId` / `needsRefreshKey` inside a hook DEPENDENCY ARRAY placed
// above their `const` declarations in the same component body. Dependency arrays are
// evaluated during render, and `const` bindings are hoisted-but-uninitialised, so the
// whole workshop page threw "Cannot access 'companyId' before initialization" on every
// tab for every company. tsc and vite build both passed it — TypeScript does not model
// TDZ across a function body — so a static guard is the thing that actually catches it.
//
// This scans for the precise failure shape: an identifier named in a dep-array line
// that appears ABOVE that identifier's own component-scope declaration.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [
  "src/views/client/ClientRefinePreviewWorkshopView.tsx",
  "src/views/client/workshop/tabs/InputsTab.tsx",
  "src/views/client/ClientRefinePreviewRoutesView.tsx",
];

/** `const foo = …`, `const [foo, setFoo] = …`, `const { foo, bar } = …` at 2-space (component) scope. */
function declarationLines(lines: string[]): Map<string, number> {
  const decl = new Map<string, number>();
  lines.forEach((line, i) => {
    const m = /^ {2}const\s+(\[[^\]]+\]|\{[^}]+\}|[A-Za-z0-9_$]+)/.exec(line);
    if (!m) return;
    const raw = m[1];
    const names = raw.startsWith("[") || raw.startsWith("{")
      ? raw.slice(1, -1).split(",").map((s) => s.split(":").pop()!.replace(/\.\.\./, "").trim())
      : [raw];
    for (const n of names) {
      const name = n.replace(/=.*$/, "").trim();
      // First declaration wins — a later shadow in a nested scope is not the binding
      // a render-time dep array would resolve to.
      if (name && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !decl.has(name)) decl.set(name, i);
    }
  });
  return decl;
}

/** Lines that close a hook with a dependency array — evaluated at RENDER. */
function dependencyArrayLines(lines: string[]): Array<{ index: number; body: string }> {
  const out: Array<{ index: number; body: string }> = [];
  lines.forEach((line, i) => {
    const m = /^\s*\},\s*\[(.*)\]\s*\);?\s*$/.exec(line);
    if (m) out.push({ index: i, body: m[1] });
  });
  return out;
}

describe("temporal-dead-zone guard — no dep array may reference a const declared below it", () => {
  for (const rel of FILES) {
    it(`${rel} has no use-before-declaration in hook dependency arrays`, () => {
      const src = readFileSync(path.resolve(process.cwd(), rel), "utf8");
      const lines = src.split("\n");
      const decl = declarationLines(lines);

      const violations: string[] = [];
      for (const { index, body } of dependencyArrayLines(lines)) {
        const identifiers = body.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
        for (const id of identifiers) {
          const declaredAt = decl.get(id);
          if (declaredAt !== undefined && declaredAt > index) {
            violations.push(
              `${rel}:${index + 1} dep array reads "${id}", declared below at line ${declaredAt + 1}`,
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});

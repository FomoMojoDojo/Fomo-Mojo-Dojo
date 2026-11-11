// U6-64 — NO COMPANY CAN RENDER FROM A LITERAL (signed 2026-11-11).
//
// WHAT THIS IS FOR. PUBLIC_CAFE_BARRA_FALLBACK was a real client's name, website and three scores,
// written into src/hooks/useCompany.tsx as a mock. Nobody meant it to reach a client, and it reached
// every signed-out visitor on twelve routes. src/lib/mockData.ts held 340 more lines of another
// client's material, unreferenced, one import away from a page. Both are gone. This is what stops a
// third one.
//
// IT ASKS THE DATABASE WHO THE COMPANIES ARE. A test that hunts for the string "Cafe Barra" only
// ever catches the literal somebody already found. This takes every company name and website on the
// live fleet and looks for each of them in the module graph that main.tsx actually pulls in — so a
// literal planted for a company that does not exist yet starts failing the day that company is
// created, and a test fixture named "zz …" is covered on the same terms as a client.
//
// "CAN RENDER", NOT "APPEARS" (the signed reading). A comment may discuss a company — several do,
// explaining exactly this deletion — and a comment renders nothing. So the search is over STRING
// LITERALS ONLY, taken from TypeScript's own scanner. The distinction is the whole test: run it over
// raw text and the honest history written above this line would fail it.
//
// WHY THE REAL PARSER AND NOT A STRIPPER. The first version of this test stripped comments with a
// hand-written state machine, and it reported three files that were clean: a regex literal
// containing a quote (`/['\u2019]/`) put the machine into string mode, after which it stopped
// recognising comments at all, and block comments naming three clients came through as "code". A
// test that is wrong in the quiet direction is worse than no test. ts.forEachChild over the real AST
// cannot make that mistake, and it answers a sharper question: a string literal is the only thing
// that can reach a screen.
//
// ONE ALLOW-LIST ENTRY, AND IT MUST STAY TRUE. PREFERRED_COMPANY_NAME is a company name in the
// graph, in code, not in a comment. It is a SELECTION key — compared against companies[].name to
// pick an operator's default — and never rendered. It is allowed by name, with that reason, and the
// last test in this file fails if the entry stops matching reality: wrong file, missing constant, or
// the literal having found its way into a render path.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "main.tsx");

/**
 * THE ONE ALLOWED COMPANY LITERAL IN THE GRAPH.
 *
 * `file` and `constant` are both asserted to still exist, and `mustNotAppearIn` names the shapes
 * that would mean it had become renderable.
 */
/**
 * OUR OWN ORGANISATION IS NOT A CLIENT.
 *
 * FomoMojoDojo is a `companies` row like any other — it is our own MojoMap — and its name is in the
 * product's copy on purpose, including the signed S-U6-1: "This account isn't connected to a
 * MojoMap™ yet. FomoMojoDojo sets up access." Naming ourselves to a client is the opposite of
 * leaking a client's name to a stranger, so this census is about everyone else's names.
 *
 * It is matched by NAME against the row, not hardcoded as a pass: if the row is renamed the census
 * follows it, and the non-vacuity test below fails if the exclusion ever removes every name.
 */
const OWN_ORGANISATION = "FomoMojoDojo";

const ALLOWED = [
  {
    file: "src/hooks/useCompany.tsx",
    constant: "PREFERRED_COMPANY_NAME",
    literal: "cafe barra",
    why:
      "A SELECTION key, not content. pickDefaultCompanyId compares it against companies[].name to " +
      "choose an operator's default company (N4, 2026-09-26) and it is never rendered: the only use " +
      "is `company.name.trim().toLowerCase() === PREFERRED_COMPANY_NAME`. Moving it to data is filed " +
      "with U6-47.",
  },
] as const;

// ── the module graph ────────────────────────────────────────────────────────────────────────────
const IMPORT_RE = /(?:^|[\s;{}()])(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"];

function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package; not our source
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate;
      } catch { /* a directory match — keep looking */ }
    }
  }
  return null;
}

function moduleGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (!spec) continue;
      const next = resolveSpec(file, spec);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

/**
 * Every string a module could put on a screen: string literals and the fixed parts of template
 * literals. Identifiers, property names, comments, numbers and regexes are not collected — none of
 * them carries prose to a reader.
 */
export function renderableStrings(fileName: string, src: string): string[] {
  // setParentNodes MUST be true: the key-vs-content test below reads node.parent.
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, /\.tsx?$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // A property NAME can be a string literal ({ "mojo_score": 1 }); that is a key, not content.
      const parent = node.parent;
      const isKey =
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        ts.isPropertySignature(parent) ||
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "require");
      if (!isKey) out.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      out.push(node.head.text);
      for (const span of node.templateSpans) out.push(span.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

function findContainer(): string | null {
  try {
    const out = execFileSync("docker", ["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"], { encoding: "utf8" }).trim();
    return out.split("\n").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

function companyLiterals(container: string): { names: string[]; hosts: string[] } {
  const out = execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-A", "-F", "|", "-t", "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: "select coalesce(name,''), coalesce(website,'') from companies;" },
  );
  const names: string[] = [];
  const hosts: string[] = [];
  for (const line of out.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [name, website] = line.split("|");
    // Two characters is not a name worth hunting; it produces matches in every identifier.
    if (name && name.trim().length >= 4 && name.trim() !== OWN_ORGANISATION) names.push(name.trim());
    if (website && name.trim() !== OWN_ORGANISATION) {
      const host = website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
      if (host.length >= 6) hosts.push(host);
    }
  }
  return { names: [...new Set(names)], hosts: [...new Set(hosts)] };
}

const container = findContainer();
const graph = moduleGraph(ENTRY);
/** path → every renderable string in it. */
const strings = new Map<string, string[]>();
/** path → raw source, for the allow-list's own structural checks. */
const raw = new Map<string, string>();
for (const file of graph) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  raw.set(rel, text);
  strings.set(rel, renderableStrings(file, text));
}

describe("U6-64: no company can render from a literal in the main.tsx module graph", () => {
  it("walks a real graph (non-vacuity)", () => {
    // If the walker silently resolved nothing, every assertion below would pass on an empty set.
    expect(graph.length, "the module graph is implausibly small — the resolver is broken").toBeGreaterThan(200);
    expect([...strings.keys()]).toContain("src/App.tsx");
    expect([...strings.keys()]).toContain("src/hooks/useCompany.tsx");
    expect([...strings.keys()]).toContain("src/views/client/firstReadPreview/FirstReadPreviewView.tsx");
    // the graph reaches edge-function _shared modules too, because src imports them directly
    // (src/lib/firstReadFill/rfChannelsAdmission.ts → _shared/ownWordsExtract). They are in the
    // browser bundle, so they are in this census.
    expect([...strings.keys()].some((f) => f.startsWith("supabase/functions/_shared/"))).toBe(true);
    // and it must NOT drag in test files, which legitimately name companies as fixtures
    expect([...strings.keys()].filter((f) => /\.test\.tsx?$/.test(f))).toEqual([]);
    // every file yielded SOME strings, or the collector silently returned nothing
    expect([...strings.values()].reduce((n, v) => n + v.length, 0)).toBeGreaterThan(5000);
  });

  it("collects what can render and nothing else", () => {
    const of = (src: string) => renderableStrings("probe.ts", src);
    expect(of('const a = 1; // Cafe Barra')).toEqual([]);
    expect(of('/* Cafe Barra */ const a = 1;')).toEqual([]);
    expect(of('/** Cafe Barra */ const a = 1;')).toEqual([]);
    expect(of('const s = "Cafe Barra";')).toEqual(["Cafe Barra"]);
    expect(of('const t = `a ${x} Cafe Barra`;')).toEqual(["a ", " Cafe Barra"]);
    // the regex-literal case the hand-written stripper got wrong: a quote inside a regex must not
    // put the collector into string mode and swallow the following comment
    expect(of("const re = /['\u2019]/g;\n/* Cafe Barra */")).toEqual([]);
    // a property KEY is not content
    expect(of('const o = { "mojo_score": 1 };')).toEqual([]);
    // an import specifier is not content
    expect(of('import x from "./Cafe Barra";')).toEqual([]);
  });

  if (!container) {
    it.skip("SKIPPED — no local supabase_db container reachable (run `supabase start`)", () => {});
  } else {
    const { names, hosts } = companyLiterals(container);

    it("reads the fleet's names and websites (non-vacuity)", () => {
      expect(names.length, "no company names came back — the census would pass vacuously").toBeGreaterThan(5);
      expect(hosts.length).toBeGreaterThan(0);
      // the exclusion removes exactly one organisation, ours, and never empties the hunt
      expect(names, "the operator's own organisation should be excluded").not.toContain(OWN_ORGANISATION);
      expect(names.some((n) => n.toLowerCase().includes("cafe barra")), "the fleet's real clients must be in the hunt").toBe(true);
    });

    it("no company NAME can render from a literal anywhere in the graph", () => {
      const allowed = new Set(ALLOWED.map((a) => `${a.file}::${a.literal.toLowerCase()}`));
      const hits: string[] = [];
      for (const [file, literals] of strings) {
        for (const lit of literals) {
          const lower = lit.toLowerCase();
          for (const name of names) {
            if (!lower.includes(name.toLowerCase())) continue;
            if (allowed.has(`${file}::${name.toLowerCase()}`)) continue;
            hits.push(`${file}: ${JSON.stringify(name)} in ${JSON.stringify(lit.slice(0, 60))}`);
          }
        }
      }
      expect(
        hits,
        `a company's name is in code (not a comment) in the module graph reachable from main.tsx. ` +
          `A literal in src/ is one import from a surface — that is how the fallback company reached ` +
          `twelve routes. Remove it, or add it to ALLOWED with the reason it cannot render.`,
      ).toEqual([]);
    });

    it("no company WEBSITE can render from a literal anywhere in the graph", () => {
      const hits: string[] = [];
      for (const [file, literals] of strings) {
        for (const lit of literals) {
          const lower = lit.toLowerCase();
          for (const host of hosts) if (lower.includes(host.toLowerCase())) hits.push(`${file}: ${host} in ${JSON.stringify(lit.slice(0, 60))}`);
        }
      }
      expect(hits, "a company's website can render from a literal in the module graph").toEqual([]);
    });

    it("no module carries a company-shaped SCORE literal", () => {
      // EXACT, AND NARROWER THAN IT SOUNDS. This catches the deleted fallback's shape and only that:
      // a property assignment naming a score column whose value is a typed non-zero number, as in
      // `mojo_score: 64`. Zero is excluded — it is the "no score yet" placeholder several builders
      // use and it renders as an absence.
      //
      // WHAT IT DELIBERATELY DOES NOT CATCH: a numeric fallback written as an expression, e.g.
      // `activeCompany?.mojo_score ?? 22`. Those cannot be told apart from sort sentinels
      // (`mojo_score ?? -1` in AdminCompanies.tsx orders unscored rows last) without reading
      // intent, and a census that guesses would be turned off. The one real instance found on
      // 2026-11-11 is filed as U6-67: src/pages/MapSignalPrototype.tsx:349 renders 22 as the score
      // when the company has none.
      const SCORE_KEYS = new Set(["mojo_score", "potential_score", "projected_score"]);
      const hits: string[] = [];
      for (const [file, text] of raw) {
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const visit = (node: ts.Node): void => {
          if (ts.isPropertyAssignment(node)) {
            const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
            if (name && SCORE_KEYS.has(name)) {
              const init = node.initializer;
              const num =
                ts.isNumericLiteral(init) ? Number(init.text)
                : ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)
                  ? -Number(init.operand.text)
                  : null;
              if (num !== null && num !== 0) {
                hits.push(`${file}: ${name}: ${num}`);
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sf, visit);
      }
      expect(hits, "a non-zero score is written into an object literal; a rendered score comes from the row").toEqual([]);
    });
  }

  it("the allow-list is not folklore: every entry still matches the file it names", () => {
    for (const entry of ALLOWED) {
      const text = raw.get(entry.file);
      expect(text, `${entry.file} is on the allow-list but is not in the module graph — remove the entry`).toBeTruthy();
      expect(
        text!,
        `${entry.file} no longer defines ${entry.constant} — the allow-list entry is stale, remove it`,
      ).toContain(entry.constant);
      expect(
        text!.toLowerCase(),
        `${entry.file} no longer contains ${JSON.stringify(entry.literal)} — the allow-list entry is stale`,
      ).toContain(entry.literal.toLowerCase());
      expect(entry.why.trim().length, "an allow-list entry needs its reason written down").toBeGreaterThan(40);
    }
  });

  it("the allowed literal is still only COMPARED, never rendered", () => {
    // The reason the entry is allowed is that its single use is an equality test. If it gains a
    // second use the reason stops being true, and this is what notices.
    const text = raw.get("src/hooks/useCompany.tsx")!;
    const uses = [...text.matchAll(/PREFERRED_COMPANY_NAME/g)].length;
    expect(uses, "PREFERRED_COMPANY_NAME has more uses than its declaration and one comparison").toBe(2);
    expect(text).toMatch(/===\s*PREFERRED_COMPANY_NAME/);
    // and it must not reach JSX or a template
    expect(text).not.toMatch(/\{\s*PREFERRED_COMPANY_NAME\s*\}/);
    expect(text).not.toMatch(/\$\{\s*PREFERRED_COMPANY_NAME\s*\}/);
  });
});

// ── SOURCE CENSUS over the Diagnose component files (step 7 b-non-vacuity + c, 2026-11-07) ──────
//
// WHY THIS FILE EXISTS. diagnoseStrings.census.test.ts proves every string in strings.ts is signed.
// On its own that is worth little: a screen could simply write its own words in JSX and never go
// near strings.ts. These two checks close that door, and together with the key-coverage assertion in
// the other file they make the pair exhaustive:
//
//   (b-non-vacuity) NO COMPONENT HOLDS A WORD OF ITS OWN. Not in a JSX text node, not in a string
//                   literal. Every word must come through strings.ts, which is censused.
//   (c)             NO DIGIT IN JSX TEXT. A typed count or date is the specific dishonesty the
//                   spec's closing line forbids ("no count, date or figure is typed in"), and a
//                   typed figure in JSX is exactly how it would happen.
//
// SCOPE: JSX TEXT NODES and STRING LITERALS, which is where rendered words live. A number inside a
// JS expression is geometry or formatting — `padStart(2, "0")`, `rotate(${i * 1.6}deg)`, the cone's
// pixel offsets — and is deliberately out of scope; those are not counts and never reach the reader
// as such.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const DIR = __dirname;

/** The component files. strings.ts is excluded — words are its whole job — as is each test. */
const COMPONENTS = [
  "DiagnoseFlowView.tsx",
  "items.tsx",
  "walk.tsx",
  "screens/Send.tsx",
  "screens/Welcome.tsx",
  "screens/gather.tsx",
  "home/Home.tsx",
  "home/Before.tsx",
  "home/Today.tsx",
  "home/Ahead.tsx",
  "home/SeeAll.tsx",
];

function source(rel: string): string {
  return fs.readFileSync(path.join(DIR, rel), "utf8");
}

/** Comments and import statements carry no rendered text. */
function stripNonRendering(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*import[\s\S]*?from\s+"[^"]*";\s*$/gm, " ")
    .replace(/^\s*import\s+"[^"]*";\s*$/gm, " ");
}

/** A real left-to-right scan for string literals, because naive quote pairing is wrong: on the line
 *  `path="send" element={<Navigate to="home" />}` it pairs the CLOSE of "send" with the OPEN of
 *  "home" and reports ` element={<Navigate to=` as prose. This returns the literals and, separately,
 *  the code with every literal blanked — which is what the JSX scan then reads. */
function lex(src: string): { literals: string[]; code: string } {
  const text = stripNonRendering(src);
  const literals: string[] = [];
  let code = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let lit = "";
      while (j < text.length && text[j] !== quote) {
        if (text[j] === "\\") { lit += text[j + 1] ?? ""; j += 2; continue; }
        lit += text[j];
        j += 1;
      }
      literals.push(lit);
      code += quote + quote; // blanked, so the JSX scan cannot read into a literal
      i = j + 1;
      continue;
    }
    code += ch;
    i += 1;
  }
  return { literals, code };
}

/** JSX text nodes: what sits between tags without passing through a brace.
 *
 *  TWO THINGS THIS MUST NOT READ AS PAGE TEXT, both of which it did at first:
 *   · a JS comparison — `text.length > 0 ? (` — so the `>` must not be preceded by a space or an
 *     operator character. A JSX tag closes with `">`, `}>`, `/>` or a word character.
 *   · a TypeScript generic — `useState<Section>("today")` — so a candidate containing `(`, `)`, `=`
 *     or `;` is code, not prose. No signed string on these screens contains any of them. */
function jsxTextNodes(src: string): string[] {
  const { code } = lex(src);
  const out: string[] = [];
  for (const m of code.matchAll(/(?<![\s=!<>+\-*/&|?:,(])>([^<>{}]+)</g)) {
    const t = m[1].trim();
    if (t.length === 0) continue;
    if (/[()=;]/.test(t)) continue;
    out.push(t);
  }
  return out;
}

/** String literals that are not a class name, an attribute value, a CSS value or a developer Error.
 *
 *  `new Error("...")` IS EXCLUDED and must be: a thrown invariant message is read by whoever is
 *  debugging, never by a client, so it is not a client-facing string and has nothing to sign. */
function proseLiterals(src: string): string[] {
  const guarded = stripNonRendering(src)
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\})/g, " ")
    .replace(/(?:data|aria)-[A-Za-z-]+="[^"]*"/g, " ")
    .replace(/role="[^"]*"/g, " ")
    .replace(/new Error\([^)]*\)/g, " ");
  return lex(guarded).literals
    // TWO OR MORE LOWERCASE WORDS = prose. A single token is a key, a selector or an enum value.
    .filter((lit) => /[a-z]{2,}\s+[a-z]{2,}/.test(lit));
}

describe("(b) non-vacuity — no Diagnose component holds a word of its own", () => {
  for (const rel of COMPONENTS) {
    it(`${rel}: no prose in a JSX text node`, () => {
      const prose = jsxTextNodes(source(rel)).filter((t) => /[A-Za-z]{3,}/.test(t));
      expect(prose, `${rel} renders its own words instead of a signed string: ${JSON.stringify(prose)}`).toEqual([]);
    });

    it(`${rel}: no prose string literal`, () => {
      const lits = proseLiterals(source(rel));
      expect(lits, `${rel} carries an unsigned string literal: ${JSON.stringify(lits)}`).toEqual([]);
    });
  }

  it("the check is not vacuous — it catches a planted literal", () => {
    // A hand-planted sentence in each shape must be seen, or the two checks above prove nothing.
    expect(jsxTextNodes(`<p>Send what Edgewood already has.</p>`)).toEqual(["Send what Edgewood already has."]);
    expect(proseLiterals(`const x = "Send what Edgewood already has.";`))
      .toEqual(["Send what Edgewood already has."]);
    // ...and does not fire on the things it must tolerate.
    expect(jsxTextNodes(`<p className="dg-h">{SEND.h(company)}</p>`)).toEqual([]);
    expect(proseLiterals(`<div className="dg-row dg-row-main" data-dg-item="1" />`)).toEqual([]);
    // the lexer, not naive quote pairing: two adjacent literals on one line are two literals
    expect(proseLiterals(`<Route path="send" element={<Navigate to="home" replace />} />`)).toEqual([]);
    // a TypeScript generic is code, not page text
    expect(jsxTextNodes(`const [a, b] = useState<Section>("today");`)).toEqual([]);
    expect(jsxTextNodes(`const r = useRef<HTMLDivElement | null>(null);`)).toEqual([]);
    // a developer Error message is excluded, but a rendered sentence is not
    expect(proseLiterals(`throw new Error("usePageState outside PageStateProvider");`)).toEqual([]);
    expect(proseLiterals(`const t = "usePageState outside PageStateProvider";`))
      .toEqual(["usePageState outside PageStateProvider"]);
  });

  it("every component file is censused — a new screen cannot slip past", () => {
    const found: string[] = [];
    const walk = (dir: string, prefix = "") => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { walk(path.join(dir, entry.name), rel); continue; }
        if (!/\.tsx$/.test(entry.name) || /\.test\.tsx$/.test(entry.name)) continue;
        found.push(rel);
      }
    };
    walk(DIR);
    expect(found.slice().sort()).toEqual(COMPONENTS.slice().sort());
  });
});

describe("(c) no count, date or figure is typed into JSX text", () => {
  for (const rel of COMPONENTS) {
    it(`${rel}: no digit in a JSX text node`, () => {
      const withDigits = jsxTextNodes(source(rel)).filter((t) => /\d/.test(t));
      expect(
        withDigits,
        `${rel} types a number into the page — every number must be computed from a row or omitted: ${JSON.stringify(withDigits)}`,
      ).toEqual([]);
    });
  }

  it("the digit check is not vacuous", () => {
    expect(jsxTextNodes(`<span>5 documents · 4 added</span>`)).toEqual(["5 documents · 4 added"]);
    expect(jsxTextNodes(`<span>2 of 4 lines both say it</span>`).filter((t) => /\d/.test(t))).toHaveLength(1);
    // Geometry inside an expression is not a typed count and must not fire.
    expect(jsxTextNodes(`<span style={{ left: 420 }} />`).filter((t) => /\d/.test(t))).toEqual([]);
  });

  it("the canvas's example figures are nowhere in the component source", () => {
    // "5 documents · 4 added", "2 of 4", "14 sources" are canvas CONTENT, not data (spec's closing
    // line). If any of them is in a component, something was copied instead of computed.
    for (const rel of COMPONENTS) {
      const src = source(rel);
      for (const forbidden of ["5 documents", "4 added", "2 of 4", "14 sources", "3 on the table", "6 groups"]) {
        expect(src.includes(forbidden), `${rel} hardcodes the canvas figure "${forbidden}"`).toBe(false);
      }
    }
  });
});

describe("the route mounts nothing that can reach an outside model", () => {
  it("no Diagnose file invokes an edge function at all", () => {
    const all = [...COMPONENTS, "strings.ts", "useDiagnoseData.ts"];
    for (const rel of all) {
      const src = stripNonRendering(source(rel));
      expect(src.includes("functions.invoke"), `${rel} invokes an edge function`).toBe(false);
    }
  });

  it("no Diagnose file imports a hook or view that invokes one", () => {
    // The nine invokers from the STOP 1 callers census, plus the two refresh-* the ruling excluded.
    const FORBIDDEN = [
      "useDriftScan", "useOpportunityProposalHandlers", "useRouteProposalHandlers", "useDeltaStepRun",
      "CouncilRecommendationsPanel", "CouncilPanel", "RouteInspectPanel",
      "ClientRefinePreviewWorkshopView", "ClientRefinePreviewRoutesView",
    ];
    const all = [...COMPONENTS, "strings.ts", "useDiagnoseData.ts"];
    for (const rel of all) {
      const src = stripNonRendering(source(rel));
      for (const f of FORBIDDEN) {
        expect(src.includes(f), `${rel} imports ${f}, which invokes a forbidden function`).toBe(false);
      }
    }
  });

  it("the invoke check is not vacuous — it still catches a real call", () => {
    expect(stripNonRendering(`const r = await supabase.functions.invoke("propose-route-changes");`)
      .includes("functions.invoke")).toBe(true);
    expect(stripNonRendering(`// there is no functions.invoke in this file`).includes("functions.invoke")).toBe(false);
  });

  it("useDiagnoseData holds no write of any kind", () => {
    const src = stripNonRendering(source("useDiagnoseData.ts"));
    for (const write of [".insert(", ".update(", ".upsert(", ".delete("]) {
      expect(src.includes(write), `useDiagnoseData performs ${write}`).toBe(false);
    }
    expect(src.includes(".select(")).toBe(true); // and it does read, so the check is not vacuous
  });

  // U6-14 (2026-11-10): `.rpc(` used to be banned outright here, as a proxy for "no write path".
  // W9's people now come through interview_people — a read-only SECURITY DEFINER door (tier 1: name,
  // role and date, never the text), because reading interview_records directly answered differently
  // for an operator and a client. So the ban becomes an ALLOWLIST BY NAME: a read-only door may be
  // added to this list with its brief, and any other rpc still fails this check. A function that
  // writes must never appear here — the probe ruling of 2026-11-07 is the standing reason.
  it("the only rpc useDiagnoseData calls is a named read-only door", () => {
    const src = stripNonRendering(source("useDiagnoseData.ts"));
    const READ_ONLY_DOORS = ["interview_people"];
    const called = [...src.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(called.length, "useDiagnoseData calls no rpc at all — this check is vacuous").toBeGreaterThan(0);
    for (const fn of called) {
      expect(READ_ONLY_DOORS, `useDiagnoseData calls rpc ${fn}, which is not a named read-only door`).toContain(fn);
    }
  });
});

// ── THE LOVABLE REFERENCE IS REFERENCE ONLY ────────────────────────────────────────────────────
//
// docs/lovable-reference/mojomap-diagnose/src/ is the handoff the MH1 home was ported FROM. It is
// read by people, never by the build: it imports @tanstack/react-router and Tailwind v4 utilities
// this app does not have, so an import of it would not merely be wrong — it would not compile. The
// directory sits outside tsconfig.app.json's `include` and outside the Vite graph; this is the
// assertion that says so out loud, and fails the day someone reaches for it.
describe("the Lovable reference is never imported or built", () => {
  const REF = path.join(DIR, "../../../../docs/lovable-reference");

  it("the reference is present, so the check is not vacuous", () => {
    expect(fs.existsSync(path.join(REF, "mojomap-diagnose/src/components/home/CardStack.tsx"))).toBe(true);
  });

  it("no file under src/ imports it", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|css)$/.test(e.name)) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/lovable-reference|mojomap-diagnose/.test(src) && !/census\.test\.ts$/.test(e.name)) {
          hits.push(path.relative(path.join(DIR, "../../../.."), full));
        }
      }
    };
    walk(path.join(DIR, "../../../../src"));
    expect(hits, `these reach into the reference: ${hits.join(", ")}`).toEqual([]);
  });

  it("tsconfig.app.json compiles src only", () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(DIR, "../../../../tsconfig.app.json"), "utf8"));
    expect(tsconfig.include).toEqual(["src"]);
  });
});

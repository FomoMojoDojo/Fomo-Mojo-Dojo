// U6-15 — THE STANDING CENSUS: every source a client page reads is member-readable, or it is on an
// explicit operator-only list that names what the page renders instead.
//
// WHY THIS EXISTS. On 2026-11-10 the First Read read five sources a company member could not see, and
// the worst consequence was not an empty page. The Findings beat picks its empty-state line from
// `integrity_runs` (member-readable) while the findings themselves were admin-only, so a member on
// Edgewood would have been shown the signed sentence "We read the outside record and nothing stood
// out on its own yet." over 18 findings they owned. 22 companies were in that state. A page whose
// data and whose explanation of missing data have DIFFERENT readers will state a falsehood
// confidently, and no test of either half alone can see it.
//
// So the rule this test enforces is about READER PARITY, not about access: a client page may read a
// source only if the client can read it, or if someone has written down what the page shows instead.
//
// Member-readability is resolved from the live catalogue, never from a hand-kept list: a relation
// counts when `authenticated` may SELECT it and either RLS is off or some SELECT policy carries a
// company_members arm. The narrow SECURITY DEFINER doors (findings_client, interview_people, …) count
// by being functions `authenticated` may EXECUTE — they ARE the member's read.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

/** The modules that make up the two client-reachable surfaces and the hooks they call. */
const CLIENT_SOURCE_FILES = [
  "src/views/client/firstReadPreview/useFirstReadPreviewData.ts",
  "src/hooks/useFirstReadOpenQuestions.ts",
  "src/lib/firstReadMarks/useFirstReadMarks.ts",
  "src/views/client/diagnoseFlow/useDiagnoseData.ts",
  "src/lib/diagnoseRunning.ts",
  "src/hooks/useCompanyFiles.ts",
  "src/hooks/useFileProposals.ts",
  "src/hooks/useRoutes.ts",
  "src/hooks/useOdiNeeds.ts",
  "src/lib/claims/useCompanyClaims.ts",
  // U6 part 1 (2026-11-11) — the landing itself is a client-reachable surface now. /start decides
  // where a member goes, and it decides from two reads; if either one is not member-readable the
  // landing resolves on an admin's view of the world and sends a member to a page that then comes
  // up empty. That is the census's whole subject, one step earlier than before.
  "src/lib/landing/firstReadReady.ts",
  // The member's own company list. Its member branch reads company_members with companies embedded,
  // which is the read that decides what the gate will let them open.
  "src/hooks/useCompany.tsx",
];

/**
 * OPERATOR-ONLY, with what the page renders instead. A source may sit here ONLY with that second
 * half written down — the point of the list is that the absence is accounted for, not permitted.
 */
// operator_primary_selection is DELIBERATELY ABSENT. It was on the list in the U6-15 proposal, but
// U6-17 deleted the only client-page read of it (the First Read asked for domain='market', which the
// table's CHECK forbids, so `chosen` was false for every reader including the admin). With no read
// there is nothing to account for, and the last check below is what keeps that honest: an entry here
// whose table no client page reads any more fails the census rather than lingering as folklore.
const OPERATOR_ONLY: Record<string, string> = {
  // U6-22: the member reads this run's rulings through market_candidate_outcomes_client, which omits
  // judge_reasons. The table itself stays admin-only and is read ONLY to merge that operator column
  // back in for an admin; for a member the query returns no rows and every judgeReason stays null,
  // which OperatorUnstatedReason renders nothing from.
  market_candidate_outcomes: "the client list comes from market_candidate_outcomes_client; the table read adds judge_reasons for admins only",
};

function findContainer(): string | null {
  try {
    const out = execFileSync("docker", ["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"], {
      encoding: "utf8",
    }).trim();
    return out.split("\n").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

function psql(container: string, sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-A", "-F", "|", "-t", "-v", "ON_ERROR_STOP=1"],
    { encoding: "utf8", input: sql },
  );
}

/** Every `.from("x")` and `.rpc("x")` across the client surface modules. */
function readSources(): { tables: Set<string>; functions: Set<string> } {
  const tables = new Set<string>();
  const functions = new Set<string>();
  for (const rel of CLIENT_SOURCE_FILES) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const m of text.matchAll(/\.from\(\s*["']([a-z_][a-z0-9_]*)["']\s*\)/g)) tables.add(m[1]);
    for (const m of text.matchAll(/\.rpc\(\s*["']([a-z_][a-z0-9_]*)["']/g)) functions.add(m[1]);
  }
  return { tables, functions };
}

const container = findContainer();

describe("U6-15 census: every client-page source is member-readable or accounted for", () => {
  if (!container) {
    it.skip("SKIPPED — no local supabase_db container reachable (run `supabase start`)", () => {});
    return;
  }

  const { tables, functions } = readSources();

  it("finds the client surfaces' reads at all (non-vacuity)", () => {
    expect(tables.size).toBeGreaterThan(20);
    expect(functions.size).toBeGreaterThan(0);
    // the doors this work introduced must be among them, or the census is reading stale files
    expect([...functions]).toContain("findings_client");
    expect([...functions]).toContain("interview_people");
    // U6 part 1: the landing's two reads are in the census, or it is reading stale files
    expect([...tables]).toContain("first_read_sessions");
    expect([...tables]).toContain("company_members");
  });

  it("every table read by a client page is member-readable, or on the operator-only list with a reason", () => {
    const rows = psql(
      container,
      `select cl.relname,
              (has_table_privilege('authenticated','public.'||quote_ident(cl.relname),'SELECT')
               and (not cl.relrowsecurity
                    or exists (select 1 from pg_policy p where p.polrelid=cl.oid and p.polcmd in ('r','*')
                               and (pg_get_expr(p.polqual,p.polrelid) ilike '%company_members%'
                                    -- U6-71 (2026-11-11) — ONE TABLE, BY NAME, AND NOTHING ELSE.
                                    --
                                    -- company_members is the only source a client page reads that is
                                    -- keyed on the CALLER rather than on a company, so it has no
                                    -- company_members arm for the test above to find; without this
                                    -- the census reports the membership table itself as member-blind,
                                    -- which is the opposite of the truth.
                                    --
                                    -- It is matched BY NAME on purpose. The first version of this
                                    -- accepted any policy matching '%user_id = auth.uid()%', which
                                    -- would have silently admitted every future self-row table — and
                                    -- a self-row policy is NOT the member read this census is about.
                                    -- "The caller may see their own row" says nothing about whether a
                                    -- COMPANY'S members may see the company's data, which is the only
                                    -- question here. A second such table must be argued for
                                    -- explicitly, not inherited from this exception.
                                    or (cl.relname = 'company_members'
                                        and pg_get_expr(p.polqual,p.polrelid) ilike '%user_id = auth.uid()%')))))::text
       from pg_class cl join pg_namespace ns on ns.oid=cl.relnamespace
       where ns.nspname='public' and cl.relkind in ('r','v')
         and cl.relname in (${[...tables].map((t) => `'${t}'`).join(",") || "''"});`,
    );
    const readable = new Map<string, boolean>();
    for (const line of rows.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const [name, ok] = line.split("|");
      readable.set(name, ok === "true");
    }

    const unaccounted: string[] = [];
    for (const t of tables) {
      if (readable.get(t)) continue;
      const reason = OPERATOR_ONLY[t];
      if (!reason || reason.trim().length === 0) unaccounted.push(t);
    }
    expect(
      unaccounted,
      `client pages read these without a member arm and without an operator-only reason: ${unaccounted.join(", ")}. ` +
        `Either give the source a member read (a narrow SECURITY DEFINER door is the shape used by findings_client / interview_people) ` +
        `or add it to OPERATOR_ONLY saying what the page renders instead.`,
    ).toEqual([]);
  });

  it("every narrow door a client page calls exists and is executable by authenticated", () => {
    const rows = psql(
      container,
      `select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname in (${[...functions].map((f) => `'${f}'`).join(",") || "''"});`,
    );
    const seen = new Map<string, boolean>();
    for (const line of rows.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const [name, ok] = line.split("|");
      seen.set(name, ok === "true");
    }
    const broken = [...functions].filter((f) => seen.get(f) !== true);
    expect(broken, `client pages call these rpcs, which are missing or not executable by authenticated: ${broken.join(", ")}`).toEqual([]);
  });

  it("the operator-only list is not a dumping ground: every entry is actually read, and actually not member-readable", () => {
    for (const t of Object.keys(OPERATOR_ONLY)) {
      expect(tables.has(t), `${t} is on the operator-only list but no client page reads it — remove the entry`).toBe(true);
    }
  });

  // U6-15 explicitly covers this embed. useOdiNeeds has two shapes: the journeyKey branch embeds
  // interview_records(... verbatim ...), and the no-key branch does not. useDiagnoseData calls it
  // WITHOUT a journeyKey, so Diagnose never pulls a transcript — and that must stay true, because
  // interview_records has no member arm at all now and the embed would simply go quiet for a member
  // while still handing an admin the text on a client-reachable page.
  it("the Diagnose read never takes useOdiNeeds' verbatim-embedding branch", () => {
    const needs = readFileSync(join(ROOT, "src/hooks/useOdiNeeds.ts"), "utf8");
    const embedMatch = needs.match(/interview_records\(([^)]*)\)/);
    expect(embedMatch, "useOdiNeeds no longer embeds interview_records — update or retire this check").not.toBeNull();
    expect(embedMatch![1]).toContain("verbatim");

    // the embed is on the journeyKey branch only
    expect(needs).toMatch(/journeyKey\s*\?[\s\S]*interview_records\(/);

    // and the Diagnose data hook passes no journeyKey
    const diagnose = readFileSync(join(ROOT, "src/views/client/diagnoseFlow/useDiagnoseData.ts"), "utf8");
    const calls = [...diagnose.matchAll(/useOdiNeeds\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(calls.length, "useDiagnoseData no longer calls useOdiNeeds — update this check").toBeGreaterThan(0);
    for (const args of calls) {
      // one argument only: the company id. A second/third argument could carry a journeyKey.
      expect(args.split(",").length, `useDiagnoseData calls useOdiNeeds(${args}) — a journeyKey here would pull interview verbatim onto a client page`).toBe(1);
    }
  });
});

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { hasCapability, type Capability } from "./capabilities";

// PARITY GUARD (checkpoint 4): the TS resolver (ROLE_BUNDLES → hasCapability) and the
// SQL has_capability() function MUST agree on the three governance caps for every
// role. This is the standing guard against the JS-vs-Postgres divergence trap.
//
// SQL side runs inside the local Supabase Postgres container, seeding one user per
// role in a DISPOSABLE company inside a transaction that is ROLLED BACK — nothing
// persists, no real data touched. If no local stack is reachable, the test SKIPS
// (so CI without a DB does not fail) and says so loudly.

const GOV_CAPS: Capability[] = [
  "governance.proposal.apply",
  "governance.proposal.reject",
  "participation.suggest",
];

// Fixed synthetic UUIDs (company_members.user_id has no FK, so any uuid works).
const CO = "00000000-0000-4000-8000-0000000000c0";
const U = {
  sponsor: "00000000-0000-4000-8000-000000000001",
  decision_owner: "00000000-0000-4000-8000-000000000002",
  contributor: "00000000-0000-4000-8000-000000000003",
  participant: "00000000-0000-4000-8000-000000000004",
  member: "00000000-0000-4000-8000-000000000005",
  observer: "00000000-0000-4000-8000-000000000006",
};

// Roles as stored in company_members.role; "admin" is the user_roles/global case.
type RoleKey = "admin" | keyof typeof U;
const CLIENT_ROLES = Object.keys(U) as (keyof typeof U)[];

// TS side: input for hasCapability per role.
function tsInput(role: RoleKey, adminUid: string): { isAdmin: boolean; clientRole?: string } {
  return role === "admin" ? { isAdmin: true } : { isAdmin: false, clientRole: role };
}

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

const container = findContainer();

describe("capability parity: TS ROLE_BUNDLES ≡ SQL has_capability (governance caps)", () => {
  if (!container) {
    it.skip("SKIPPED — no local supabase_db container reachable (run `supabase start`)", () => {});
    return;
  }

  // Resolve an existing admin user (read-only) for the global/Steward case.
  let adminUid: string;
  try {
    adminUid = psql(container, "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1;").trim();
  } catch {
    adminUid = "";
  }

  it("has_capability matrix matches the TS resolver for every role × governance cap", () => {
    expect(adminUid, "need an existing admin user in user_roles for the Steward case").toBeTruthy();

    const seed = CLIENT_ROLES.map((r) => `('${CO}','${U[r]}','${r}')`).join(",\n        ");
    const rolePairs = [`('admin','${adminUid}')`, ...CLIENT_ROLES.map((r) => `('${r}','${U[r]}')`)].join(",");
    const capList = GOV_CAPS.map((c) => `('${c}')`).join(",");

    // One transaction, rolled back: seed disposable company + members, emit the matrix.
    const sql = `
BEGIN;
INSERT INTO public.companies (id, name, created_by) VALUES ('${CO}', 'parity-test-co', '${adminUid}');
INSERT INTO public.company_members (company_id, user_id, role) VALUES
        ${seed};
SELECT r.role || '|' || c.cap || '|' || public.has_capability(r.uid::uuid, c.cap, '${CO}'::uuid)::text
FROM (VALUES ${rolePairs}) AS r(role, uid)
CROSS JOIN (VALUES ${capList}) AS c(cap);
ROLLBACK;
`;
    const out = psql(container, sql);
    const sqlMatrix = new Map<string, boolean>();
    for (const line of out.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const [role, cap, val] = line.split("|");
      if (role && cap && val) sqlMatrix.set(`${role}|${cap}`, val === "t" || val === "true");
    }

    const roles: RoleKey[] = ["admin", ...CLIENT_ROLES];
    const mismatches: string[] = [];
    for (const role of roles) {
      for (const cap of GOV_CAPS) {
        const ts = hasCapability(cap, tsInput(role, adminUid));
        const sql = sqlMatrix.get(`${role}|${cap}`);
        expect(sql, `SQL missing result for ${role} × ${cap}`).toBeDefined();
        if (ts !== sql) mismatches.push(`${role} × ${cap}: TS=${ts} SQL=${sql}`);
      }
    }
    expect(mismatches, `TS↔SQL divergence:\n${mismatches.join("\n")}`).toEqual([]);
  });
});

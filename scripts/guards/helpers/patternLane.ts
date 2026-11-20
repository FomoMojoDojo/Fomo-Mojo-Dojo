// ── The SP-460 lane decision, run against LIVE rows (SP-468 guard helper, 2026-11-20) ────────────
//
// A guard that re-implemented the seven client-material queries would be a second authority and could
// agree with itself while the production predicate disagreed. So this calls the REAL predicate —
// clientMaterial.companyHasClientProvidedMaterial — over a tiny psql-backed stand-in for the supabase
// client, and feeds its answer to the REAL lineage rule, lineageAllowsExternal.
//
// The stand-in supports only the shapes those seven queries use: select(head+count) with .eq, .in and
// .not. The ONE special case is input_files' embedded filter `inputs!inner(company_id)` +
// .eq("inputs.company_id", …) — named here rather than guessed, because the join direction
// (input_files.input_id → inputs.id) is not recoverable from the filter string.
//
//   deno run -A scripts/guards/helpers/patternLane.ts --company=<uuid>
import { companyHasClientProvidedMaterial } from "../../../supabase/functions/_shared/clientMaterial.ts";
import { lineageAllowsExternal, patternRouteProvenance } from "../../../src/lib/modelRouter/resolveModel.ts";

const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

async function psql(sql: string): Promise<string[][]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}
const lit = (s: string) => "'" + String(s).replaceAll("'", "''") + "'";

type Filter = { op: "eq" | "in" | "not"; col: string; val: unknown; val2?: unknown };
class Q implements PromiseLike<{ count: number | null; error: { message: string } | null }> {
  private filters: Filter[] = [];
  constructor(private table: string) {}
  select(_cols: string, _opts?: unknown) { return this; }
  eq(col: string, val: unknown) { this.filters.push({ op: "eq", col, val }); return this; }
  in(col: string, val: unknown) { this.filters.push({ op: "in", col, val }); return this; }
  not(col: string, val: unknown, val2: unknown) { this.filters.push({ op: "not", col, val, val2 }); return this; }
  private sql(): string {
    let from = `public.${this.table} t`;
    const where: string[] = [];
    for (const f of this.filters) {
      if (f.col === "inputs.company_id") {
        // the one named join (see the header): input_files.input_id → inputs.id
        from = `public.input_files t join public.inputs i on i.id = t.input_id`;
        where.push(`i.company_id = ${lit(String(f.val))}`);
        continue;
      }
      if (f.op === "eq") where.push(`t.${f.col} = ${lit(String(f.val))}`);
      else if (f.op === "in") where.push(`t.${f.col} in (${(f.val as string[]).map(lit).join(", ")})`);
      else if (f.op === "not" && f.val === "is" && f.val2 === null) where.push(`t.${f.col} is not null`);
      else throw new Error(`patternLane: unsupported filter ${JSON.stringify(f)}`);
    }
    return `select count(*) from ${from}${where.length ? " where " + where.join(" and ") : ""}`;
  }
  then<R1, R2>(ok?: ((v: { count: number | null; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
               bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return psql(this.sql())
      .then((rows) => ({ count: Number(rows[0][0]), error: null }))
      .catch((e) => ({ count: null, error: { message: String(e instanceof Error ? e.message : e) } }))
      .then(ok as never, bad as never);
  }
}
const sb = { from: (t: string) => new Q(t) };

const COMPANY = arg("company");
if (!COMPANY) { console.error("patternLane: --company=<uuid> is required"); Deno.exit(2); }

const material = await companyHasClientProvidedMaterial(sb as never, COMPANY);

// the call's own input rows, as the pattern layer will read them: the company's judged review signals
// and the needs those labels sit under
const sigRows = await psql(`select distinct coalesce(s.source_type, '') from public.signals s
  join public.need_evidence e on e.signal_id = s.id and e.company_id = s.company_id
  where s.company_id = ${lit(COMPANY)}`);
const needRows = await psql(`select distinct coalesce(n.source_path, '') from public.odi_needs n
  join public.need_evidence e on e.need_id = n.id and e.company_id = n.company_id
  where n.company_id = ${lit(COMPANY)}`);
const signalSourceTypes = sigRows.map((r) => r[0]);
const needSourcePaths = needRows.map((r) => r[0]);

const lineage = { hasClientMaterial: material.has, signalSourceTypes, needSourcePaths };
console.log(JSON.stringify({
  company_id: COMPANY,
  has_client_material: material.has,
  found: material.found,
  errors: material.errors,
  signal_source_types: signalSourceTypes,
  need_source_paths: needSourcePaths,
  allows_external: lineageAllowsExternal(lineage),
  provenance: patternRouteProvenance(lineage),
}));

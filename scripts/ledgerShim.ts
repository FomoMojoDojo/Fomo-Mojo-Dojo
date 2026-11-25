// ── SP-518: ONE LEDGER PATH FOR EVERY SCRIPT-SIDE MODEL CALL (2026-11-20) ────────────────────────
//
// SP-518: every model call writes a model_calls row — instrument and test tooling included. Before
// this, `run-need-patterns.ts` carried a private supabase stand-in and the three read-only
// instruments carried none at all, so 24 real judge calls in one session went unledgered. "It is only
// an instrument" is not a reason: the spend was real and the ledger is the only record of it.
//
// A SECOND COPY OF THE SHIM WOULD BE THE DRIFT this module exists to stop, so the shim lives here and
// every script imports it. `recordModelCall` is the one writer (Gate 3) and is NOT reimplemented —
// this only gives it something that answers like a supabase client over `docker exec psql`.
//
// It degrades like the writer it feeds: a ledger failure logs and lets the model call's result stand.
import { recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";

export const DB_CONTAINER = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";

export async function psql(sql: string, db = DB_CONTAINER): Promise<string[][]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", db, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}

export async function psqlJson<T>(sql: string, db = DB_CONTAINER): Promise<T[]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", db, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return JSON.parse(new TextDecoder().decode(stdout));
}

export const sqlQuote = (s: string) => "'" + String(s).replaceAll("'", "''") + "'";

/** The minimal supabase stand-in the two shared writers need: model_calls inserts (recordModelCall)
 *  and the model_calls read the spend cap sums over. Nothing else is implemented, so an unsupported
 *  call throws rather than silently doing nothing. */
export function makeLedgerShim(db = DB_CONTAINER) {
  const q = sqlQuote;
  return {
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          const cols = Object.keys(row).filter((k) => row[k] !== undefined);
          const vals = cols.map((k) => (row[k] === null ? "null" : typeof row[k] === "number" ? String(row[k]) : q(String(row[k]))));
          try { await psql(`insert into public.${table} (${cols.join(", ")}) values (${vals.join(", ")})`, db); return { error: null }; }
          catch (e) { return { error: { message: String(e instanceof Error ? e.message : e) } }; }
        },
        select: (_c: string) => {
          const f: string[] = [];
          const api = {
            eq(c: string, v: unknown) { f.push(`${c} = ${q(String(v))}`); return api; },
            gte(c: string, v: unknown) { f.push(`${c} >= ${q(String(v))}`); return api; },
            in(c: string, v: string[]) { f.push(`${c} in (${v.map(q).join(", ")})`); return api; },
            not(c: string, _o: string, _v: unknown) { f.push(`${c} is not null`); return api; },
            then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              psql(`select provider, coalesce(usd::text,'') from public.${table}${f.length ? " where " + f.join(" and ") : ""}`, db)
                .then((rows) => ({ data: rows.map(([provider, usd]) => ({ provider, usd: usd === "" ? null : Number(usd) })), error: null }))
                .catch((e) => ({ data: null, error: { message: String(e) } }))
                .then(ok as never, bad as never),
          };
          return api;
        },
      };
    },
  };
}

export async function md5OfText(text: string): Promise<string> {
  const { stdout } = await new Deno.Command("md5", { args: ["-q", "-s", text], stdout: "piped" }).output();
  return new TextDecoder().decode(stdout).trim();
}

// ── SP-570 (amends SP-549): A CALL THAT THREW IS LEDGERED UNDER THE MODEL THAT WAS REQUESTED ─────
//
// SP-549 takes the model from the RESPONSE, and a call that throws has no response. Run 7 wrote 11
// such rows (`need-patterns:judge`, 2026-11-23 01:38–04:00 UTC) with an EMPTY `model`: the spend was
// recorded (SP-518 held) but a ledger reader could not say which model had burned it.
//
// The rule: the row carries the model that was REQUESTED, and is MARKED as requested-with-no-response
// so it can never be read as a model that answered. `model_calls` has no column for that and SP-570
// forbids a migration here, so the mark is a suffix on `call_site` — the one free-text column that
// already says what kind of call this was. `model` stays the bare model name, so grouping the ledger
// by model attributes the failed call correctly, and `call_site like '%:requested-no-response'`
// finds every call that never answered.
export const REQUESTED_NO_RESPONSE = "requested-no-response";

/** The model a script actually SENT to the local runtime for a role: the arm's override, else the
 *  layer's default, else the lane's own. It must be the same expression the caller's transport uses —
 *  run 7's empty rows came from a second, different expression that ignored the layer default. */
export function modelSentFor(role: "generator" | "judge", m: {
  genOverride?: string; genDefault?: string; judgeOverride?: string; judgeDefault?: string; laneModel?: string;
}): string {
  return (role === "generator" ? (m.genOverride || m.genDefault) : (m.judgeOverride || m.judgeDefault)) || m.laneModel || "";
}

/** SP-570: the `call_site` and `usage` of a ledger row for a call that threw. A requested model that
 *  is unknown is written as the literal "unknown" — never as "", which is what SP-570 exists to end. */
export function noResponseLedgerRow(args: { callSite: string; requestedModel: string; provider?: string }) {
  return {
    callSite: `${args.callSite}:${REQUESTED_NO_RESPONSE}`,
    usage: {
      provider: args.provider ?? "local_ollama", model: args.requestedModel.trim() || "unknown",
      prompt_tokens: null, completion_tokens: null, usd: 0,
    },
  };
}

/** SP-518: ledger ONE local model call. A local call is priced 0 and that 0 is a record, not an
 *  absence — the same rule run-need-patterns.ts has always followed for its own calls. */
export async function ledgerLocalCall(args: {
  companyId: string; callSite: string; model: string; provider?: string;
  system?: string; user?: string; attempt?: number | null;
}): Promise<boolean> {
  return await recordModelCall(makeLedgerShim() as never, {
    companyId: args.companyId,
    callSite: args.callSite,
    attempt: args.attempt ?? null,
    // The sha of the EXACT prompt that produced the call, when the caller has it (L1).
    promptSha: args.system !== undefined && args.user !== undefined
      ? await md5OfText(`${args.system}\n${args.user}`) : null,
    usage: { provider: args.provider ?? "local_ollama", model: args.model, prompt_tokens: null, completion_tokens: null, usd: 0 },
  });
}

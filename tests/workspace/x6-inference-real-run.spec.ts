// (x6) R43 (signed 2026-09-21): the served infer-interview-market against the REAL stack and the REAL local Ollama —
// no stub anywhere. Fixture: bob2 (admin) creates a throwaway company with one customer-research input, three live
// market definitions (psql) and two customer records: (a) a stored text that cuts into THREE windows of distinct
// filler in format (c) — "HH:MM:SS Speaker: line" — and (b) a single 12,000-char line the chunker cannot cut that
// tokenises past num_ctx (CJK: ~1 token per character). The function is invoked through the page's admin client.
//   (a) three windows, each status ok, no context_overflow; the run completes; per-window numbers are printed
//       (chars, prompt_tokens, completion_tokens, ms, status) with the integrity and model_calls ids;
//   (b) status error / context_overflow on the window, the run failed (422), nothing placed, the call ledgered with
//       prompt_tokens = 4098 (Ollama 0.34.0's truncation size at num_ctx 8192).
// A fourth, DEFERRED-lens definition is planted too (R45): it is never offered and never appears in candidate_keys.
// Cleanup inside the spec: the throwaway's model_calls rows are deleted by id (listed), then the company cascade.
// Never CB1 / CB2 / Edgewood data; the texts are filler written here. Plant: the guard's detection removed → (b) red.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";

type Sb = { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }; functions: { invoke: (fn: string, args: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: { message?: string; context?: Response } | null }> } };
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
const first = (s: string) => s.split("\n")[0];
const WINDOW = 12_000;

/** Format (c): one utterance per line, leading HH:MM:SS and a speaker label; each window uses its own word list. */
function windowText(seed: number, target: number): string {
  const lists = [
    "our family looked for a counsellor who could see our daughter during school hours and we kept calling the intake line about the waiting list".split(" "),
    "the grant reporting cycle asks for outcome numbers each quarter and the board wants to see how the funded programme reaches more young people".split(" "),
    "the paediatric clinic refers a teenager after a visit and the referral form goes to a specialist who books the first appointment within weeks".split(" "),
  ];
  const words = lists[seed % lists.length]; let wi = seed * 7; const word = () => words[wi++ % words.length];
  const pad = (n: number) => String(n).padStart(2, "0");
  let out = ""; let t = seed * 4000; let i = 0;
  while (out.length < target) { const line = Array.from({ length: 12 }, word).join(" "); out += `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)} ${i % 2 ? "Interviewer" : "Parent"}: ${line}\n`; t += 4; i++; }
  return out;
}
/** Three windows: each ≤ 12,000 chars ending on a newline, so cutWindows yields exactly three. */
function threeWindows(): string {
  const w = [0, 1, 2].map((k) => { let s = windowText(k, WINDOW + 200); while (s.length > WINDOW) s = s.slice(0, s.lastIndexOf("\n", s.length - 2) + 1); return s; });
  return w.join("");
}
/** One line the chunker cannot cut, 12,000 CJK characters: ~1 token each → far past num_ctx 8192 with the candidate list. */
const overflowLine = () => "市場調査対象顧客面談記録".repeat(1000).slice(0, WINDOW);

async function openAs(page: Page, companyId: string, path: string) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, companyId);
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
}
async function plant(page: Page) {
  await openAs(page, "", "/preview/client-refine/workshop");
  const planted = await page.evaluate(async (args) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error: cErr } = await s.from("companies").insert({ name: args.name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (cErr) return { error: `company: ${cErr.message}` };
    const cid = (co as { id: string }).id;
    const bail = async (why: string) => { await s.from("companies").delete().eq("id", cid); return { error: why }; };
    const { data: inp, error: iErr } = await s.from("inputs").insert({ company_id: cid, user_id: user!.id, input_key: "customer-research", input_label: "Customer Research", group_key: "foundation", group_label: "P", sub_group: "P", completeness: 0, status: "not_started", score_impact: 1.0, impact_tier: "low" }).select("id").single();
    if (iErr) return bail(`input: ${iErr.message}`);
    const ids: Record<string, string> = {};
    for (const [tag, text] of [["three", args.three], ["overflow", args.overflow]] as const) {
      const { data: file, error: fErr } = await s.from("input_files").insert({ input_id: (inp as { id: string }).id, file_name: `fixture-${tag}.txt`, file_type: "text/plain", file_path: `${user!.id}/zz-x6/${Date.now()}/fixture-${tag}.txt`, tags: [], is_interview: true }).select("id").single();
      if (fErr) return bail(`input_files ${tag}: ${fErr.message}`);
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data: rec, error: rErr } = await s.from("interview_records").insert({ company_id: cid, speaker_role: "market_participant", verbatim: text, created_by: user!.id, input_file_id: (file as { id: string }).id, file_sha256: sha, file_bytes: text.length, text_sha256: sha, extraction_method: "local_text_reader", extraction_version: "v", market_state: "unplaced", market_basis: [{ kind: "original", result: "none" }] }).select("id").single();
      if (rErr) return bail(`record ${tag}: ${rErr.message}`);
      ids[tag] = (rec as { id: string }).id;
    }
    return { cid, adminId: user!.id, three: ids.three, overflow: ids.overflow };
  }, { name: `zz-x6-real-run-${Date.now()}`, three: threeWindows(), overflow: overflowLine() });
  expect(planted.error ?? null).toBeNull();
  const p = planted as { cid: string; adminId: string; three: string; overflow: string };
  for (const [k, ex, job] of [["mkt-families", "Families and caregivers of a child in counselling", "Find a counsellor who can see the child during school hours"], ["mkt-funders", "Grant-making bodies funding youth programmes", "Fund a programme and see its outcome numbers"], ["mkt-clinics", "Paediatric clinics referring teenagers", "Refer a young patient to a specialist quickly"]]) {
    psql(`insert into odi_market_definitions (company_id, user_id, journey_key, job_executor, jtbd, market_register) values ('${p.cid}', '${p.adminId}', '${k}', '${ex}', '${job}', 'internal_declared')`);
    psql(`insert into market_lens (company_id, journey_key, title, portfolio_state) values ('${p.cid}', '${k}', '${ex}', 'active')`); // R45: only an active lens is a candidate
  }
  psql(`insert into odi_market_definitions (company_id, user_id, journey_key, job_executor, jtbd, market_register) values ('${p.cid}', '${p.adminId}', 'mkt-deferred', 'Deferred executor', 'Deferred job', 'internal_declared')`);
  psql(`insert into market_lens (company_id, journey_key, title, portfolio_state) values ('${p.cid}', 'mkt-deferred', 'Deferred market', 'deferred')`);
  return p;
}
const invoke = (page: Page, cid: string, recId: string) => page.evaluate(async (a) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { data, error } = await s.functions.invoke("infer-interview-market", { body: { company_id: a.cid, interview_record_id: a.recId } });
  let payload = (data ?? null) as Record<string, unknown> | null;
  if (error && !payload) { try { payload = await error.context?.json?.(); } catch { payload = null; } }
  return payload ?? { error: error?.message ?? "no payload" };
}, { cid, recId });
type Win = { index: number; chars: number; status: string; market_key: string | null; error?: string; ms: number; prompt_tokens: number | null; completion_tokens: number | null };
const lastEntry = (recId: string) => JSON.parse(psql(`select market_basis->-1 from interview_records where id='${recId}'`)) as Record<string, unknown> & { windows: Win[] };

test("(R43) real run: three windows of format (c) → 3 × ok, no context_overflow, completed; one uncuttable 12,000-char CJK line → context_overflow, failed, nothing placed, ledgered", async ({ page }) => {
  test.setTimeout(600_000);
  const { cid, three, overflow } = await plant(page);
  const written: string[] = [];
  try {
    expect(psql(`select count(*) from odi_market_definitions where company_id='${cid}' and retracted_at is null`)).toBe("4"); // 3 active + 1 deferred
    // (a) three windows
    const a = await invoke(page, cid, three);
    const ea = lastEntry(three);
    console.log(`x6 (a) run_id=${ea.run_id} result=${ea.result} ollama=${ea.ollama_version} num_ctx=${ea.num_ctx} windows=${ea.windows_total}/${ea.windows_run} votes=${JSON.stringify(ea.votes)}`);
    for (const w of ea.windows) console.log(`x6 (a) window ${w.index}: chars=${w.chars} prompt_tokens=${w.prompt_tokens} completion_tokens=${w.completion_tokens} ms=${w.ms} status=${w.status}${w.error ? ` error=${w.error}` : ""} key=${w.market_key ?? "none"}`);
    expect(a.ok, JSON.stringify(a)).toBe(true);
    expect([...(ea.candidate_keys as string[])].sort()).toEqual(["mkt-clinics", "mkt-families", "mkt-funders"]); // R45: the keys offered, recorded — never the deferred one
    expect(ea.windows_total).toBe(3); expect(ea.windows_run).toBe(3);
    expect(ea.windows.map((w) => w.status)).toEqual(["ok", "ok", "ok"]);
    expect(ea.windows.some((w) => w.error === "context_overflow")).toBe(false);
    for (const w of ea.windows) { expect(w.chars).toBeLessThanOrEqual(WINDOW); expect(w.prompt_tokens).toBeGreaterThan(2000); expect(w.prompt_tokens).toBeLessThan(8192); expect(w.prompt_tokens).not.toBe(4098); }
    expect(["placed", "not_inferred"]).toContain(ea.result);
    expect(psql(`select status from integrity_runs where id=${ea.run_id}`)).toBe("completed");
    // (b) the overflow window
    const b = await invoke(page, cid, overflow);
    const eb = lastEntry(overflow);
    console.log(`x6 (b) run_id=${eb.run_id} result=${eb.result} failure=${eb.failure_reason} windows=${eb.windows_total}/${eb.windows_run}`);
    for (const w of eb.windows) console.log(`x6 (b) window ${w.index}: chars=${w.chars} prompt_tokens=${w.prompt_tokens} completion_tokens=${w.completion_tokens} ms=${w.ms} status=${w.status}${w.error ? ` error=${w.error}` : ""}`);
    expect(b.ok).toBe(false); expect(b.error).toBe("context_overflow");
    expect(eb.result).toBe("failed"); expect(eb.failure_reason).toBe("context_overflow");
    expect(eb.windows[0].status).toBe("error"); expect(eb.windows[0].error).toBe("context_overflow"); expect(eb.windows[0].prompt_tokens).toBe(4098);
    expect(psql(`select market_state||'|'||coalesce(journey_key,'-') from interview_records where id='${overflow}'`)).toBe("unplaced|-");
    expect(psql(`select status||'|'||coalesce(error,'-') from integrity_runs where id=${eb.run_id}`)).toBe("failed|context_overflow");
    // the ledger: 3 + 1 calls, provider ollama, usd NULL; the overflow call carries the truncated count
    const calls = psql(`select id||'|'||provider||'|'||prompt_tokens||'|'||coalesce(usd::text,'NULL') from model_calls where company_id='${cid}' order by created_at`).split("\n");
    console.log(`x6 model_calls: ${calls.join("  ")}`);
    expect(calls.length).toBe(4);
    expect(calls.every((c) => c.split("|")[1] === "ollama" && c.split("|")[3] === "NULL")).toBe(true);
    expect(calls[3].split("|")[2]).toBe("4098");
    written.push(...calls.map((c) => c.split("|")[0]));
  } finally {
    // the throwaway's model_calls rows have no FK to the company: deleted here, by id
    const ids = psql(`select coalesce(string_agg(id::text, ','), '') from model_calls where company_id='${cid}'`);
    if (ids) psql(`delete from model_calls where company_id='${cid}'`);
    console.log(`x6 cleanup: model_calls deleted [${ids}]; company cascade`);
    const gone = await page.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { error } = await s.from("companies").delete().eq("id", c);
      const { data } = await s.from("companies").select("id").eq("id", c).maybeSingle();
      return { error: error?.message ?? null, stillThere: Boolean(data) };
    }, cid);
    expect(gone).toEqual({ error: null, stillThere: false });
    expect(first(psql(`select count(*) from model_calls where company_id='${cid}'`))).toBe("0");
  }
});

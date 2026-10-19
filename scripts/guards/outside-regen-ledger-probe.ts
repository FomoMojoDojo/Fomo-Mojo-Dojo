#!/usr/bin/env -S deno run --allow-all
// R4 ledger probe — runs ONE page's model step (generator + judge) against a FAKE transport and a
// FAKE ledger, and prints the measured values the guard asserts. No network, no DB, no model call.
//   rows_per_page              — ledger rows one page writes (expected 2: generator, judge)
//   usd_all_nonnull            — every successful attempt priced from its usage (expected true)
//   fallback_rows              — rows when mini fails and nano answers (expected 2)
//   fallback_attempt1_usd_null — the failed mini attempt carries NULL usd (expected true)
//   fallback_attempt2_usd_set  — the nano answer is priced (expected true)
//   unparseable_rows           — rows when both answers are not JSON (expected 2: ledger before parse)
import { regenGenerate, regenJudge, type RegenLedgerEntry, type RegenTransport } from "../../supabase/functions/_shared/outsideRegenModel.ts";

const MODELS = ["gpt-4.1-mini", "gpt-4.1-nano"] as const;
const USAGE = { prompt_tokens: 10, completion_tokens: 5 };
const mem = () => { const rows: RegenLedgerEntry[] = []; return { rows, ledger: (e: RegenLedgerEntry) => { rows.push(e); return Promise.resolve(true); } }; };
const ok: RegenTransport = () => Promise.resolve({ content: "{\"statements\":[\"a\"],\"verdicts\":[]}", usage: USAGE });

// one page
const page = mem();
await regenGenerate({ system: "G", user: "P", models: MODELS, transport: ok, ledger: page.ledger });
await regenJudge({ system: "J", user: "P", models: MODELS, transport: ok, ledger: page.ledger });

// nano fallback
const fb = mem();
const flaky: RegenTransport = ({ model }) => model === "gpt-4.1-mini" ? Promise.reject(new Error("500")) : ok({ model, system: "", user: "" });
await regenGenerate({ system: "G", user: "P", models: MODELS, transport: flaky, ledger: fb.ledger });

// unparseable both times
const bad = mem();
const noJson: RegenTransport = () => Promise.resolve({ content: "nope", usage: USAGE });
let threw = false;
try { await regenJudge({ system: "J", user: "P", models: MODELS, transport: noJson, ledger: bad.ledger }); } catch { threw = true; }

console.log(JSON.stringify({
  rows_per_page: page.rows.length,
  roles: page.rows.map((r) => r.role),
  call_sites: page.rows.map((r) => r.callSite),
  usd_all_nonnull: page.rows.every((r) => typeof r.usage.usd === "number" && r.usage.usd > 0),
  sha_hex64: page.rows.every((r) => /^[0-9a-f]{64}$/.test(r.promptSha)),
  attempts: page.rows.map((r) => r.attempt),
  fallback_rows: fb.rows.length,
  fallback_attempt1_usd_null: fb.rows[0]?.attempt === 1 && fb.rows[0]?.usage.usd === null,
  fallback_attempt2_usd_set: fb.rows[1]?.attempt === 2 && typeof fb.rows[1]?.usage.usd === "number",
  unparseable_rows: bad.rows.length,
  unparseable_threw: threw,
}));

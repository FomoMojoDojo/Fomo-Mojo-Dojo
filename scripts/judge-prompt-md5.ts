// ── SP-531: THE LIVE JUDGE PROMPT'S FINGERPRINT ─────────────────────────────────────────────────
//
// The B′ arms must be reachable ONLY through an explicit flag, and the live `JUDGE_SYSTEM` must come
// out of this slice byte-identical. This prints the md5 of each prompt constant so that claim is a
// measurement and not an assurance. Read-only; no model call, no DB.
//
//   deno run -A scripts/judge-prompt-md5.ts
import { crypto } from "jsr:@std/crypto@1.0.3/crypto";
import { encodeHex } from "jsr:@std/encoding@1.0.5/hex";
import * as NP from "../supabase/functions/_shared/needPatterns.ts";

const md5 = async (s: string) =>
  encodeHex(new Uint8Array(await crypto.subtle.digest("MD5", new TextEncoder().encode(s))));

// SP-545 / SP-547 (2026-11-22): `JUDGE_SYSTEM_PRE545` and `GENERATOR_SYSTEM_NEW547` join the list.
// The live JUDGE_SYSTEM moved (it IS cure B now) and the live GENERATOR_SYSTEM moved (G-new plus
// `belongs_to`), so what this script proves changed with them: not "the live prompt never moves", but
// "every prompt that was measured still has its own name and its own md5".
const NAMES = ["JUDGE_SYSTEM", "JUDGE_SYSTEM_PRE545", "JUDGE_SYSTEM_TIGHTENED", "JUDGE_SYSTEM_BPRIME1", "JUDGE_SYSTEM_BPRIME2",
  "JUDGE_SYSTEM_CUREC", "PATTERN_RUBRIC_TEXT", "GENERATOR_RUBRIC_TEXT", "GENERATOR_SYSTEM", "GENERATOR_SYSTEM_OLD",
  "GENERATOR_SYSTEM_NEW", "GENERATOR_SYSTEM_NEW547",
  // SP-620 / SP-626 / SP-627 (2026-11-24): the one-part measurement variant and its generator-only rubric.
  "GENERATOR_RUBRIC_TEXT_ONEPART", "GENERATOR_SYSTEM_ONEPART"] as const;
let printed = 0;
for (const n of NAMES) {
  const v = (NP as unknown as Record<string, unknown>)[n];
  if (typeof v !== "string") { console.log(`${n.padEnd(24)} (absent)`); continue; }
  console.log(`${n.padEnd(24)} ${await md5(v)}  ${String(v.split("\n").length).padStart(3)} lines  ${String(v.length).padStart(5)} chars`);
  printed++;
}
// SP-532: a run that fingerprints nothing is a failure, not a pass.
if (printed === 0) { console.error("REFUSED (SP-532): no prompt constant was found to fingerprint"); Deno.exit(1); }

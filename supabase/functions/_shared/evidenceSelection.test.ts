// Operator ruling 33 (2026-10-22) — the generator's signal selection ranks evidence, never the alphabet.
//   S33-1  phase V before U: a row with no verified page words never takes a slot ahead of one with them
//   S33-2  no alphabet: same-date rows on hosts after "ie." are admitted; filings on a late host enter on their own tier
//   S33-3  soft shares bind while another tier can fill: an older own-page tier stops at its 25% share
//   S33-4  our read never past its share, even when nothing else is left to fill
//   S33-5  selection_dropped: every reason the selectors emit has a family; the ledger writes it, query-excluded rows too
//   S33-6  sha256HexSync is byte-identical to crypto.subtle (the tie-break key)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dropFamily, evidenceTierOf, selectionDroppedOf, selectSignals, TIER_SHARE, type SelSignal } from "./publicReadSelection.ts";
import { sha256Hex, sha256HexSync } from "./contentIdentity.ts";

const NONE = new Set<string>();
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const VERIFIED = { excerpt_guard: { basis: "websearch_cited_text", traced: true } };
const row = (id: string, url: string, created: string, extra: Partial<SelSignal> & { rp?: Record<string, unknown> } = {}): SelSignal => {
  const { rp, ...rest } = extra;
  return {
    id, claim_text: `Statement ${id} about the company's customers and markets.`, evidence_excerpt: null, source_title: null,
    source_url: url, event_date: null, created_at: created, confidence_to_use: "medium", evidence_class: "prose",
    voice_class: "outside_voice_about_client", raw_payload: { url, source_type: "public_web", ...VERIFIED, ...(rp ?? {}) }, ...rest,
  };
};
const D = "2026-10-22T12:00:00Z";
const letters = "abcdefghijklmnopqrstuvwxy".split("");   // 25 hosts, a… to y…

Deno.test("S33-1 phase V before U — an unverified row never takes a slot ahead of a verified one", () => {
  // the unverified row is NEWER and in a STRONGER tier (a filing); the verified one is an older review
  const unverified = row("U-filing", "https://filings.example.gov/doc/1", "2026-10-22T00:00:00Z", { rp: { excerpt_guard: { basis: "none" }, voice_authority: { authority: "own_filing_related" } } });
  const verifiedReview = row("V-review", "https://reviews.example.com/r/1", "2026-09-01T00:00:00Z", { rp: { source_type: "customer_review" } });
  assertEquals(evidenceTierOf(unverified), 1);
  assertEquals(evidenceTierOf(verifiedReview), 4);
  assertEquals(selectSignals([unverified, verifiedReview], 1, NONE).kept.map((s) => s.id), ["V-review"]);
  assertEquals(selectSignals([unverified, verifiedReview], 2, NONE).kept.map((s) => s.id), ["V-review", "U-filing"]);
});

Deno.test("S33-2 no alphabet — same-date record rows on hosts after \"ie.\" are admitted, and late-host filings enter on their tier", () => {
  const record = Array.from({ length: 40 }, (_, i) => row(`R-${i}`, `https://${letters[i % 25]}${letters[(i * 7) % 25]}${i}news.example.com/story`, D));
  const filings = [1, 2, 3, 4, 5].map((n) => row(`F-${n}`, `https://zz-filings.example.gov/doc/${n}`, D, { rp: { voice_authority: { authority: "own_filing_related" } } }));
  const { kept } = selectSignals([...record, ...filings], 30, NONE);
  const keptRecordHosts = kept.filter((s) => s.id.startsWith("R-")).map((s) => new URL(s.source_url!).hostname).sort();
  const alphabeticalFirst = record.map((s) => new URL(s.source_url!).hostname).sort().slice(0, keptRecordHosts.length);
  assert(keptRecordHosts.length > 0 && keptRecordHosts.length < record.length, `the record tier is cut (${keptRecordHosts.length})`);
  assert(JSON.stringify(keptRecordHosts) !== JSON.stringify(alphabeticalFirst), `the record tier took the alphabetically first hosts: ${keptRecordHosts.join(" ")}`);
  assert(keptRecordHosts.some((h) => h > "ie."), "a host after \"ie.\" is admitted");
  assertEquals(kept.filter((s) => s.id.startsWith("F-")).length, 5, "every filing on the late host enters (its unit is the document)");
});

Deno.test("S33-3 soft shares bind while another tier can fill — an older own-page tier stops at its 25% share", () => {
  const record = Array.from({ length: 40 }, (_, i) => row(`R-${i}`, `https://news${i}.example.com/s`, D));
  const own = Array.from({ length: 40 }, (_, i) => row(`O-${i}`, `https://site${i}.example.org/p`, "2026-10-01T00:00:00Z", { voice_class: "client_voice", rp: { source_type: "site_crawl" } }));
  const { kept, dropped } = selectSignals([...record, ...own], 30, NONE);
  const ownN = kept.filter((s) => s.id.startsWith("O-")).length;
  assertEquals(ownN, Math.ceil(30 * TIER_SHARE[3]), `own pages stop at their share (got ${ownN})`);
  assertEquals(kept.length, 30, "the cap fills — from the record, which still has rows");
  assert(dropped.some((d) => d.id.startsWith("O-") && d.reason === "tier_share"), "an own page past its share is dropped as tier_share");
});

Deno.test("S33-4 our read never past its share, even when nothing else is left to fill", () => {
  const ours = Array.from({ length: 20 }, (_, i) => row(`A-${i}`, `https://company.example.com/a/${i}`, D, { voice_class: "analysis", rp: { source_type: "analysis" } }));
  const record = Array.from({ length: 5 }, (_, i) => row(`R-${i}`, `https://news${i}.example.com/s`, D));
  assertEquals(evidenceTierOf(ours[0]), 5);
  const { kept } = selectSignals([...ours, ...record], 30, NONE);
  assertEquals(kept.filter((s) => s.id.startsWith("A-")).length, Math.ceil(30 * TIER_SHARE[5]));
  assertEquals(kept.length, 5 + Math.ceil(30 * TIER_SHARE[5]), "the cap stays unfilled rather than give our read more");
});

Deno.test("S33-5 selection_dropped — every selector reason has a family; the ledger writes it; query-excluded rows are recorded", async () => {
  const sel = await read("./publicReadSelection.ts");
  const inputs = await read("./publicReadInputs.ts");
  const reasons = new Set<string>();
  for (const src of [sel, inputs]) for (const m of src.matchAll(/reason: "([a-z_]+)"/g)) reasons.add(m[1]);
  for (const r of ["duplicate_of:x", "kind_excluded:frontier", "not_public_source_type:upload", "rule_refusal:R1", "relevance_orthogonal", "hold", "superseded", "tier_share"]) reasons.add(r);
  for (const r of reasons) assert(dropFamily(r) !== "other", `reason ${r} has no family`);
  const sd = selectionDroppedOf([{ id: "s1", kind: "signal", reason: "over_cap" }, { id: "s2", kind: "signal", reason: "hold" }, { id: "d1", kind: "delta", reason: "rule_refusal:R2" }]);
  assertEquals(sd.signal, [{ id: "s1", reason: "over_cap", family: "cap" }, { id: "s2", reason: "hold", family: "hold" }]);
  assertEquals(sd.delta, [{ id: "d1", reason: "rule_refusal:R2", family: "refusal" }]);
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("    selection_dropped: selectionDroppedOf(dropped),\n"), "ledgerOf writes selection_dropped");
  assert(gen.includes("const ledger = await ledgerOf(inputs, dropped);"), "from the selection's own dropped list");
  assert(/const storedLedger = \(kind: Kind, extra: Record<string, unknown> = \{\}\) => \(\{\n\s+\.\.\.ledger,/.test(gen), "every stored read's ledger spreads it");
  assert(/\.not\(col, "is", null\)/.test(inputs) && inputs.includes('col === "superseded_at" ? "superseded" : "hold"'), "held / superseded rows the query excludes are recorded");
});

Deno.test("S33-6 sha256HexSync equals crypto.subtle (the tie-break is a real sha256)", async () => {
  for (const s of ["", "abc", "0e413608-d42f-4a7e-b710-fa6006833af1", "x".repeat(55), "y".repeat(56), "z".repeat(64), "naïve ü ✓ 日本", "q".repeat(1000)]) {
    assertEquals(sha256HexSync(s), await sha256Hex(s), JSON.stringify(s.slice(0, 12)));
  }
});

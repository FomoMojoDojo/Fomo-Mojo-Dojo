// R54 probe (2026-10-20) — the authorship judge sees WHERE the text sits on the page. Three measured parts, no model:
//   prompt   the shipped judge, a capturing transport: the built user prompt carries the CONTEXT block (heading, then the
//            page words with the TEXT marked ⟦ ⟧) between PAGE BRIEF and TEXT; its prompt sha is printed (it moves when
//            the block does). A no_page context makes NO transport call and NO ledger row (verdict no_page_words).
//   refuse   a call with no context at all throws before any transport call (runtime); the type refusal is proven by
//            scripts/guards/r54-no-context-typecheck.ts (an @ts-expect-error that deno check must honour).
//   mint     the regen WRITE path (fake db / transport, judge spy): the judge receives a page context built from the stored
//            page at the slice-asserted offset — kind page, the excerpt at offset_utf16, the heading above it.
//   listing  (R54b) the system prompt carries the listing-data rule (demonstration + counterexample); system sha printed.
//   section  (R54a) the context never crosses a heading: before stops at the heading above, after at the next heading below.
import { authorshipContext, judgeAggregatorAuthorship, noPageWords, type AuthorshipInput } from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
import { runOutsideRegen, type RegenJudge } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seedR17, deps, r17Transport, CO, RUN2 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const URL = "https://www.chamberofcommerce.com/business-directory/massachusetts/medford/x/1-acme";
const PAGE = "Acme Coffee\nQuestions & Answers\nQ What is the internet address for Acme Coffee?\nA The website (URL) for Acme Coffee is: https://acmecoffee.com/\nQ What days are Acme Coffee open?";
const TEXT = "The website (URL) for Acme Coffee is: https://acmecoffee.com/";
let user = "", system = "", sha = "", calls = 0, rows = 0;
const capture = ({ user: u, system: sy }: { user: string; system: string }) => { calls++; user = u; system = sy; return Promise.resolve({ content: JSON.stringify({ verdict: "third_party", entity: null, reason: "probe" }), prompt_tokens: 1, completion_tokens: 1 }); };
const ledger = (e: { promptSha: string }) => { rows++; sha = e.promptSha; return Promise.resolve(true); };
const input: AuthorshipInput = { subjectName: "Acme Coffee", subjectHost: "acmecoffee.com", url: URL, text: TEXT, context: authorshipContext(PAGE, TEXT, PAGE.indexOf(TEXT)) };
await judgeAggregatorAuthorship(input, { transport: capture, ledger, model: "fake-qwen" });
const iBrief = user.indexOf("PAGE BRIEF:"), iCtx = user.indexOf("CONTEXT —"), iText = user.indexOf("TEXT (verbatim");
const prompt = { has_block: iCtx > 0, between_brief_and_text: iBrief >= 0 && iBrief < iCtx && iCtx < iText, heading: (user.match(/NEAREST HEADING ABOVE THE TEXT: (.*)/) ?? [])[1] ?? null, marked: user.includes(`⟦${TEXT}⟧`), sha, calls, rows };
calls = 0; rows = 0;
const np = await judgeAggregatorAuthorship({ ...input, context: noPageWords("probe: no stored page") }, { transport: capture, ledger, model: "fake-qwen" });
const noPage = { verdict: np.verdict, reason: np.reason, transport_calls: calls, ledger_rows: rows };
calls = 0;
let threw = false;
try { await judgeAggregatorAuthorship({ subjectName: "A", subjectHost: "a.com", url: URL, text: TEXT } as never, { transport: capture, ledger, model: "fake-qwen" }); } catch { threw = true; }
const refuse = { threw, transport_calls: calls };
// mint path: the judge spy records the context it was handed on the gated fixture URL
const seen: AuthorshipInput["context"][] = [];
const spy: RegenJudge = (i) => { seen.push(i.context); return Promise.resolve({ verdict: "third_party", entity: null, reason: "probe", model: "fake" }); };
const db = fakeDb(seedR17()); const { d } = deps(db, r17Transport(), spy);
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: ["https://www.crunchbase.com/organization/acme-coffee"] }, d);
const snap = (db.tables.outside_page_snapshots as Array<{ source_url: string; clean_text: string }>).find((s) => s.source_url === "https://www.crunchbase.com/organization/acme-coffee")!;
const c0 = seen[0];
const mint = { status: r.status, judge_calls: seen.length, kind: c0?.kind ?? null, at_offset: c0?.kind === "page" ? snap.clean_text.indexOf(c0.before.slice(-20)) >= 0 : false, heading: c0?.kind === "page" ? c0.heading : null };
// section (R54a): a seeded page with headings above and below — the context is the text's own section, never across a
// heading: the "before" words stop at "Questions & Answers" (kept as the heading line), the "after" words stop at "Reviews";
// the earlier heading "About Acme Coffee" is in neither. The prompt names the field from the heading.
const SPAGE = "About Acme Coffee\nAcme Coffee roasts small-batch beans in Medford.\nQuestions & Answers\nQ What is the internet address for Acme Coffee?\n" +
  `A ${TEXT}\nQ What days are Acme Coffee open?\nReviews\nGreat coffee and friendly staff.`;
const sc = authorshipContext(SPAGE, TEXT, SPAGE.indexOf(TEXT));
const section = sc.kind === "page"
  ? { heading: sc.heading, before_has_earlier_heading: sc.before.includes("About Acme Coffee"), before_has_own_heading: sc.before.includes("Questions & Answers"),
      after_has_next_heading: sc.after.includes("Reviews"), before_len: sc.before.length, after_len: sc.after.length,
      names_field: user.includes("The heading names the FIELD the TEXT sits in; decide who wrote the TEXT within that field under the PAGE BRIEF.") }
  : { kind: sc.kind };
// listing (R54b): the system prompt carries the listing-data rule with its demonstration and counterexample; its sha moves with it
const systemSha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(system)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const listing = { rule_present: system.includes("LISTING DATA IS PLATFORM-AUTHORED IN ANY FIELD"), demonstration: system.includes("is located at 86 Main St in Medford, MA 02155.' → third_party"),
  counterexample: system.includes("→ subject_company)"), system_sha: systemSha };
console.log(JSON.stringify({ prompt, no_page: noPage, refuse, mint, section, listing }));

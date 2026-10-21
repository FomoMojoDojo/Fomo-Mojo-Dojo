// R54 probe (2026-10-20) — the authorship judge sees WHERE the text sits on the page. Three measured parts, no model:
//   prompt   the shipped judge, a capturing transport: the built user prompt carries the CONTEXT block (heading, then the
//            page words with the TEXT marked ⟦ ⟧) between PAGE BRIEF and TEXT; its prompt sha is printed (it moves when
//            the block does). A no_page context makes NO transport call and NO ledger row (verdict no_page_words).
//   refuse   a call with no context at all throws before any transport call (runtime); the type refusal is proven by
//            scripts/guards/r54-no-context-typecheck.ts (an @ts-expect-error that deno check must honour).
//   mint     the regen WRITE path (fake db / transport, judge spy): the judge receives a page context built from the stored
//            page at the slice-asserted offset — kind page, the excerpt at offset_utf16, the heading above it.
//   listing  (R54b) the system prompt carries the listing-data rule (demonstration + counterexample); system sha printed.
//   r57      (R57) the authorship system prompt's rule (8) — a section belongs to the entity it is named for — and the generic brief.
//   r55a3    (R55a''') subject + any verb + comma/colon opening a quotation → quoted_with_attribution (6003dc65's sentence).
//   r56      (R56) speakerless first person off the subject's domain → the authorship judge; attributed first person → the speaker judge.
//   r55e     (R55e) the speaker user prompt: the computed own-domain line (no / yes), the PAGE BRIEF and the CONTEXT block.
//   r55d     (R55d, R55a'') the detector: narration + a quotation → form mixed; a quotation after an attributed one carries its speaker.
//   r55a     (R55a) the detector: a quoted term with no attribution marker is form none; a true quotation keeps its form.
//   speaker  (R55) the speaker system prompt carries the about-is-not-by rule (demonstration + counterexample); sha printed.
//   section  (R54a) the context never crosses a heading: before stops at the heading above, after at the next heading below.
import { authorshipContext, buildSpeakerUser, judgeAggregatorAuthorship, noPageWords, pageBriefFor, SPEAKER_SYSTEM, type AuthorshipInput } from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
import { detectAttribution } from "../../supabase/functions/_shared/attribution.ts";
import { voiceClassForMintedExcerpt } from "../../supabase/functions/_shared/voiceClassAtMint.ts";
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
// speaker (R55): the speaker system prompt carries the about-is-not-by rule, its demonstration and counterexample; sha printed
const speakerSha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SPEAKER_SYSTEM)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const speaker = { rule_present: SPEAKER_SYSTEM.includes("A SENTENCE ABOUT THE SUBJECT IS NOT A SENTENCE BY THE SUBJECT"),
  demonstration: SPEAKER_SYSTEM.includes("The reported metrics mark the completion of X's roadmap.' → third_party, the narrator"),
  counterexample: SPEAKER_SYSTEM.includes("said X's CEO.' → subject_company_officer"), system_sha: speakerSha,
  // R55b / R55c: the SUBJECT line names the subject; an affiliate speaking for itself is third_party — each with both examples
  r55b_present: SPEAKER_SYSTEM.includes("THE SUBJECT COMPANY LINE NAMES THE SUBJECT") && SPEAKER_SYSTEM.includes("SUBJECT COMPANY: SIAA, on a page about Simply Business partnering with SIAA → subject_company_officer") && SPEAKER_SYSTEM.includes("VP at Simply Business' with SUBJECT COMPANY: SIAA → third_party"),
  // R55c' (replaced R55c): first person off the subject's domain is the subject's only when the page says so
  r55c_present: SPEAKER_SYSTEM.includes("FIRST PERSON OFF THE SUBJECT'S DOMAIN IS THE SUBJECT'S ONLY WHEN THE PAGE SAYS SO") && SPEAKER_SYSTEM.includes("based on our analysis.' on a review site → third_party, the host") && SPEAKER_SYSTEM.includes("said Lumio's CEO → subject_company_officer"),
  // R55d: a mixed candidate (narrator words + a quotation) → mixed; a bare quotation → the quoted speaker; mixed is an answer
  r55d_present: SPEAKER_SYSTEM.includes("A MIXED CANDIDATE IS NOT ONE SPEAKER") && SPEAKER_SYSTEM.includes("our top priority.' → mixed") && SPEAKER_SYSTEM.includes("Sonos said.' → subject_company_text") && SPEAKER_SYSTEM.includes("|unknown|mixed\"") };
// R55a: a quoted term is not a quotation (f2630d58's sentence → none); a true quotation keeps its form and speaker
const termHit = detectAttribution("The reported metrics mark the completion of the “Quantum Memory” phase (Phase 1) of Riverlane’s multi-year QEC roadmap.");
const quoteHit = detectAttribution("“This acquisition strengthens our position,” said David Friend, Wasabi Technologies’ co-founder and CEO.");
// R55a': a candidate that opens a multi-sentence quotation takes the dash attribution after its close (08ff48ad's paragraph)
const LEARY_PAGE = "“Simply Business’s technology brings transparency, choice, and value to our members. By integrating this platform, we’re equipping agencies. This partnership aligns with SIAA’s mission.” – Meghan Leary, SVP of Strategic Partnerships of SIAA.\nShare this";
const learyHit = detectAttribution("“Simply Business’s technology brings transparency, choice, and value to our members.", LEARY_PAGE);
const r55a = { term_form: termHit?.form ?? "none", quote_form: quoteHit?.form ?? "none", quote_speaker: quoteHit?.speaker_string ?? null, dash_after_close_speaker: learyHit?.speaker_string ?? null };
// R55e: the speaker user prompt states whose page it is (computed) and carries the authorship judge's PAGE BRIEF + CONTEXT
const RPAGE = "Reviews\nYes, I recommend this pro\nIAQM came out to assess the mold issue we had uncovered. They isolated the cause quickly.";
const RTEXT = "IAQM came out to assess the mold issue we had uncovered.";
const sp = (url: string) => buildSpeakerUser({ subjectName: "IAQM", subjectHost: "iaqm.com", url, candidate: RTEXT, attributionForm: "first_person", attributionSpan: RTEXT, speakerString: "", context: RPAGE, pageContext: authorshipContext(RPAGE, RTEXT, RPAGE.indexOf(RTEXT)) });
const third = sp("https://www.angi.com/companylist/us/tx/forney/iaqm-reviews-1.htm"), own = sp("https://www.iaqm.com/about");
const r55e = { own_domain_no: third.includes("HOST IS THE SUBJECT'S OWN DOMAIN: no — the page is hosted by someone else"), own_domain_yes: own.includes("HOST IS THE SUBJECT'S OWN DOMAIN: yes — the page is the subject's own site"),
  brief: third.includes("PAGE BRIEF: Angi"), context: third.includes("CONTEXT —") && third.includes("NEAREST HEADING ABOVE THE TEXT: Yes, I recommend this pro") && third.includes(`⟦${RTEXT}⟧`) };
// R55d / R55a'': the detector's mixed form, and the consecutive-quotation carry
const mixedHit = detectAttribution("When the backlash hit, Sonos’s replies sounded like a robot reading legal disclaimers: “Hello, fixing the app continues to be our top priority.");
const FPAGE = "“This acquisition strengthens our position,” David Friend, Wasabi Technologies’ co-founder and CEO, said in a statement . “Seagate has built a loyal enterprise customer base for Lyve Cloud storage, and we welcome those customers to Wasabi. We are focused on growth.”\nRelated";
const carryHit = detectAttribution("“Seagate has built a loyal enterprise customer base for Lyve Cloud storage, and we welcome those customers to Wasabi.", FPAGE);
const r55d = { mixed_form: mixedHit?.form ?? "none", carry_speaker: carryHit?.speaker_string ?? null };
// R56: speakerless first person on a host that is not the subject's → the AUTHORSHIP judge (4b0b3ffa's shape); attributed → the speaker judge
const r56calls: string[] = [];
const r56base = { item: null, labeledClass: "outside_voice_about_client", pageText: RPAGE, authorshipContext: authorshipContext(RPAGE, RTEXT, RPAGE.indexOf(RTEXT)), company: { name: "Indoor Air Quality Management", host: "iaqm.com" }, registry: null,
  judge: () => { r56calls.push("authorship"); return Promise.resolve({ verdict: "third_party" as const, entity: null, reason: "probe", model: "probe" }); },
  speakerJudge: () => { r56calls.push("speaker"); return Promise.resolve({ speaker_class: "third_party" as const, speaker_name: null, speaker_role: null, reason: "probe", model: "probe" }); },
  gate: "profile_wire_boilerplate" as const, textGates: ["first_person", "attributed_speech"] as const, onJudgeFailure: "keep_label" as const, judgedText: RTEXT };
const fp56 = await voiceClassForMintedExcerpt({ ...r56base, url: "https://www.angi.com/companylist/us/tx/forney/iaqm-reviews-1.htm" });
const fpJudges = r56calls.splice(0);
await voiceClassForMintedExcerpt({ ...r56base, url: "https://www.angi.com/companylist/us/tx/forney/iaqm-reviews-1.htm", attribution: { form: "quotation_interior", speaker_string: "Don Vrana, owner", span: "x", offset: 0 } });
const attrJudges = r56calls.splice(0);
const r56 = { first_person_judges: fpJudges, first_person_rule: fp56.ok ? fp56.rule ?? null : null, attributed_judges: attrJudges };
// R57: a section belongs to the entity it is named for (authorship system rule + generic brief); R55a''': subject + verb + quote
const r57 = { rule_present: system.includes("A SECTION BELONGS TO THE ENTITY IT IS NAMED FOR") && system.includes("the SUBJECT is Beta Co → third_party") && system.includes("('About Beta Co') is decided by the field rules"),
  generic_brief: pageBriefFor("https://www.example-directory.test/acme").brief.includes("a section headed for another entity is that entity's, not the subject's") };
const svq = detectAttribution("By October 2024, Sonos bragged, “We’ve restored 80% of the app’s features!”");
const r55a3 = { form: svq?.form ?? "none", speaker: svq?.speaker_string ?? null };
console.log(JSON.stringify({ prompt, no_page: noPage, refuse, mint, section, listing, speaker, r55a, r55e, r55d, r56, r57, r55a3 }));

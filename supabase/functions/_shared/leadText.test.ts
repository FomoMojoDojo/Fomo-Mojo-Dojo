// A3 (2026-11-18): reviewer names and handles in lead text are masked for display; the company's own accounts, email
// domains, staff names and brands are not.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskReviewerNames } from "./leadText.ts";
// SP-455c: the brand words are the caller's, read from stored values. These are Charter's — its own
// name and the brands its need_evidence rows carry — so every case below reads as it did when the
// list lived in the module.
const CHARTER_BRANDS = ["Charter Communications", "spectrum", "cox"];
const m = (t: string) => maskReviewerNames(t, CHARTER_BRANDS);

Deno.test("a review header's name or handle after its date is masked", () => {
  assertEquals(m("May 13 NewNew2021 Cox is entirely too expensive").text, "May 13 [reviewer] Cox is entirely too expensive");
  assertEquals(m("Apr 13 SnowChick144 I have lived in several states").text, "Apr 13 [reviewer] I have lived in several states");
  assertEquals(m("Oct 1 D.Architekt For over a year now").text, "Oct 1 [reviewer] For over a year now");
  assertEquals(m("1月5日 Jesus Barroso I do not usually write reviews").text, "1月5日 [reviewer] I do not usually write reviews");
  assertEquals(m("3月18日 ammillie I must say I'm impressed").text, "3月18日 [reviewer] I must say I'm impressed");
  assertEquals(m("10/14/2025 Jay96574832 I liked this app").text, "10/14/2025 [reviewer] I liked this app");
  assertEquals(m("2025/11/12 Austin Dee H. Cox randomly called me").text, "2025/11/12 [reviewer] Cox randomly called me");
});

Deno.test("BBB, page JSON, Reddit and DSLReports names are masked", () => {
  assertEquals(m("- Review from Vitaly L **Date:** 08/12/2025 1 star").text, "- Review from [reviewer] **Date:** 08/12/2025 1 star");
  assertEquals(m('"},{"author":"Rebecca M.","datePublished":"2020-08-04"').text, '"},{"author":"[reviewer]","datePublished":"2020-08-04"');
  assertEquals(m("Hi u/Sorry-Addendum-1530, thanks for choosing Spectrum").text, "Hi u/[reviewer], thanks for choosing Spectrum");
  assertEquals(m("said by Osprey101: We've been with Cox for years").text, "said by [reviewer]: We've been with Cox for years");
  const d = m("servers. ajwees41 ... said by Fubar16: can the rest of us know");
  assertEquals([d.text, d.masked], ["servers. [reviewer] ... said by [reviewer]: can the rest of us know", 2]);
  const o = m("AZHSISupport : online &gt;1yr ago CoxAZTech1 : online &gt;1yr ago");
  assertEquals([o.text, o.masked], ["[reviewer] : online &gt;1yr ago [reviewer] : online &gt;1yr ago", 2]);
});

Deno.test("not masked: the company's accounts, email domains, staff names, brands, ordinary sentences", () => {
  for (const t of [
    "report it on Twitter by following the @ask_spectrum handle", "Username (no @cox.net) and password", "I emailed cox.help@cox.com",
    "After all of this Supervisor Shawn tells me he can only give a credit", "I called and got Joseph who was very disrespectful",
    "May 13 Cox Communications raised my bill again", "Oct 1 The tech never showed up", "Cox increased by bill $20 a month",
  ]) assertEquals(m(t), { text: t, masked: 0 }, t);
});

Deno.test("masking is idempotent: masked text masks nothing more", () => {
  const once = m("May 13 NewNew2021 Cox is bad. Review from Eric R Date: 08/13/2026. said by Osprey101: hi").text;
  assertEquals(m(once), { text: once, masked: 0 });
});

// ── SP-443 (2026-11-19): the EXCERPT byline shapes ───────────────────────────────────────────────────────────────────
// Measured on Charter's 330 judged excerpts: none of the lead-text shapes above fires on that corpus, and 18 of them
// carry a reviewer's name in one of these two. The review group and the Brief show those excerpts, so these cases are
// what makes their masking real rather than nominal.
Deno.test("ConsumerAffairs byline: the glued first name is masked, the place is kept", () => {
  for (const [raw, want] of [
    ["Report\n\nStewartMyrtle Beach, SC\n\n21- times Spectrum internet has been down", "Report\n\n[reviewer]Myrtle Beach, SC\n\n21- times Spectrum internet has been down"],
    ["JessicaSaginaw, MI\n\nSpectrum internet keeps going out", "[reviewer]Saginaw, MI\n\nSpectrum internet keeps going out"],
    ["MahmoudNew York, NY\n", "[reviewer]New York, NY\n"],
    ["AfhrlksdjfSan Tan Valley, AZ\n", "[reviewer]San Tan Valley, AZ\n"],
  ] as const) assertEquals(m(raw).text, want, raw);
  assertEquals(m("RheaJohnson City, TN\n").masked, 1);
});

Deno.test("HighSpeedInternet byline: the name is masked, 'Verified User' is kept", () => {
  assertEquals(m("– Heather R., Verified User\n\n(2/5)").text, "– [reviewer], Verified User\n\n(2/5)");
});

Deno.test("the byline shapes are anchored to a whole line — they never fire inside a sentence", () => {
  for (const t of [
    "I moved to Myrtle Beach, SC and the service was worse",
    "we drove from Johnson City, TN to New York, NY that week",
    "the tech said he was a Verified User of the same plan",
    "Verified User\n\nOpaque pricing schemes attempting to extract as much as possible",
  ]) assertEquals(m(t), { text: t, masked: 0 }, t);
});

Deno.test("the byline shapes are idempotent too", () => {
  const once = m("Report\n\nStewartMyrtle Beach, SC\n\n– Heather R., Verified User").text;
  assertEquals(m(once), { text: once, masked: 0 });
});

Deno.test("the App Store's STACKED header: the date on one line, the handle on the next", () => {
  assertEquals(m("01/09/2025\n  Vinnydefo\n  Within 24 hours of signing up").text, "01/09/2025\n  [reviewer]\n  Within 24 hours of signing up");
  assertEquals(m("  Jun 14\n  MDW32752\n  Spectrum frequently freezes").text, "  Jun 14\n  [reviewer]\n  Spectrum frequently freezes");
  // a handle the [A-Za-z][\w.]* reader cannot hold, on a line of its own
  assertEquals(m("Jun 24\n  J0n+3\n  the app is useless").text, "Jun 24\n  [reviewer]\n  the app is useless");
  assertEquals(m("04/12/2024\n  Frustrated😤😤😤\n  billing again").text, "04/12/2024\n  [reviewer]\n  billing again");
  // a display name of two or three words on the stacked line
  assertEquals(m("  Oct 1\n  Grandma Overwatch\n  it keeps dropping").text, "  Oct 1\n  [reviewer]\n  it keeps dropping");
  // KNOWN, AND DELIBERATE: a one-word line in this exact position is taken for the handle, so a one-word
  // review TITLE there would be masked too. Masking a word that was not a name costs a word; leaving a
  // name costs a person's name, and the stacked shape is a byline in every corpus measured.
  assertEquals(m("Oct 1\n  Terrible\n  service").text, "Oct 1\n  [reviewer]\n  service");
});

Deno.test("a date line followed by a BLANK line and the review body is NOT a byline", () => {
  for (const t of [
    "Reviewed Sept. 30, 2026\n\nSpectrum internet keeps going out for long periods of time.",
    "Reviewed Dec. 30, 2025\n\n21- times Spectrum internet has been down in 2- weeks.",
  ]) assertEquals(m(t), { text: t, masked: 0 }, t);
});

Deno.test("Google Play byline: the line after the reviewer's avatar link is their display name", () => {
  const raw = "[](https://play-lh.googleusercontent.com/a-/ALV-UjV=s32)\n\nRachael Tinsley\n\n*more_vert*\n\nApp constantly logs out";
  const want = "[](https://play-lh.googleusercontent.com/a-/ALV-UjV=s32)\n\n[reviewer]\n\n*more_vert*\n\nApp constantly logs out";
  assertEquals(m(raw).text, want);
  assertEquals(m(want), { text: want, masked: 0 });   // idempotent
  // an avatar link that is NOT a reviewer's (a different host) is left alone
  const other = "[](https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-1.svg)\n\nI have been a Charter customer\n";
  assertEquals(m(other), { text: other, masked: 0 });
});

// ── SP-455c (2026-11-19): the brand refusal list is the CALLER'S ─────────────────────────────────────────────────────
Deno.test("a brand standing where a reviewer's name would is left alone — when the caller names it", () => {
  const t = "May 13 Cox Communications raised my bill again";
  assertEquals(maskReviewerNames(t, ["cox", "Charter Communications"]), { text: t, masked: 0 });
  assertEquals(maskReviewerNames(t, ["COX", "charter communications"]), { text: t, masked: 0 }, "case-insensitive");
});

Deno.test("passing no brands only makes the mask MORE eager — it can never leak a name", () => {
  const t = "May 13 Cox Communications raised my bill again";
  const none = maskReviewerNames(t);
  assertEquals(none.masked, 1);
  assertEquals(none.text, "May 13 [reviewer] raised my bill again");
  // and a real reviewer is still masked either way
  assertEquals(maskReviewerNames("May 13 NewNew2021 Cox is bad", ["cox"]).masked, 1);
});

Deno.test("the module holds no company name of its own", async () => {
  const src = await Deno.readTextFile(new URL("./leadText.ts", import.meta.url));
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  for (const name of ["Spectrum", "Comcast", "Xfinity", "Verizon", "Contour", "Panoramic"]) {
    assertEquals(code.includes(`"${name}"`), false, name);
  }
});

// A3 (2026-11-18): reviewer names and handles in lead text are masked for display; the company's own accounts, email
// domains, staff names and brands are not.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskReviewerNames } from "./leadText.ts";
const m = (t: string) => maskReviewerNames(t);

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

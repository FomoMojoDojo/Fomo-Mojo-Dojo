// N1o (operator ruling, 2026-10-22): a name candidate that begins the line or a sentence is also tested with its first
// word removed, and passes if that shortened name is verbatim (case-insensitive) in a cited row.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nameOpensSentence, openerShortenedSourced, unsourcedLabelNames, unsourcedNames } from "./classFactCheck.ts";

// 950e6c89 (corporate.charter.com), verbatim
const ANYTIME = "Anytime Upgrade : Included in the Spectrum Mobile Unlimited Plus plan, Anytime Upgrade allows customers to upgrade their phones whenever they want, eliminating the traditional wait times and fees associated with device upgrades.";
// ca5367cd (corporate.charter.com), verbatim
const REPAIR = "Repair and Replacement Plan : Provides a unique coverage model for broken screens, loss and theft at the most affordable rate in the industry.";
const names = (text: string, src: string) => unsourcedNames({ text, cls: "you", citedSourceTexts: [src], companyName: "Spectrum" });

Deno.test("N1o: a sentence-opening verb fused onto a stated name passes (13317, 13318)", () => {
  assertEquals(names("Provide Anytime Upgrade, allowing customers to upgrade their phones whenever they want.", ANYTIME), []);
  assertEquals(names("Offer Anytime Upgrade, allowing customers to upgrade their phones whenever they want.", ANYTIME), []);
});

Deno.test("N1o: a sentence-opening article fused onto a stated name passes (13236)", () => {
  assertEquals(names("The Repair and Replacement Plan provides a unique coverage model for broken screens.", REPAIR), []);
  // a later sentence opens it too
  assertEquals(names("It covers screens. Provide Anytime Upgrade for flexibility.", ANYTIME), []);
});

Deno.test("N1o: a shortened name no cited row states is still refused (the negative)", () => {
  assertEquals(names("Provide Turbo Upgrade, allowing customers to upgrade whenever they want.", ANYTIME), ["Provide Turbo Upgrade"]);
  assertEquals(openerShortenedSourced("Provide Turbo Upgrade today.", "Provide Turbo Upgrade", [ANYTIME]), false);
});

Deno.test("N1o: a name mid-sentence is untouched; a one-word name has nothing to shorten", () => {
  assertEquals(names("Customers can Provide Anytime Upgrade today.", ANYTIME), ["Provide Anytime Upgrade"]);
  assertEquals(nameOpensSentence("we Provide Anytime Upgrade", "Provide Anytime Upgrade"), false);
  assertEquals(openerShortenedSourced("FedRAMP is here.", "FedRAMP", ["fedramp"]), false);
});

Deno.test("N1o: labels ride the same gate (an item label opens its own line)", () => {
  assertEquals(unsourcedLabelNames({ field: "items[0].label", label: "Provide Anytime Upgrade", cls: "you", citedSourceTexts: [ANYTIME] }), []);
  assert(unsourcedLabelNames({ field: "items[0].label", label: "Provide Turbo Upgrade", cls: "you", citedSourceTexts: [ANYTIME] }).length === 1);
});

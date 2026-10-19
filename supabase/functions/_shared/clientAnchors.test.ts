// R22 (2026-10-18) — the generator always names the client; anchors add, never replace; both absent refuses.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clientAnchorsFor, CLIENT_UNNAMED_GUARD, hostOfWebsite } from "./clientAnchors.ts";
import { genSystem, judgeSystem } from "./outsideRegenPrompts.ts";

Deno.test("name + host: two anchors, in that order, host through the one helper (www stripped, lowercased)", () => {
  const a = clientAnchorsFor({ name: "Ground Up Innovations", website: "https://www.GUinnovations.com/", entity_anchors_json: [] });
  assert(a.ok); assertEquals(a.anchors, ["Ground Up Innovations", "guinnovations.com"]); assertEquals(a.from_entity_anchors, 0);
  assertEquals(hostOfWebsite("brand.ai"), "brand.ai", "a scheme-less website still yields its host");
  assertEquals(hostOfWebsite(""), null); assertEquals(hostOfWebsite(null), null);
});

Deno.test("entity anchors ADD after name and host, deduped case-insensitively (a host already in the anchors is not repeated)", () => {
  const a = clientAnchorsFor({ name: "Cafe Barra", website: "https://cafebarra.com", entity_anchors_json: ["Cafe Barra", "CAFEBARRA.COM", "Le French Rooster", " ", 7, "lefrenchrooster.com"] });
  assert(a.ok);
  assertEquals(a.anchors, ["Cafe Barra", "cafebarra.com", "Le French Rooster", "lefrenchrooster.com"]);
  assertEquals(a.from_entity_anchors, 2);
});

Deno.test("name only, host only: each alone is enough; both absent REFUSES with the named guard", () => {
  const n = clientAnchorsFor({ name: "Acme", website: null, entity_anchors_json: null });
  assert(n.ok); assertEquals(n.anchors, ["Acme"]); assertEquals(n.host, null);
  const h = clientAnchorsFor({ name: "", website: "acme.test", entity_anchors_json: ["Acme Co"] });
  assert(h.ok); assertEquals(h.anchors, ["acme.test", "Acme Co"]); assertEquals(h.name, null);
  const r = clientAnchorsFor({ name: " ", website: "not a url at all ://", entity_anchors_json: ["Something"] });
  assert(!r.ok); assertEquals(r.guard, CLIENT_UNNAMED_GUARD); assert(/neither a name nor a website host/.test(r.reason));
});

Deno.test("both prompts name every anchor; an empty list throws rather than naming nobody; no placeholder for the business", () => {
  const anchors = ["Ground Up Innovations", "guinnovations.com", "GUI"];
  for (const build of [genSystem, judgeSystem]) {
    const p = build(anchors);
    for (const a of anchors) assert(p.includes(a), `${build.name} names ${a}`);
    assert(!/\bthe client\b/.test(p), `${build.name} carries no 'the client' placeholder`);
    assertThrows(() => build([]), Error, "empty anchor list");
    assertThrows(() => build(["", " "]), Error, "empty anchor list");
  }
  // the measured value the guard's plants move: anchors present in the built generator prompt
  const two = clientAnchorsFor({ name: "Acme Coffee", website: "https://www.acmecoffee.com" });
  assert(two.ok);
  const present = two.anchors.filter((a) => genSystem(two.anchors).includes(a)).length;
  assertEquals(present, 2, "name and host both present in the generator prompt");
});

Deno.test("SOURCE PIN: no prompt builder carries the literal \"the client\"; the function builds no prompt of its own", async () => {
  const prompts = await Deno.readTextFile(new URL("./outsideRegenPrompts.ts", import.meta.url));
  const fn = await Deno.readTextFile(new URL("../extract-outside-evidence/index.ts", import.meta.url));
  const code = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert(!code(prompts).includes('"the client"'), "prompts module: no fallback literal");
  assert(!/`[^`]*\bthe client\b[^`]*`/.test(code(prompts)), "prompts module: no 'the client' inside a template");
  assert(!code(fn).includes("function genSystem(") && !code(fn).includes("JUDGE_SYSTEM"), "the function imports its prompts");
  assert(fn.includes('from "../_shared/outsideRegenPrompts.ts"'));
  const handler = await Deno.readTextFile(new URL("./outsideRegenHandler.ts", import.meta.url));
  assert(handler.includes("clientAnchorsFor(co") && handler.includes("anchors_used: anchors"), "handler names the client through the one function and records the set used");
});

// ── R27: the copying rule and its demonstration are PRESENT in the built generator prompt (presence, not behaviour) ──
Deno.test("R27 SOURCE PIN: the generator prompt carries the copying rule, the DOT demonstration with its one-word counterexample, and the {text, reason} shape; the judge's criteria text is unchanged", async () => {
  const { COPYING_RULE, COPYING_DEMONSTRATION, GENERATOR_JSON_SHAPE } = await import("./outsideRegenPrompts.ts");
  const p = genSystem(["Acme", "acme.test"]);
  assert(p.includes(COPYING_RULE) && /ONE CONTIGUOUS SPAN copied character for character/.test(p), "copying rule present");
  assert(/no joining of separate lines or cells, no added subject/.test(p));
  assert(p.includes(COPYING_DEMONSTRATION) && p.includes("This company has maintained an active DOT status for 1 year but had no inspections"), "demonstration present");
  assert(/WRONG: "The company has maintained/.test(p), "the one-word counterexample");
  assert(p.includes(GENERATOR_JSON_SHAPE) && /"reason"/.test(GENERATOR_JSON_SHAPE), "the {text, reason} shape");
  const j = judgeSystem(["Acme", "acme.test"]);
  assert(/keep=true ONLY if it is the outside source speaking ABOUT that business/.test(j) && /"reason":"\.\.\."/.test(j), "judge criteria and reason field unchanged");
  assert(!j.includes(COPYING_RULE), "the judge does not carry the copying rule");
});

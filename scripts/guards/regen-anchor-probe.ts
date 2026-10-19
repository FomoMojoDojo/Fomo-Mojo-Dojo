// R22 probe: run the regen WRITE path on the test fixtures (fake db, fake transport — no network, no stack) with
// the REAL prompt builders, and count how many of the company's anchors appear in the generator system prompt the
// model was given. The guard asserts 2 (name + host for the fixture company); the plants move it to 0 and 1.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { genSystem, judgeSystem } from "../../supabase/functions/_shared/outsideRegenPrompts.ts";
import { fakeDb, seedR17, deps, r17Transport, CO, RUN2, U1 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const db = fakeDb(seedR17());
const co = db.tables.companies[0] as { name: string; website: string };
const expected = [co.name, "acmecoffee.com"];
let built = "";
const { d } = deps(db, r17Transport(), null);
d.genSystem = (a) => { built = genSystem(a); return built; };
d.judgeSystem = (a) => judgeSystem(a);
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const present = expected.filter((x) => built.includes(x));
console.log(JSON.stringify({ status: r.status, anchors_used: (r.body as { anchors_used?: unknown }).anchors_used ?? null, expected, present_in_generator_prompt: present.length, the_client_in_prompt: /\bthe client\b/.test(built) }));

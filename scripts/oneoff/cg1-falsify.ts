// CG-1 falsification — feed exact texts through the HARDENED route-condition judge.
// Expect: the real Sonos deficiency cond#1 REJECTS with a deficiency-named reason;
// a positive-framed sibling PASSES. Run:
//   OLLAMA_JUDGE_MODEL=llama3:70b deno run --allow-net --allow-env scripts/oneoff/cg1-falsify.ts
import { judgeRouteCondition } from "../../supabase/functions/_shared/routeConditionSynthesis.ts";

const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434/v1";
const judgeModel = Deno.env.get("OLLAMA_JUDGE_MODEL") ?? "llama3:70b";

const route = {
  id: "c66c6a9e-f0fa-40f8-aee3-aca0e020a08f",
  title: "Increase effectiveness of guidance for resolving common issues",
  short_description: null,
  category: "improve",
  existing: [],
};

const cases = [
  { label: "REAL cond#1 (deficiency — expect REJECT)", condition: "Users encounter frequent multi-room audio issues that can be resolved with clear instructions." },
  { label: "positive sibling (expect PASS)", condition: "Users can resolve common multi-room audio issues on their own when given clear, specific guidance." },
];

for (const c of cases) {
  const v = await judgeRouteCondition({ ollamaUrl, judgeModel, route, condition: c.condition });
  console.log(`\n── ${c.label}`);
  console.log(`   condition: ${c.condition}`);
  console.log(`   keep=${v.keep}  reason="${v.reason}"`);
}

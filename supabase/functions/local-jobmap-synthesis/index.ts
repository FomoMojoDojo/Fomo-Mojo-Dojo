// local-jobmap-synthesis — the job-map generator. The handler lives in handler.ts so the
// R1/R2 market-definition contract (marketGate.test.ts) can drive it with an injected client;
// this file only binds it to the runtime.
import { handleLocalJobmapSynthesis } from "./handler.ts";

Deno.serve((req) => handleLocalJobmapSynthesis(req));

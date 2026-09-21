// infer-interview-market — local market inference for a CUSTOMER interview record (Gate B commit 2b, operator
// rulings R19–R35, signed 2026-09-21). The handler lives in handler.ts so handler.test.ts can drive it with an
// injected client, model transport and clock; this file only binds it to the runtime.
import { handleInferInterviewMarket } from "./handler.ts";

Deno.serve((req) => handleInferInterviewMarket(req));

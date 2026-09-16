// record-interview-finding — the one sanctioned path an interview finding takes into odi_needs
// (gate 2, 2026-09-16). The handler lives in handler.ts so handler.test.ts can drive it with an
// injected client and local-model stub; this file only binds it to the runtime.
import { handleRecordInterviewFinding } from "./handler.ts";

Deno.serve((req) => handleRecordInterviewFinding(req));

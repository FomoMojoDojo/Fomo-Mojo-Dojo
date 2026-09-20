// record-interview-upload — the one write path for an interview TRANSCRIPT record (Gate B commit 1, operator
// rulings A1–A5, R1–R8, signed 2026-09-19). The handler lives in handler.ts so handler.test.ts can drive it with
// an injected client, storage and parser; this file only binds it to the runtime.
import { handleRecordInterviewUpload } from "./handler.ts";

Deno.serve((req) => handleRecordInterviewUpload(req));

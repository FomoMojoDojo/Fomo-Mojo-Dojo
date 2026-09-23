// The served entry point. The handler lives in ./handler.ts so a test can import it without
// Deno.serve starting a server on import — the split record-interview-upload and
// infer-interview-market already use.
import { handleInterviewParse } from "./handler.ts";

Deno.serve((req) => handleInterviewParse(req));

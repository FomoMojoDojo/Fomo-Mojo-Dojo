// R8 TYPE-ERROR FIXTURE — this file MUST NOT type-check. classifyBodyMode takes its mode set and its
// known keys as REQUIRED arguments; a caller that omits them is a compile error, not a default.
// The outside-regen mode guard runs `deno check` on this file and goes RED if it ever passes.
import { classifyBodyMode } from "../../../supabase/functions/_shared/bodyMode.ts";

// No error-suppressing directive may precede the call: the guard wants the raw TS2554, not a silenced one.
export const verdict = classifyBodyMode({ plan: true });

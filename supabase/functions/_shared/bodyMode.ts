// ── WD (operator ruling, 2026-10-15): THE MODE IS NAMED, OR THE CALL IS REFUSED ─────────────────
//
// WHY. generate-public-read derived its mode by elimination:
//
//     const doWrite = body.write !== false && !doPlan && !doStage && !doPromote;
//
// so WRITE was the default for any body that named no mode — including a body that meant to name one
// and got the key wrong. A re-stage of Wasabi's strategy was sent as {mode:"stage"}; `mode` is not a
// key the function reads, nothing was true, and the default WROTE A CURRENT READ (04a3d69c, audits
// 10777 -> 10778, both stamped mode:"write") over de1efd3f. That is a promote. It was discarded as
// 10779 and de1efd3f flipped back in the same transaction. Neither the request nor the response said
// a promote had happened; the only evidence was the mode stamp on the audit row, read afterwards.
//
// THE RULE: exactly one mode flag is true, every body key is one the function reads, and anything
// else is a refusal — audited, naming the keys. No default mode remains.
//
// WHY IT IS A PURE FUNCTION IN _shared. The plants that prove this rule have to make the gate
// PERMISSIVE, and a permissive gate reached over HTTP runs a real generation and writes a real
// current read — the exact act being prevented. As one function the rule is provable without a
// write, and the handler has one implementation to call rather than a condition to re-derive.

/** generate-public-read's modes. `dry_run` is here because it is a REAL mode — stamped mode:"dry_run"
 *  on the integrity row — and it used to be reachable ONLY as `write:false`, a body that sets nothing
 *  to true. The ruling refuses such a body, which would have deleted the mode, so it is named
 *  positively. R8 (2026-10-18): these are ONE caller's lists, passed explicitly at its call site —
 *  the function below takes its lists as REQUIRED arguments and holds no default. */
export const MODE_FLAGS = ["plan", "stage", "promote", "write", "dry_run"] as const;
export type ModeFlag = typeof MODE_FLAGS[number];

/** Every key generate-public-read reads off the body. A key not here is refused rather than ignored:
 *  silently ignoring `mode` is what let the promote through. */
export const KNOWN_BODY_KEYS: readonly string[] = [
  "company_id", "kinds", "_probe_internal_id", ...MODE_FLAGS,
];

export const BODY_MODE_GUARD = "body_mode_unnamed" as const;

export type BodyModeVerdict<M extends string = string> =
  | { ok: true; mode: M }
  | {
    ok: false;
    detail: string;
    keys_sent: string[];
    modes_named: string[];
    unknown_keys: string[];
  };

/** THE one decision. Exactly one of `modes` is true in `body`, and no key outside `knownKeys`.
 *  R8: both lists are REQUIRED — a caller that cannot say which modes and keys it reads has no
 *  business classifying a body, and a default list would be a second function's rule in disguise. */
export function classifyBodyMode<M extends string>(
  body: Readonly<Record<string, unknown>>,
  modes: readonly M[],
  knownKeys: readonly string[],
): BodyModeVerdict<M> {
  const modes_named = modes.filter((f) => body[f] === true);
  const unknown_keys = Object.keys(body).filter((k) => !knownKeys.includes(k));
  if (modes_named.length === 1 && unknown_keys.length === 0) {
    return { ok: true, mode: modes_named[0] };
  }
  const detail = [
    modes_named.length === 0
      ? `no mode flag set to true (one of: ${modes.join(", ")})`
      : modes_named.length > 1
      ? `${modes_named.length} mode flags set to true: ${modes_named.join(", ")} (exactly one)`
      : null,
    unknown_keys.length > 0 ? `unknown body key(s): ${unknown_keys.join(", ")}` : null,
  ].filter(Boolean).join("; ");
  return { ok: false, detail, keys_sent: Object.keys(body).sort(), modes_named: [...modes_named], unknown_keys };
}

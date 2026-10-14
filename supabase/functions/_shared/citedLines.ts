// ── The CITED LINES of a stored read ────────────────────────────────────────────────────────────
//
// Lifted out of generate-public-read/index.ts (2026-10-14) byte-for-byte so _shared code can read a
// stored payload without importing a function directory: S1 at promote needs exactly this walk, and
// `_shared` importing `../generate-public-read/index.ts` would invert the layering and pull the
// whole generator (and its Deno.serve) into every caller. generate-public-read re-exports the name,
// so scripts/c1c2-continuity-cost.ts and every spec that imports it are unchanged.
import type { CitedLine } from "./stageContinuity.ts";

/** C1: the cited lines of a STORED payload (UUID citations), for the continuity comparison.
 *  It reads the same shapes stampFieldClasses walks — a `<base>_citations` array beside its text, or
 *  a bare `citations` on an array element — but off a stored row rather than a model answer, so it
 *  cannot reuse that function (which mutates and expects ref tokens). Kept deliberately small: a
 *  shape it does not recognise contributes no line, and a line it cannot read is a line it cannot
 *  require, which fails OPEN. That is the right direction for a check that refuses: a missed line
 *  is a missed refusal, never a false one. */
const CITE_OR_CLASS_RE = /citation|cites?$|refs?$|ids$|_class$|^class$/i;
export function linesOfStoredPayload(payload: Record<string, unknown> | null): CitedLine[] {
  const out: CitedLine[] = [];
  const walk = (v: unknown, path = ""): void => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (!v || typeof v !== "object") return;
    const obj = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(obj)) {
      const m = /^(.*?)_(?:citations|cites?|refs?)$/.exec(k);
      const bare = k === "citations" || k === "refs";
      if ((m || bare) && Array.isArray(val)) {
        const base = m ? m[1] : "";
        const clsKey = m ? `${base}_class` : "class";
        const cls = typeof obj[clsKey] === "string" ? String(obj[clsKey]) : null;
        let text = "";
        if (base && typeof obj[base] === "string") text = String(obj[base]);
        else if (base) {
          const pk = Object.keys(obj).find((x) => x.startsWith(`${base}_`) && !CITE_OR_CLASS_RE.test(x) && typeof obj[x] === "string");
          if (pk) text = String(obj[pk]);
        } else {
          for (const kk of ["text", "statement", "promise", "body"]) if (typeof obj[kk] === "string") { text = String(obj[kk]); break; }
        }
        const field = bare ? path : `${path ? `${path}.` : ""}${base}`;
        if (text) out.push({ field, text, cls, refs: (val as unknown[]).map(String) });
        continue;
      }
      if (!CITE_OR_CLASS_RE.test(k)) walk(val, path ? `${path}.${k}` : k);
    }
  };
  walk(payload);
  return out;
}


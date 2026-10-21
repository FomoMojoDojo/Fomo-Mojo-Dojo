#!/usr/bin/env -S deno run --allow-all
// ── E1 (operator ruling 2026-10-21) — the ONE writer of company_related_entities ──────────────────────────────────────
//
//   deno run --allow-all scripts/related-entities.ts --plan  --company=<uuid> --spec=<entities.json>
//       Validates every spec against the signed refusals (scripts/related-entities/core.ts) and prints each would-be row.
//       ZERO WRITES, ENFORCED: one `begin transaction read only`, no transaction id assigned, rolled back. NO FETCH — the
//       quote is verified only by --write.
//   deno run --allow-all scripts/related-entities.ts --write --company=<uuid> --spec=<entities.json> --status=<proposed|confirmed> --actor=<name>
//       Refused unless every spec validates. Fetches each source_url, asserts its source_quote byte-present in the page
//       text, and in ONE transaction writes the entity rows, the pages verified against and an audit row each.
// The mode is named or refused (classifyBodyMode) — there is no default; an unknown key is refused.
// spec file: a JSON array of { name, host, relation, effective_from, effective_basis, source_url, source_quote,
// exclude_hosts?, note? }. Only status = confirmed has any effect anywhere (ownHosts.loadConfirmedRelatedEntities).
import { classifyBodyMode } from "../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "./r52/sweepCore.ts";
import { PsqlSession } from "./lib/psqlBlankingStore.ts";
import { fetchPageText, loadValidationCtx, validateSpecs, writeSpecs, type EntitySpec } from "./related-entities/core.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write"] as const, ["plan", "write", "company", "spec", "status", "actor"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const companyId = typeof body.company === "string" ? body.company : "";
const specPath = typeof body.spec === "string" ? body.spec : "";
if (!companyId || !specPath) { out({ ok: false, refused: true, code: "args", error: "--company=<uuid> and --spec=<file.json> are required" }); Deno.exit(3); }
const specs = JSON.parse(await Deno.readTextFile(specPath)) as EntitySpec[];
if (!Array.isArray(specs) || specs.length === 0) { out({ ok: false, refused: true, code: "args", error: "the spec file is not a non-empty JSON array" }); Deno.exit(3); }

const session = new PsqlSession();
try {
  if (v.mode === "plan") {
    await session.exec("begin transaction read only;");
    const ctx = await loadValidationCtx(session, companyId);
    const verdicts = validateSpecs(specs, ctx);
    const xid = (await session.query<{ xid: string | null }>(`select pg_current_xact_id_if_assigned()::text xid`))[0].xid;
    await session.exec("rollback;");
    out({ mode: "plan", read_only: true, xid_assigned: xid, fetched: false, company: { id: ctx.company.id, name: ctx.company.name, website: ctx.company.website, exclude_domains: ctx.company.exclude_domains },
      rows: verdicts.map((x) => ({ would_write: x.refusals.length === 0, host: x.host, name: x.spec.name, relation: x.spec.relation, effective_from: x.spec.effective_from, effective_basis: x.spec.effective_basis,
        source_url: x.spec.source_url, source_quote: x.spec.source_quote, exclude_hosts: x.spec.exclude_hosts ?? [], note: x.spec.note ?? null, refusals: x.refusals, warnings: x.warnings })),
      all_pass: verdicts.every((x) => x.refusals.length === 0) });
  } else {
    const status = body.status === "proposed" || body.status === "confirmed" ? body.status : null;
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim() : "";
    if (!status || !actor) { out({ ok: false, refused: true, code: "args", error: "--write needs --status=<proposed|confirmed> and --actor=<name>" }); Deno.exit(3); }
    await session.exec("begin;");
    const ctx = await loadValidationCtx(session, companyId);
    const verdicts = validateSpecs(specs, ctx);
    const bad = verdicts.filter((x) => x.refusals.length);
    if (bad.length) { await session.exec("rollback;"); out({ ok: false, refused: true, code: "validation", rows: bad.map((x) => ({ host: x.host, refusals: x.refusals })) }); Deno.exit(3); }
    const written = await writeSpecs(session, companyId, verdicts, { status, actor, fetchPage: fetchPageText });
    await session.exec("commit;");
    out({ mode: "write", ok: true, written });
  }
} catch (e) {
  try { await session.exec("rollback;"); } catch { /* none open */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await session.close();
  Deno.exit(1);
}
await session.close();

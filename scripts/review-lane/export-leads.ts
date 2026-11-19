#!/usr/bin/env -S deno run --allow-all
// ── EXPORT LEADS, MASKED (A3, 2026-11-18) ─────────────────────────────────────────────────────────────────────────────
// The one export of a company's leads for display: the review-lane rows held "search summary, not checked against the
// page" and the forum search summaries (search_leads). Every text passes maskReviewerNames (_shared/leadText.ts): the
// reviewer's name or handle shown as "[reviewer]". READ ONLY (one read-only transaction); the stored text is unchanged.
//   deno run --allow-all scripts/review-lane/export-leads.ts --company=<uuid> [--out=<file.json>]
import { lit, PsqlSession } from "../lib/psqlBlankingStore.ts";
import { LEAD_BASIS_LABEL } from "../../supabase/functions/_shared/searchLeads.ts";
import { maskReviewerNames } from "../../supabase/functions/_shared/leadText.ts";

const arg = (k: string) => Deno.args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? "";
const company = arg("company");
if (!/^[0-9a-f-]{36}$/.test(company)) { console.log(JSON.stringify({ ok: false, error: "--company=<uuid> is required" })); Deno.exit(3); }
const BRAND = `case %s when '68476083-0e1b-453d-947d-40e9699c6b83' then 'spectrum' when 'e2c1c984-0d9b-4936-9afc-6b6f355559f2' then 'cox' else null end`;
const s = new PsqlSession();
await s.exec("begin transaction read only;");
const held = await s.query<{ id: string; url: string; text: string; brand: string | null; verify_reason: string | null }>(`select s.id, s.source_url url,
  coalesce(nullif(s.raw_payload->>'review_body',''), s.evidence_excerpt) text, ${BRAND.replace("%s", "s.about_entity_id")} brand,
  s.raw_payload->'lead_verify'->>'reason' verify_reason from signals s
  where s.company_id=${lit(company)}::uuid and s.review_lane_call_id is not null and s.superseded_at is null and s.held_reason=${lit(LEAD_BASIS_LABEL)} order by s.id`);
const forum = await s.query<{ id: string; url: string; title: string; snippet: string; published_date: string | null; forum: string | null; brand: string | null }>(`select l.id, l.url,
  l.title, l.snippet, l.published_date, l.forum, ${BRAND.replace("%s", "l.about_entity_id")} brand from search_leads l
  where l.company_id=${lit(company)}::uuid and l.retired_at is null order by l.id`);
await s.exec("rollback;");
await s.close();
let names = 0, rowsMasked = 0;
const mk = (t: string) => { const r = maskReviewerNames(t); names += r.masked; return r; };
const heldOut = held.map((h) => { const r = mk(h.text ?? ""); if (r.masked) rowsMasked++; return { ...h, text: r.text, masked: r.masked }; });
const forumOut = forum.map((f) => { const a = mk(f.title ?? ""), b = mk(f.snippet ?? ""); if (a.masked + b.masked) rowsMasked++; return { ...f, title: a.text, snippet: b.text, masked: a.masked + b.masked }; });
const out = { company, label: LEAD_BASIS_LABEL, held: heldOut, forum: forumOut, masked: { names, leads: rowsMasked } };
if (arg("out")) await Deno.writeTextFile(arg("out"), JSON.stringify(out));
console.log(JSON.stringify({ ok: true, held: heldOut.length, forum: forumOut.length, masked: out.masked }));

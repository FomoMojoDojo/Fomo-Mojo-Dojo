// ── generate-read-slots — SHORT-FORM SLOTS, slice 1 (rulings R1-R7, signed 2026-10-05) ───────────
//
// WHY A NEW FUNCTION AND NOT A MODE OF generate-public-read:
//   * DIFFERENT INPUTS. generate-public-read's whole input pipeline is selectPublicInputs over the
//     raw signal/own_word/finding/delta pool with S/O/F/M/D ref tokens. A slot's inputs are the
//     SOURCE READ'S OWN FIELDS and nothing else (R5), so a slot mode would bypass that pipeline
//     entirely — every guard, cap and ref-validation in it would be dead code on the slot path.
//   * DIFFERENT JUDGE. Grounding asks "is this supported by the ledger?". Containment asks "does
//     this say anything the read does not?". Opposite directions, different prompt, different
//     verdict shape, different accept rule.
//   * DIFFERENT TARGET. first_read_slots, with its own model/judge stamp and signature columns.
//   * BLAST RADIUS. generate-public-read is 567 lines carrying per-kind isolation, cascade routing
//     and the offering clauses. "Any change to how full reads are generated or judged" is explicitly
//     out of scope for this slice; a new function keeps that file untouched.
// It SHARES the plumbing that must not fork: resolveModel (the lane), recordModelCall (the ledger),
// integrity_runs (the census), and _shared/readSlots.ts (the shapes, caps and deterministic check).
//
// Body: { company_id, kinds?: ("positioning"|"strategy")[], stage?: boolean }
//   default            → DRY RUN: generate + check + judge, write nothing
//   stage: true        → write each ACCEPTED kind as is_current=false, UNSIGNED (nothing is current
//                        until an operator promotes it; promotion is the only signing act)
// Slice 1 admits positioning and strategy ONLY. promise (slice 2) and who_you_serve (slice 3) are
// refused here by SLICE_1_KINDS even though the table's CHECK already accepts them.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveModel, callOpenAIJson, withRetry429, usdCost, type OpenAIUsage } from "../_shared/modelRouter.ts";
import { openaiRecord, recordModelCall } from "../_shared/recordModelCall.ts";
import {
  SLICE_1_KINDS, SLOT_CAPS, SLOT_MIN_CHARS, DIFFERENTIATORS_MIN, DIFFERENTIATORS_MAX,
  VERBATIM_MAX_CHARS, checkSlotsDeterministic, slotFieldPaths, judgeVisibleFields,
  verbatimDifferentiatorIndices, sourceClassFor, type SlotKind,
} from "../_shared/readSlots.ts";
import { promoteStagedSlots, rejectStagedSlots, SlotPromoteRefused } from "../_shared/readSlotsPromote.ts";
import { runKind, lengthsOf, getSlotAt, type GenerateFn, type JudgeFn } from "../_shared/readSlotsRun.ts";
import { decideFieldClass, fieldClassOk, type FieldClassDecision } from "../_shared/classFactCheck.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const OLLAMA_URL = Deno.env.get("OLLAMA_URL") ?? "http://host.docker.internal:11434";
// Only the EXTERNAL lane accrues billable usage, and resolveModel's external model is a constant.
const EXTERNAL_LEDGER_MODEL = "gpt-4.1-mini";

// ── THE GENERATOR PROMPT — select and shorten, never mint ────────────────────────────────────────
function genSystemFor(kind: SlotKind): string {
  const shared =
    `You write the SHORT FORM of a commitment screen: a set of framework slots, not a shortened paragraph.\n` +
    `You are given the read's OWN FIELDS. Every slot must SELECT AND SHORTEN what is already there.\n` +
    `HARD RULES:\n` +
    `- Say LESS than the field, never more. Add no fact, no qualifier, no number, no name that is not in the field you shorten.\n` +
    `- Carry the field's citations through. A SUBSET is fine — you may carry fewer. NEVER a citation id the source field does not hold.\n` +
    `- No verdict or status vocabulary (confirmed, disputed, stale, leading, best-in-class).\n` +
    `- Plain sentence case. One sentence per line. No trailing ellipsis.\n` +
    // SPECIFICS (2026-10-08) — the same rule the full read carries. It matters more here: a slot is a
    // COMPRESSION, and the cheapest thing to lose when shortening is the hedge or the scope that made
    // the specific sourceable. A line that drops "in the Bay Area" to fit the cap turns a sourced
    // claim into an unsourced one.
    `SPECIFICS. A specific is a superlative, an exclusivity word, a figure, or a reach claim.\n` +
    `- Keep a specific ONLY in the words the source field already uses, and keep the citations that carry it.\n` +
    `- Never strengthen one while shortening: 'one of the only' stays 'one of the only'; it never becomes 'the only' or 'sole'.\n` +
    `- Keep the SCOPE attached to the specific. 'the only CSU serving youth under 12 in the Bay Area' may shorten to\n` +
    `  'the only CSU for youth under 12 in the Bay Area', never to 'the only CSU for youth under 12': the place is\n` +
    `  part of what makes the claim true.\n` +
    `- If the cap will not fit the specific WITH its scope and its hedge, drop the specific and name the plain thing instead.\n`;
  if (kind === "positioning") {
    return shared +
      `SLOTS for positioning — the DIFFERENTIATORS LEAD and the category is context:\n` +
      `- differentiators: ${DIFFERENTIATORS_MIN}-${DIFFERENTIATORS_MAX} lines, each shortened from ONE unique_attributes entry, in the order given. Max ${SLOT_CAPS.positioning.differentiators} chars each, min ${SLOT_MIN_CHARS}. Each carries THAT entry's citations.\n` +
      `- category_context: one line shortened from market_category, naming what the business IS. Max ${SLOT_CAPS.positioning.category_context} chars, min ${SLOT_MIN_CHARS}. Carries market_category's citations.\n` +
      `JSON only: {"differentiators":[{"text":"...","citations":["..."]}],"category_context":{"text":"...","citations":["..."]}}`;
  }
  return shared +
    `SLOTS for strategy — NAME THE CORE, one line each:\n` +
    `- where_to_play_line: name the CORE WHERE in one line. Max ${SLOT_CAPS.strategy.where_to_play_line} chars, min ${SLOT_MIN_CHARS}. Carries where_to_play's citations.\n` +
    `- how_to_win_line: name the CORE HOW in one line AND KEEP ITS SINGLE MOST CONCRETE SPECIFIC from\n` +
    `  the read — a named unit, a named program, or a stated distinction (for example "a level N\n` +
    `  facility", a named programme, a named payer). Max ${SLOT_CAPS.strategy.how_to_win_line} chars, min ${SLOT_MIN_CHARS}. Carries how_to_win's citations.\n` +
    // 2026-10-08: the old example here offered an exclusivity claim as the specific to keep. It was the
    // sharpest invitation to an unsourced superlative anywhere in the codebase, because it told the
    // model to KEEP an exclusivity claim with no sourcing condition attached. The example now shows
    // specifics that are not exclusivity claims; an exclusivity word is governed by SPECIFICS above.
    `  A specific that is an EXCLUSIVITY claim ("the only…", "the sole…") is kept ONLY under SPECIFICS:\n` +
    `  in the source field's own words, with its scope and its citations. Otherwise keep a different\n` +
    `  specific from the field, or name the plain thing.\n` +
    `  NO ADJECTIVE MAY STAND IN FOR A FACT. Words like "unique", "exclusive", "pioneering", "strong",\n` +
    `  "comprehensive" are only allowed when the fact they describe is ALSO present in your line. A line\n` +
    `  made of adjectives is a rejected line: it is the specifics that carry the claim.\n` +
    `THIS IS NOT A SUMMARY. Do not shorten the rung by trimming it. Name the ONE core where (or the\n` +
    `one core how) the rung is about and stop. DROP THE QUALIFYING CLAUSES — the conditions, the\n` +
    `examples, the "including ...", the "especially ...", the "while ...", the segment lists. They stay\n` +
    `behind the swap on the full read; the reader reaches them there.\n` +
    `EVERY WORD MUST FOLLOW FROM THE SOURCE READ. Add nothing: no new scope, no new segment, no new\n` +
    `claim, no sharpening the rung into something it does not already say.\n` +
    `Do NOT shorten the aspiration or the capabilities — they stay behind the swap.\n` +
    `JSON only: {"where_to_play_line":{"text":"...","citations":["..."]},"how_to_win_line":{"text":"...","citations":["..."]}}`;
}

// ── THE CONTAINMENT JUDGE — one direction only, one verdict per slot (R5) ────────────────────────
// Separate from the grounding judge by design. Grounding asks whether the LEDGER supports a claim;
// containment asks whether the READ already contains it. The judge sees the slot text and the source
// read's own fields — never the raw ledger — so it cannot "rescue" a slot that outran the read by
// finding support for it elsewhere.
function judgeSystemFor(kind: SlotKind): string {
  const sanity = kind === "positioning"
    ? `\n(c) CATEGORY SANITY (category_context only) — it must still name what the business IS, not what it aspires to or how good it is. Carried over from the full read's judge.`
    : "";
  return `You judge whether each SHORT-FORM SLOT is ENTAILED BY the read it was shortened from.\n` +
    `You see the slot text and the read's OWN FIELDS. Nothing else. Do not reason from outside knowledge.\n` +
    `ONE DIRECTION ONLY: a slot may say LESS than the read. It may NEVER say more.\n` +
    `For each slot answer:\n` +
    `(a) ENTAILED — is every claim in the slot already stated by the field it was shortened from? Any new fact, added qualifier, widened scope, number, or named entity that the field does not contain ⇒ entailed:false.\n` +
    `(b) NO VERDICT VOCABULARY — no confirmed/disputed/stale/leading/best-in-class style word appears.${sanity}\n` +
    // 1a-4 (S2, 2026-10-07): the slot's CLASS is given to you per slot; judge the WORDING against it.
    // The letter follows the kind so there is no hole: positioning already uses (c) for category sanity.
    `(${kind === "positioning" ? "d" : "c"}) CLASS — each slot names its source class. A slot of class 'our_read' must read as an openly-held reading, never as an established fact. A slot of class 'record' may say what the record shows. A slot of class 'you' may say what the company says. Set class_ok:false on any slot that asserts more than its class allows, naming the words that do it.\n` +
    `Judge each slot ON ITS OWN. One slot failing says nothing about the others.\n` +
    `JSON only: {"slots":{"<slot field path>":{"entailed":true|false,"vocab_ok":true|false,` +
    (kind === "positioning" ? `"category_sanity_ok":true|false,` : ``) +
    `"class_ok":true|false,"accept":true|false,"reason":"<one line>"}}}`;
}

/** THE JUDGE RE-ASK (ruling 1, 2026-10-05). The judge's own reason goes back, and ONLY the rejected
 *  slot is asked for: the reply carries a `fixes` map keyed by slot path, which the run module
 *  splices in. An accepted sibling is never regenerated, so it stays byte-identical. */
function judgeRetrySystemFor(kind: SlotKind): string {
  return `A containment judge REJECTED one or more of your short-form slots. Rewrite ONLY those.\n` +
    `A slot may say LESS than the read it was shortened from. It may NEVER say more, and it may never\n` +
    `merge two things the read keeps apart or widen a scope the read states narrowly.\n` +
    `NAME THE CORE in one line and stop. Drop the qualifying clauses. EVERY WORD MUST FOLLOW FROM THE\n` +
    `SOURCE READ; add nothing. Keep the SAME citations (a subset is fine — never a ref the source does\n` +
    `not hold). Respect the character cap given for each field.\n` +
    `Return ONLY the rejected fields, keyed by the exact field path you were given.\n` +
    `The slot's CLASS is fixed by its source field and is re-attached for you — do not write it.\n` +
    `JSON only: {"fixes":{"<field path>":{"text":"...","citations":["..."]}}}`;
}

type SlotVerdict = { entailed?: boolean; vocab_ok?: boolean; category_sanity_ok?: boolean; class_ok?: boolean; accept?: boolean; reason?: string };



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body?.company_id ?? "").trim();
    if (!company_id) return json({ error: "company_id required" }, 400);
    const doStage = body?.stage === true;
    const doPromote = body?.promote === true;   // the operator's signing act
    const doReject = body?.reject === true;

    let kinds: readonly SlotKind[] = SLICE_1_KINDS;
    if (Array.isArray(body?.kinds) && body.kinds.length > 0) {
      const bad = body.kinds.filter((k: unknown) => !(SLICE_1_KINDS as readonly string[]).includes(String(k)));
      if (bad.length) return json({ error: `slice 1 supports only: ${SLICE_1_KINDS.join(", ")}`, bad_kinds: bad }, 400);
      kinds = body.kinds.map(String) as SlotKind[];
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── PROMOTE / REJECT: no generation, no model call (the publicReadPromote shape) ─────────────
    // Promotion IS the signature, so signed_by is required and the refusal names the slot.
    if (doPromote) {
      const signedBy = String(body?.signed_by ?? "").trim();
      if (!signedBy) return json({ error: "signed_by required — a current slot is always an operator-signed slot" }, 400);
      try {
        const { promoted } = await promoteStagedSlots(supabase, company_id, kinds, signedBy, body?.sign_note ?? null);
        return json({ ok: true, promoted });
      } catch (e) {
        if (e instanceof SlotPromoteRefused) return json({ ok: false, error: e.message, refused: { kind: e.kind, slot_id: e.slotId } }, 409);
        throw e;
      }
    }
    if (doReject) {
      const { rejected } = await rejectStagedSlots(supabase, company_id, kinds, String(body?.reason ?? "operator_rejected"));
      return json({ ok: true, rejected });
    }
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? undefined;
    let usage: OpenAIUsage = { prompt_tokens: 0, completion_tokens: 0 };

    const callLocal = async (model: string, system: string, user: string): Promise<string> => {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const jr = await res.json();
      return String(jr?.message?.content ?? "");
    };
    const runModel = async (choice: { provider: string; model: string }, system: string, user: string): Promise<Record<string, unknown>> => {
      let content: string;
      if (choice.provider === "external_openai") {
        if (!openaiKey) throw new Error("OPENAI_API_KEY missing for the external lane");
        const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, temperature: 0, timeoutMs: 120_000 }));
        content = r.content;
        if (r.usage) { usage.prompt_tokens += r.usage.prompt_tokens; usage.completion_tokens += r.usage.completion_tokens; }
      } else {
        content = await callLocal(choice.model, system, user);
      }
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`${choice.model} returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(m[0]) as Record<string, unknown>;
    };

    const perKind: Record<string, unknown> = {};
    const staged: Array<{ kind: string; id: string }> = [];

    for (const kind of kinds) {
      // ── the source read: its CURRENT revision, and its own fields are the only input ───────────
      const { data: readRow } = await supabase.from("public_reads")
        .select("id, payload, input_ledger, model_provider, created_at")
        .eq("company_id", company_id).eq("kind", kind).eq("is_current", true).maybeSingle();
      const src = readRow as { id?: string; payload?: Record<string, unknown>; input_ledger?: Record<string, unknown> | null; model_provider?: string | null } | null;
      if (!src?.id) {
        perKind[kind] = { status: "no_source_read", detail: `no current public_reads row for kind=${kind}` };
        await supabase.from("integrity_runs").insert({
          company_id, component: `first_read_slot_${kind}`, status: "rejected", examined: 0, admitted: 0,
          excluded_by_rule: { kind, guard: "no_source_read", mode: doStage ? "stage" : "dry_run" },
        });
        continue;
      }
      const payload = (src.payload ?? {}) as Record<string, unknown>;

      // ── THE LANE (R5): a slot runs in its SOURCE READ'S lane. The read's stored provider is the
      //    recorded outcome of resolveModel over its inputs, so we re-derive THROUGH resolveModel
      //    rather than copying the string: the decision stays in one place, and an unknown or absent
      //    provider fail-closes to local exactly as an unknown provenance does.
      const sourceProvenance = src.model_provider === "external_openai" ? "public_observed" : null;
      const genChoice = resolveModel({ role: "generator", inputs: [{ provenance: sourceProvenance }] });
      const judgeChoice = resolveModel({ role: "judge", inputs: [{ provenance: sourceProvenance }] });

      const visible = judgeVisibleFields(kind, payload);
      const genUser = `THE READ'S OWN FIELDS (${kind}):\n${JSON.stringify({ ...visible, citations: {
        market_category_citations: payload.market_category_citations ?? null,
        where_to_play_citations: payload.where_to_play_citations ?? null,
        how_to_win_citations: payload.how_to_win_citations ?? null,
        unique_attributes_citations: Array.isArray(payload.unique_attributes)
          ? (payload.unique_attributes as Array<{ citations?: unknown }>).map((a) => a?.citations ?? [])
          : null,
      } }, null, 1)}\n\nWrite the slots.`;

      // ── THE VERBATIM PATH (ruling 3, 2026-10-05) ───────────────────────────────────────────────
      // A positioning differentiator whose SOURCE is already <= VERBATIM_MAX_CHARS is COPIED, not
      // written: no generator call and no judge call for that item. Copying cannot say more than the
      // source, so the thing the judge exists to catch cannot happen. The deterministic checks still
      // run over it — including a byte-equality check that the line really IS its source.
      // ── THE CLASS FACT-CHECK on slot lines (2026-10-07) ──────────────────────────────────────
      // The SAME function the read-level gate uses. It matters most here: a slot is a COMPRESSION,
      // and the cheapest thing to lose when shortening is the hedge. A source field the judge
      // cleared as "we read Edgewood as…" can shorten to a bare assertion, so the slot is
      // fact-checked on its own terms rather than inheriting its source field's verdict.
      // The sourcing evidence is the source read's own ledger: the rows it cited whose class is
      // record or you. A read written before 1a-4 carries no classes, so there is no evidence to
      // source against and every specific-bearing line goes to the judge.
      const ledgerClasses = ((src?.input_ledger ?? {}) as { classes?: Record<string, string> }).classes ?? {};
      const sourceRowTextById = new Map<string, string>();
      {
        const wanted = Object.keys(ledgerClasses).filter((id) => ledgerClasses[id] === "record" || ledgerClasses[id] === "you");
        for (let i = 0; i < wanted.length; i += 200) {
          const chunk = wanted.slice(i, i + 200);
          const [sg, ow, fd] = await Promise.all([
            supabase.from("signals").select("id, claim_text, evidence_excerpt").in("id", chunk),
            supabase.from("own_words_candidates").select("id, quote").in("id", chunk),
            supabase.from("findings").select("id, body").in("id", chunk),
          ]);
          for (const r of ((sg.data ?? []) as Array<{ id: string; claim_text: string | null; evidence_excerpt: string | null }>)) {
            sourceRowTextById.set(r.id, `${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}`.trim());
          }
          for (const r of ((ow.data ?? []) as Array<{ id: string; quote: string | null }>)) sourceRowTextById.set(r.id, r.quote ?? "");
          for (const r of ((fd.data ?? []) as Array<{ id: string; body: string | null }>)) sourceRowTextById.set(r.id, r.body ?? "");
        }
      }
      /** (b) for one slot line: its specifics against the record/you rows IT cites. */
      const decideSlotClass = (field: string, line: unknown): FieldClassDecision => {
        const l = (line ?? {}) as { text?: unknown; citations?: unknown; source_class?: unknown };
        const refs = Array.isArray(l.citations) ? l.citations.map(String) : [];
        return decideFieldClass({
          field,
          cls: typeof l.source_class === "string" ? l.source_class : null,
          text: typeof l.text === "string" ? l.text : "",
          citedSourceTexts: refs
            .filter((id) => ledgerClasses[id] === "record" || ledgerClasses[id] === "you")
            .map((id) => sourceRowTextById.get(id) ?? ""),
        });
      };

      const verbatimIdx = kind === "positioning" ? verbatimDifferentiatorIndices(payload) : [];
      const verbatimPaths = verbatimIdx.map((i) => `differentiators[${i}]`);
      const srcAttrs = Array.isArray(payload.unique_attributes)
        ? (payload.unique_attributes as Array<{ text?: unknown; citations?: unknown }>) : [];
      const verbatimLineAt = (i: number) => {
        const cls = sourceClassFor(payload, kind, "differentiators", i);
        return {
          text: String(srcAttrs[i]?.text ?? "").trim(),
          citations: Array.isArray(srcAttrs[i]?.citations) ? (srcAttrs[i]!.citations as unknown[]).map(String) : [],
          path: "verbatim" as const,
          // 1a-4: a copied line inherits its source item's class exactly — never stronger.
          ...(cls ? { source_class: cls } : {}),
        };
      };
      /** Splice the copied differentiators over whatever the model returned for that kind. */
      const applyVerbatim = (out: Record<string, unknown>): Record<string, unknown> => {
        if (kind !== "positioning" || verbatimIdx.length === 0) return out;
        const diffs = Array.isArray(out.differentiators) ? [...(out.differentiators as unknown[])] : [];
        for (let i = 0; i < srcAttrs.length; i++) {
          if (verbatimIdx.includes(i)) diffs[i] = verbatimLineAt(i);
          else if (diffs[i] && typeof diffs[i] === "object") diffs[i] = { ...(diffs[i] as object), path: "generated" };
        }
        return { ...out, differentiators: diffs.slice(0, srcAttrs.length) };
      };
      // What the model is actually asked for. With every differentiator copied, the ask is the
      // category line alone — and when a kind needs nothing at all, no generator call is made.
      const longIdx = kind === "positioning" ? srcAttrs.map((_, i) => i).filter((i) => !verbatimIdx.includes(i)) : [];
      const verbatimNote = kind === "positioning" && verbatimIdx.length > 0
        ? `\n\nDIFFERENTIATORS ALREADY SETTLED — do NOT write these, they are copied from the read verbatim: ${verbatimIdx.map((i) => `#${i + 1}`).join(", ")}.` +
          (longIdx.length > 0
            ? ` Write ONLY differentiator(s) ${longIdx.map((i) => `#${i + 1}`).join(", ")} (max ${SLOT_CAPS.positioning.differentiators} chars each) and category_context.`
            : ` Write ONLY category_context. Return differentiators as an empty array.`)
        : "";

      // ── GENERATE → GATE → at most ONE retry, shared between gate and judge (readSlotsRun.ts) ──
      const generate: GenerateFn = async (mode, ctx) => {
        if (mode === "initial") return applyVerbatim(await runModel(genChoice, genSystemFor(kind), genUser + verbatimNote));
        if (mode === "gate_retry") {
          const told = (ctx.violations ?? []).map((v) => `- ${v.field}: ${v.detail}`).join("\n");
          const retryUser = `${genUser}\n\nYOUR PREVIOUS ANSWER WAS REJECTED by a deterministic check:\n${told}\n` +
            `Rewrite it. Keep the SAME citations (a subset is fine — never a ref the source does not hold).\n` +
            `Do NOT trim the line you wrote. NAME THE CORE in one line and stop: the one core where, the one\n` +
            `core how, the one thing the differentiator is. DROP THE QUALIFYING CLAUSES — conditions,\n` +
            `examples, "including ...", "especially ...", segment lists. EVERY WORD MUST FOLLOW FROM THE\n` +
            `SOURCE READ; add nothing. Every line must be AT OR UNDER its cap and at least ${SLOT_MIN_CHARS}\n` +
            `characters. Count the characters before you answer.`;
          return applyVerbatim(await runModel(genChoice, genSystemFor(kind), retryUser + verbatimNote));
        }
        // judge_retry — only the rejected fields, each with the judge's own reason
        const caps = JSON.stringify(SLOT_CAPS[kind]);
        const asks = (ctx.rejected ?? []).map((r) => `- ${r.field}: REJECTED BECAUSE — ${r.reason}`).join("\n");
        const fixUser = `THE READ'S OWN FIELDS:\n${JSON.stringify(visible, null, 1)}\n\n` +
          `YOUR SLOTS:\n${JSON.stringify(slotsForPrompt, null, 1)}\n\n` +
          `CHARACTER CAPS: ${caps}\n\nREWRITE ONLY THESE:\n${asks}`;
        // a re-ask is a GENERATOR call (it writes a slot), so it runs on the generator's lane.
        return await runModel(genChoice, judgeRetrySystemFor(kind), fixUser);
      };
      const judge: JudgeFn = async (candidate) => {
        // 1a-4 tightened: (b) first, per line. Only the lines whose specifics are NOT verbatim-
        // sourced in a cited record/you row are put to the judge for a class judgment.
        const decs = slotFieldPaths(kind, candidate).map((f) => decideSlotClass(f, getSlotAt(candidate, f)));
        lastSlotClassDecisions = decs;
        const needJudgment = decs.filter((d) => d.branch === "judge_required");
        const askBlock = needJudgment.length === 0
          ? "none — every our_read slot is verbatim-sourced in a cited record/you row."
          : JSON.stringify(needJudgment.map((d) => ({ field: d.field, class: d.cls, unsourced_specifics: d.unsourced.map((u) => u.token) })));
        const judgeUser = `THE READ'S OWN FIELDS:\n${JSON.stringify(visible, null, 1)}\n\nSLOT CLASSES (inherited from the source field):\n${JSON.stringify(decs.map((d) => ({ field: d.field, class: d.cls, branch: d.branch })))}\n\nSLOTS NEEDING A CLASS JUDGMENT (these state specifics no cited record/you row carries):\n${askBlock}\n\nTHE SLOTS:\n${JSON.stringify(candidate, null, 1)}\n\nJudge each slot for entailment and class.`;
        const v = await runModel(judgeChoice, judgeSystemFor(kind), judgeUser);
        // combine: a line (b) cleared is class_ok regardless of what the judge said about it; a line
        // (b) could not clear keeps the judge's answer. slotAccepted then reads one boolean.
        const slots = ((v?.slots ?? {}) as Record<string, Record<string, unknown>>);
        for (const d of decs) {
          const entry = slots[d.field] ?? (slots[d.field] = {});
          entry.class_ok = fieldClassOk(d, entry.class_ok === true);
          if (!entry.class_ok && d.unsourced.length > 0) {
            entry.reason = `${String(entry.reason ?? "")} [class: unsourced specifics — ${d.unsourced.map((u) => u.token).join(", ")}]`.trim();
          }
        }
        return { ...v, slots };
      };

      let slotsForPrompt: Record<string, unknown> = {};
      let lastSlotClassDecisions: FieldClassDecision[] = [];
      let outcome;
      try {
        outcome = await runKind({ kind, payload, verbatimPaths, generate: async (mode, ctx) => {
          const out = await generate(mode, ctx);
          if (mode === "initial" || mode === "gate_retry") slotsForPrompt = out;
          return out;
        }, judge });
      } catch (e) {
        perKind[kind] = { status: "run_failed", detail: String(e).slice(0, 300) };
        await supabase.from("integrity_runs").insert({
          company_id, component: `first_read_slot_${kind}`, status: "rejected", examined: 1, admitted: 0,
          excluded_by_rule: { kind, guard: "run_failed", detail: String(e).slice(0, 300) }, error: String(e).slice(0, 300),
        });
        continue;
      }

      const slots = outcome.slots;
      const perSlot = outcome.per_slot;
      const allAccepted = outcome.ok;
      const verdict = outcome.verdict ?? {};

      perKind[kind] = {
        status: allAccepted ? (doStage ? "staged" : "accepted_dry_run")
                            : (outcome.violations.length > 0 ? "rejected_deterministic" : "rejected_judge"),
        source_read_id: src.id,
        // 1a-4 tightened: which branch decided each line's class, and the specifics (b) could not source
        class_decisions: lastSlotClassDecisions.map((d) => ({
          field: d.field, class: d.cls, branch: d.branch, examined: d.examined,
          unsourced: d.unsourced.map((u) => `${u.token} (${u.kind})`),
        })),
        lane: { generator: genChoice, judge: judgeChoice },
        caps: SLOT_CAPS[kind],
        generator_calls: outcome.generator_calls,
        retry_used_by: outcome.retry_used_by,
        retry_unavailable_reason: outcome.retry_unavailable_reason ?? null,
        attempts: outcome.attempts.map((a) => ({
          n: a.n, kind_of_attempt: a.kind_of_attempt, stage_reached: a.stage_reached,
          lengths: a.lengths,
          violations: a.violations,
          per_slot: a.per_slot.map((s) => ({ field: s.field, accepted: s.accepted, entailed: s.verdict?.entailed ?? null, vocab_ok: s.verdict?.vocab_ok ?? null, class_ok: s.verdict?.class_ok ?? null, category_sanity_ok: s.verdict?.category_sanity_ok ?? null, reason: s.accepted ? null : (s.verdict?.reason ?? null) })),
        })),
        slot_lengths: lengthsOf(kind, slots),
        violations: outcome.violations,
        slot_paths: slotFieldPaths(kind, slots).map((f) => ({ field: f, path: verbatimPaths.includes(f) ? "verbatim" : "generated" })),
        per_slot: perSlot,
      };

      await supabase.from("integrity_runs").insert({
        company_id, component: `first_read_slot_${kind}`, status: allAccepted ? "ok" : "rejected",
        examined: perSlot.length || 0, admitted: perSlot.filter((s) => s.accepted).length,
        surface_type: "public_reads", surface_id: src.id,
        excluded_by_rule: allAccepted ? {
          kind, paths: slotFieldPaths(kind, slots).map((f) => ({ field: f, path: verbatimPaths.includes(f) ? "verbatim" : "generated" })),
          generator_calls: outcome.generator_calls, retry_used_by: outcome.retry_used_by,
        } : {
          kind,
          paths: slotFieldPaths(kind, slots).map((f) => ({ field: f, path: verbatimPaths.includes(f) ? "verbatim" : "generated" })),
          guard: outcome.violations.length > 0 ? "deterministic_citation_or_cap" : "containment_judge",
          rejected: perSlot.filter((s) => !s.accepted).map((s) => s.field),
          generator_calls: outcome.generator_calls, retry_used_by: outcome.retry_used_by,
        },
      });

      if (allAccepted && doStage) {
        // STAGED, NOT CURRENT, UNSIGNED. Promotion is the operator's signing act (R1).
        const { data: ins, error: insErr } = await supabase.from("first_read_slots").insert({
          company_id, kind, slots,
          source_read_id: src.id,
          input_ledger: { source_read_id: src.id, source_fields: Object.keys(visible), caps: SLOT_CAPS[kind] },
          model_provider: genChoice.provider, model_name: genChoice.model,
          judge_model: judgeChoice.model, judge_verdict: verdict,
          is_current: false,
        }).select("id").single();
        if (insErr) throw new Error(`stage failed (${kind}): ${insErr.message}`);
        staged.push({ kind, id: String((ins as { id: string }).id) });
      }
    }

    // ── the model-call ledger (the same call site shape generate-public-read uses; recordModelCall
    //    never throws, so an accounting failure cannot take down the work it measures) ─────────────
    const cost = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) };
    if (usage.prompt_tokens || usage.completion_tokens) {
      await recordModelCall(supabase, {
        companyId: company_id,
        runId: null,
        callSite: "generate-read-slots",
        usage: openaiRecord(EXTERNAL_LEDGER_MODEL, usage),
      });
    }

    return json({ ok: true, dry_run: !doStage, per_kind: perKind, staged, cost });
  } catch (e) {
    return json({ error: String(e).slice(0, 500) }, 500);
  }
});



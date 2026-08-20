// First Read Gate 5 — the leave-behind serializer.
//
// A single PURE function that turns the SAME data the acts render from into a
// self-contained HTML artifact. It is not a parallel template: every
// include/withhold/lift/verdict decision routes through the SAME shared helpers
// the meeting screen uses —
//   * admitProposalBlock + REFUSED_BLOCK  (Act 5 render-time guard)
//   * checkItemAnnotation + CHECK_KIND_LABEL  (Act 3 verdict annotations)
//   * KIND_LABEL  (Act 2 finding kind labels)
// so the export cannot render a decision the screen didn't. Section order and
// honest-empty behavior mirror the meeting surfaces exactly.

import type { CheckItem, CaptureTally } from "@/hooks/useFirstReadCapture";
import type { Proposal } from "@/hooks/useFirstReadProposal";
import { admitProposalBlock, REFUSED_BLOCK, PLAN_HEADING } from "@/components/client-view/story/check/ProposalAct";
import { checkItemAnnotation, CHECK_KIND_LABEL, TALLY_SEGMENTS, NOT_IMPORTANT_NOTE } from "@/lib/firstRead/checkItemView";
import { KIND_LABEL, HERO_EMPTY } from "@/components/client-view/story/OutsideHeroAct";
import { GAP_EMPTY } from "@/components/client-view/story/GapAct";
import { setAsideGroupHeading } from "@/lib/firstRead/gapShrink";
import { STANDARD_ATTRIBUTION_LINE } from "@/lib/firstRead/standardCopy";
import { FR_EXPORT_ACTS } from "@/lib/firstRead/acts";
import { WHY_OUTSIDE_RATIONALE, JOURNEY_VISUAL_LABELS } from "@/lib/firstRead/whyOutside";
import { admitStatedProblem, statedProblemLabel } from "@/lib/firstRead/statedProblem";
import { outsideBand } from "@/lib/firstRead/outsideBands";
import { SAY_VS_SEE_GROUPS, SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE, SILENT_BRIDGE_NOTE } from "@/lib/firstRead/sayVsSee";
import { formatSourceAttribution } from "@/lib/firstRead/reportedDate";
import {
  CURATED_TENSION_HEADING, CURATED_TENSION_FRAMING, CURATED_TENSION_PROMISE_LABEL,
  CURATED_TENSION_DIFFICULTY_LABEL, CURATED_TENSION_CURATION_LINE, type CuratedTensionRender,
} from "@/lib/firstRead/curatedTension";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

export interface ExportStandardStep { step_number: number; step_label: string; description: string }
export interface ExportMirrorFinding { label: string; text: string }

export interface FirstReadExportData {
  company: { name: string };
  session: { id: string; date: string; presenter: string | null };
  // V2-2 / V2-3b Act 1 — the client's stated problem + which source/register fired.
  // verbatim=true → the declared brief rendered exactly (no distillation); verbatim=false
  // → the site-inferred model distillation (render-guarded, may carry a quote).
  statedProblem: { statement: string; verbatim: boolean; quote: string | null; register: string; descriptive_fallback: boolean } | null;
  standard: { label: string; taxonomyVersion: string | null; steps: ExportStandardStep[] } | null;
  mirror: {
    score: number | null;
    bet: ExportMirrorFinding | null;
    findings: ExportMirrorFinding[];
  };
  // V2-5 Act 3 "Message" band — how the public record describes the company
  // (public_observed claims, register-locked at the source). Empty → honest-absence.
  perception: string[];
  check: { items: CheckItem[]; tally: CaptureTally };
  // SELF-CONSISTENCY — the curated single-instance exhibit (Act 4, above say-vs-see).
  // null → the section is simply absent from the leave-behind (row-less / removed).
  curatedTension?: CuratedTensionRender | null;
  gap: string[]; // the ACTIVE open questions at issuance (V2-8: set-aside ones demoted out)
  gapSetAside?: string[]; // V2-8 — questions the client set aside, at issuance-time state
  proposal: Proposal | null;
  exportedAt: string;
}

// ── Fixed client-visible copy — OPERATOR-SIGNED 2026-07-23 (Gate 5). Section
//    titles reuse the signed act names. Honest-empty strings mirror the acts. ──
// The bet and gap empty lines are NOT restated here: they import from their act
// modules (HERO_EMPTY, GAP_EMPTY) so the export can never drift from the screen.
const T = {
  coverTitle: "First Read",
  // V2-10 audit: the old per-section titles (The Standard / The Mirror / The Check / The
  // Gap / The Proposal) were DEAD — section titles come from FR_EXPORT_ACTS (the v2 act
  // names) via buildFirstReadExportHtml. Removed to close the divergence risk.
  standardEmpty: "No industry-standard map matched this company's industry.",
  findingsEmpty: "Nothing else stood out from the outside read.",
  scoreLabel: "Mojo Score",
  scoreEmpty: "No score has been computed yet.",
  checkEmpty: "No items were put to the client.",
  proposalEmpty: "No proposal was generated for this session.",
  sayEmpty: "No problem is stated on this company's own public site.", // V2-2 — PENDING SIGNATURE
};

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function firstReadExportFilename(companyName: string, sessionDateIso: string): string {
  const slug = String(companyName || "company")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "company";
  let day = "undated";
  try {
    day = new Date(sessionDateIso).toISOString().slice(0, 10);
  } catch {
    /* keep undated */
  }
  return `first-read-${slug}-${day}.html`;
}

// ── Section renderers ────────────────────────────────────────────────────────

function sectionSay(d: FirstReadExportData): string {
  const sp = d.statedProblem;
  if (!sp) return `<p class="empty">${esc(T.sayEmpty)}</p>`;
  // provenance label — single-sourced with the screen (statedProblemLabel).
  const label = `<p class="source-label">${esc(statedProblemLabel(sp.register, sp.descriptive_fallback))}</p>`;

  // V2-3b DECLARED (verbatim): the client's own words, exactly, paragraph breaks
  // preserved (pre-wrap), no guard (it's their brief, not a model class), no quote.
  if (sp.verbatim) {
    return `<p class="std-label say-verbatim">${esc(sp.statement)}</p>${label}`;
  }

  // FALLBACK (site-inferred): the model distillation, render-guarded like the screen.
  if (!admitStatedProblem(sp.statement)) return `<p class="empty">${esc(T.sayEmpty)}</p>`;
  // The verbatim quote (if lifted) carries the SIGNED "As captured" label — single-sourced.
  const quoteHtml = sp.quote
    ? `<figure class="ann notimportant"><blockquote>“${esc(sp.quote)}”</blockquote><figcaption>${esc(AS_CAPTURED_LABEL)}</figcaption></figure>`
    : "";
  return `<p class="std-label">${esc(sp.statement)}</p>${label}${quoteHtml}`;
}

// V2-3 — Act 2. The leave-behind renders the SIGNED rationale (the substance) plus the
// journey as an honest TEXT sequence built from the SAME labels the screen SVG uses
// (JOURNEY_VISUAL_LABELS). The interactive SVG is intentionally NOT inlined here: its
// palette resolves against the .cvs-story theme vars, which don't exist in this
// light-only print doc — a text journey is the shape the leave-behind supports cleanly,
// and single-sources its words with the screen. This act carries no company data.
function sectionWhyOutside(_d: FirstReadExportData): string {
  const L = JOURNEY_VISUAL_LABELS;
  const stations = L.nodes
    .map((n) => `<li><span class="j-node">${esc(n.title)}</span><span class="j-sub">${esc(n.sub)}</span></li>`)
    .join("");
  const passes = [
    { h: L.beats.start, c: L.flows.forward },
    { h: L.beats.backward, c: L.flows.reverse },
    { h: L.beats.live, c: L.flows.monitor },
  ]
    .map((p) => `<div class="j-pass"><p class="kind">${esc(p.h)}</p><p class="j-cap">${esc(p.c)}</p></div>`)
    .join("");
  const rationale = WHY_OUTSIDE_RATIONALE.map(
    (b) => `<div class="why-block"><p class="why-q">${esc(b.q)}</p><p class="why-a">${esc(b.a)}</p></div>`,
  ).join("");
  return `<ol class="j-stations">${stations}</ol><div class="j-passes">${passes}</div><div class="why-rationale">${rationale}</div>`;
}

function sectionStandard(d: FirstReadExportData): string {
  const s = d.standard;
  if (!s || s.steps.length === 0) return `<p class="empty">${esc(T.standardEmpty)}</p>`;
  const steps = s.steps
    .map(
      (st) =>
        `<li><span class="num">${esc(st.step_number)}</span><div><p class="step-label">${esc(st.step_label)}</p><p class="step-desc">${esc(st.description)}</p></div></li>`,
    )
    .join("");
  // FR-ATTR — single-sourced with the screen (FrontDoorMapAct). Plain English, no
  // framework name, no internal tag; taxonomyVersion stays in the data as provenance
  // but is never printed on the client's leave-behind.
  const attribution = STANDARD_ATTRIBUTION_LINE;
  return `<p class="std-label">${esc(s.label)}</p><ol class="steps">${steps}</ol><p class="attribution">${esc(attribution)}</p>`;
}

function sectionMirror(d: FirstReadExportData): string {
  const { score, bet, findings } = d.mirror;
  const scoreHtml =
    score !== null
      ? `<div class="score"><p class="score-label">${esc(T.scoreLabel)}</p><p class="score-num">${esc(Math.round(score))}<span class="score-cap"> / 100</span></p></div>`
      : `<div class="score"><p class="score-label">${esc(T.scoreLabel)}</p><p class="empty">${esc(T.scoreEmpty)}</p></div>`;
  const betHtml = bet
    ? `<div class="bet"><p class="kind">${esc(bet.label)}</p><p class="bet-text">${esc(bet.text)}</p></div>`
    : `<p class="empty">${esc(HERO_EMPTY)}</p>`;
  const findingsHtml =
    findings.length > 0
      ? findings
          .map((f) => `<div class="finding"><p class="kind">${esc(f.label)}</p><p>${esc(f.text)}</p></div>`)
          .join("")
      : `<p class="empty">${esc(T.findingsEmpty)}</p>`;
  // V2-5 — the "Message" band: how the public record describes the company. Heading +
  // framing single-sourced with the screen (outsideBand); honest-absence when empty.
  const msg = outsideBand("message");
  const perceptionHtml = d.perception.length > 0
    ? `<ul class="say-verbatim-list">${d.perception.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
    : `<p class="empty">${esc(msg.empty)}</p>`;
  const messageBand = `<div class="ob-band"><p class="ob-heading">${esc(msg.heading)}</p><p class="ob-framing">${esc(msg.framing)}</p>${perceptionHtml}</div>`;
  return `${betHtml}${scoreHtml}<div class="findings">${findingsHtml}</div>${messageBand}`;
}

function sectionCheck(d: FirstReadExportData): string {
  const { items, tally } = d.check;
  // Single-sourced with the screen (CheckTally) via TALLY_SEGMENTS — same order,
  // same labels, incl. the fourth "set aside" segment.
  const tallyHtml = `<p class="tally">${TALLY_SEGMENTS.map((seg) => `<b>${tally[seg.key]}</b> ${seg.label}`).join(" · ")}</p>`;

  // V2-7 — the say-vs-see exhibit renders ABOVE the Check list, single-sourced with the
  // screen (SAY_VS_SEE_GROUPS + the same labels). Delta items partition out of the list.
  const deltaItems = items.filter((i) => i.kind === "delta" && i.delta);
  const checkOnly = items.filter((i) => i.kind !== "delta");
  const annFor = (item: CheckItem): string => {
    const ann = checkItemAnnotation(item);
    if (ann?.kind === "confirmed") return `<p class="ann confirmed">Confirmed by you · ${esc(ann.date)}</p>`;
    if (ann?.kind === "rejected") return `<p class="ann rejected">Rejected by the client · ${esc(ann.date)}</p>`;
    if (ann?.kind === "corrected") return `<p class="ann corrected">Corrected: “${esc(ann.text)}”</p>`;
    if (ann?.kind === "not_important") return `<p class="ann notimportant">${esc(NOT_IMPORTANT_NOTE)}${esc(ann.date)}</p>`;
    return "";
  };
  const exhibit = SAY_VS_SEE_GROUPS.map((g) => {
    const gi = deltaItems.filter((i) => i.delta!.deltaType === g.key);
    // PUBLIC-ONLY interim (2026-08-20, follows the screen): an empty say-anchored group
    // is NOT-COMPUTED until Gate B — no heading, no absence line, nothing.
    if (gi.length === 0) return "";
    const rowsHtml = gi.map((i) => {
      const dd = i.delta!;
      const silent = g.key === "publicly_silent" || !dd.see;
      const quoteHtml = dd.quote
        ? `<figure class="ann notimportant"><blockquote>“${esc(dd.quote)}”</blockquote><figcaption>${esc(AS_CAPTURED_LABEL)}${dd.eventDate ? ` · ${esc(dd.eventDate)}` : ""}</figcaption></figure>`
        : "";
      // Attribution line — follows the screen constant-for-constant (single-sourced formatter,
      // host+date from the same resolved signal). Overlap rule mirrored: only when no quote.
      const reported = dd.quote ? null : formatSourceAttribution(dd.sourceUrl, dd.reportedEventDate, dd.capturedAt);
      const reportedHtml = reported ? `<p class="ss-reported">${esc(reported)}</p>` : "";
      return `<div class="ss-item">`
        + `<div class="ss-side"><p class="kind">${esc(SAY_LABEL)}</p><p>${esc(dd.say)}</p></div>`
        + `<div class="ss-side"><p class="kind">${esc(SEE_LABEL)}</p><p${silent ? ' class="empty"' : ""}>${esc(silent ? SILENT_SEE_LINE : dd.see)}</p>${quoteHtml}${reportedHtml}</div>`
        + `${annFor(i)}</div>`;
    }).join("");
    const bridge = g.key === "publicly_silent" ? `<p class="ss-bridge">${esc(SILENT_BRIDGE_NOTE)}</p>` : "";
    return `<div class="ss-group"><p class="ss-head">${esc(g.heading)}</p>${rowsHtml}${bridge}</div>`;
  }).join("");
  const exhibitHtml = `<div class="ss-exhibit">${exhibit}</div>`;

  // SELF-CONSISTENCY — the curated exhibit follows the screen constant-for-constant, ABOVE
  // say-vs-see. Quote-less by nature; the difficulty side's source-host line comes through the
  // SAME formatter. Absent (empty string) when there is no live curated row.
  const ct: CuratedTensionRender | null = d.curatedTension ?? null;
  const ctAttribution = ct ? formatSourceAttribution(ct.difficultySourceUrl, ct.difficultyEventDate, ct.difficultyCapturedAt) : null;
  const curatedHtml = ct
    ? `<section class="ct-exhibit">`
      + `<p class="ct-head">${esc(CURATED_TENSION_HEADING)}</p>`
      + `<p class="ct-framing">${esc(CURATED_TENSION_FRAMING)}</p>`
      + `<div class="ct-pair">`
      + `<div class="ct-side"><p class="kind">${esc(CURATED_TENSION_PROMISE_LABEL)}</p><p>${esc(ct.promiseText)}</p></div>`
      + `<div class="ct-side"><p class="kind">${esc(CURATED_TENSION_DIFFICULTY_LABEL)}</p><p>${esc(ct.difficultyText)}</p>`
      + `${ctAttribution ? `<p class="ct-attribution">${esc(ctAttribution)}</p>` : ""}</div>`
      + `</div>`
      + `<p class="ct-curation">${esc(CURATED_TENSION_CURATION_LINE)}</p>`
      + `</section>`
    : "";

  if (checkOnly.length === 0) return `${tallyHtml}${curatedHtml}${exhibitHtml}<p class="empty">${esc(T.checkEmpty)}</p>`;
  const rows = checkOnly
    .map((item) => {
      const ann = checkItemAnnotation(item);
      let annHtml = "";
      if (ann?.kind === "confirmed") {
        const band = ann.bandLabel ? `<span class="band">${esc(ann.bandLabel)}</span> — ` : "";
        annHtml = `<p class="ann confirmed">${band}Confirmed by you · ${esc(ann.date)}</p>`;
      } else if (ann?.kind === "rejected") {
        annHtml = `<p class="ann rejected">Rejected by the client · ${esc(ann.date)}</p>`;
      } else if (ann?.kind === "corrected") {
        annHtml = `<p class="ann corrected">Corrected: “${esc(ann.text)}”</p>`;
      } else if (ann?.kind === "not_important") {
        annHtml = `<p class="ann notimportant">${esc(NOT_IMPORTANT_NOTE)}${esc(ann.date)}</p>`;
      }
      const cls = ann?.kind === "rejected" ? "item is-rejected"
        : ann?.kind === "confirmed" ? "item is-confirmed"
        : ann?.kind === "not_important" ? "item is-notimportant"
        : "item";
      return `<div class="${cls}"><p class="kind">${esc(CHECK_KIND_LABEL[item.kind])}</p><p class="item-text">${esc(item.text)}</p>${annHtml}</div>`;
    })
    .join("");
  return `${tallyHtml}${curatedHtml}${exhibitHtml}<div class="check-list">${rows}</div>`;
}

function sectionGap(d: FirstReadExportData): string {
  const setAside = d.gapSetAside ?? [];
  // V2-8 — the leave-behind reflects the issuance-time shrink: active questions render as
  // the list; set-aside ones are demoted to a labeled group (never dropped), single-sourced
  // with the screen's heading.
  const demotedHtml = setAside.length > 0
    ? `<div class="gap-setaside"><p class="gap-setaside-head">${esc(setAsideGroupHeading(setAside.length))}</p><ul class="gap-setaside-list">${setAside.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>`
    : "";
  if (d.gap.length === 0) {
    const emptyHtml = `<p class="empty">${esc(GAP_EMPTY)}</p>`;
    return `${emptyHtml}${demotedHtml}`;
  }
  const items = d.gap.map((q, i) => `<li><span class="num">${i + 1}</span><span>${esc(q)}</span></li>`).join("");
  return `<ol class="gap-list">${items}</ol>${demotedHtml}`;
}

function sectionProposal(d: FirstReadExportData): string {
  const p = d.proposal;
  if (!p || p.status !== "generated") return `<p class="empty">${esc(T.proposalEmpty)}</p>`;
  const headlineOk =
    !!p.headline &&
    admitProposalBlock({ key: "headline", heading: "", body: p.headline, sources: p.headline_sources ?? {} });
  const headline = headlineOk ? `<h2 class="proposal-headline">${esc(p.headline)}</h2>` : "";
  const blocks = (p.blocks ?? [])
    .map((b) =>
      admitProposalBlock(b)
        ? `<div class="proposal-block"><p class="kind">${esc(b.heading)}</p><p>${esc(b.body)}</p></div>`
        : `<p class="withheld">${esc(REFUSED_BLOCK)}</p>`,
    )
    .join("");
  // V2-9 — THE PLAN: grounded staged deliverables, single-sourced with the screen. Omitted
  // when there is no groundable plan (never fabricated).
  const plan = p.plan ?? [];
  const planHtml = plan.length > 0
    ? `<div class="plan"><p class="kind">${esc(PLAN_HEADING)}</p><ol class="plan-list">${plan.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ol></div>`
    : "";
  // V2-9 SWEEP: no model name in the leave-behind copy.
  const meta = `<p class="proposal-meta">Generated ${esc(p.generated_at ? fmtDateTime(p.generated_at) : "")}</p>`;
  return `${headline}${blocks}${planHtml}${meta}`;
}

// ── The document ─────────────────────────────────────────────────────────────

const STYLE = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#141210;background:#fbfaf7;line-height:1.55;font-size:15px}
.wrap{max-width:720px;margin:0 auto;padding:48px 28px 80px}
.cover{border-bottom:1px solid rgba(17,17,17,.12);padding-bottom:24px;margin-bottom:36px}
.cover .title{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9a7b3e;margin:0 0 8px}
.cover .company{font-size:30px;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}
.cover .meta{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b5f4f;margin:0}
section{margin:0 0 40px}
h1.sec{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9a7b3e;margin:0 0 16px;padding-bottom:6px;border-bottom:1px solid rgba(17,17,17,.08)}
.kind{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.5;margin:0 0 5px}
.empty{color:#8a7f6d;font-style:italic;margin:0}
.steps{list-style:none;padding:0;margin:0}
.steps li{display:flex;gap:12px;margin:0 0 12px}
.steps .num{font-family:ui-monospace,Menlo,monospace;opacity:.4;min-width:18px}
.step-label{font-weight:600;margin:0}
.step-desc{margin:2px 0 0;color:#5f5443;font-size:14px}
.attribution{font-family:ui-monospace,Menlo,monospace;font-size:10px;opacity:.5;margin:16px 0 0}
.std-label{font-weight:600;margin:0 0 12px}
.bet .bet-text{font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.01em;margin:0 0 20px}
.score{border:1px solid rgba(17,17,17,.12);border-radius:8px;padding:14px 18px;display:inline-block;margin:0 0 24px}
.score-label{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin:0 0 4px}
.score-num{font-size:34px;font-weight:700;margin:0}
.score-cap{font-size:14px;font-weight:400;opacity:.5}
.finding{margin:0 0 16px}
.check-list,.findings{display:flex;flex-direction:column;gap:14px}
.item{border:1px solid rgba(17,17,17,.12);border-radius:8px;padding:14px 16px}
.item.is-confirmed{border-color:rgba(31,122,77,.5)}
.item.is-rejected{opacity:.82}
.item.is-notimportant{border-color:rgba(120,113,108,.35)}
.item-text{margin:0 0 8px}
.ann{margin:8px 0 0;font-size:13px}
.ann .band{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#1f7a4d;border:1px solid rgba(31,122,77,.45);border-radius:3px;padding:2px 7px}
.ann.confirmed{color:#3c3327}
.ann.rejected{font-style:italic;opacity:.7}
.ann.corrected{color:#c0451a}
.ann.notimportant{font-style:italic;color:#57534e;opacity:.85}
.tally{font-family:ui-monospace,Menlo,monospace;font-size:13px;margin:0 0 18px}
.gap-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px}
.gap-list li{display:flex;gap:12px;align-items:baseline}
.gap-setaside{margin:18px 0 0}
.gap-setaside-head{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin:0 0 6px}
.gap-setaside-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px;opacity:.6}
.gap-list .num{font-family:ui-monospace,Menlo,monospace;font-size:11px;opacity:.5;min-width:18px}
.proposal-headline{font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.01em;margin:0 0 22px}
.proposal-block{margin:0 0 20px}
.plan{margin:0 0 20px}
.plan-list{list-style:decimal;padding-left:20px;margin:8px 0 0;display:flex;flex-direction:column;gap:6px}
.proposal-block p:last-child{margin:0;white-space:pre-wrap}
.withheld{font-style:italic;opacity:.6;margin:0 0 20px}
.proposal-meta{font-family:ui-monospace,Menlo,monospace;font-size:10px;opacity:.5;margin:22px 0 0}
.j-stations{list-style:none;padding:0;margin:0 0 22px;display:flex;flex-direction:column;gap:10px}
.j-stations li{display:flex;flex-direction:column;gap:2px}
.j-node{font-weight:600}
.j-sub{color:#5f5443;font-size:13px}
.say-verbatim{white-space:pre-wrap}
.ss-exhibit{margin:0 0 22px}
.ss-group{margin:0 0 20px}
.ss-head{font-weight:600;font-size:15px;margin:0 0 10px}
.ss-item{padding:12px 0;border-top:1px solid rgba(17,17,17,.08);display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ss-item:first-of-type{border-top:none}
.ss-item .ann{grid-column:1 / -1}
.ss-side p:last-child{margin:4px 0 0}
.ss-bridge{font-family:ui-monospace,Menlo,monospace;font-size:10px;opacity:.55;margin:8px 0 0}
.ss-reported{color:#5f5443;font-size:12px;margin:6px 0 0}
.ct-exhibit{margin:0 0 22px;padding:14px 16px;border:1px solid rgba(17,17,17,.12);border-radius:8px}
.ct-head{font-weight:600;font-size:16px;margin:0 0 4px}
.ct-framing{color:#5f5443;font-size:13px;margin:0 0 14px}
.ct-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ct-side .kind{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.6;margin:0 0 4px}
.ct-side p:last-child{margin:4px 0 0}
.ct-attribution{color:#5f5443;font-size:12px;margin:6px 0 0}
.ct-curation{color:#5f5443;font-size:12px;font-style:italic;margin:12px 0 0}
.ob-band{margin:24px 0 0;padding-top:18px;border-top:1px solid rgba(17,17,17,.08)}
.ob-heading{font-weight:600;font-size:16px;margin:0 0 3px}
.ob-framing{color:#5f5443;font-size:13px;margin:0 0 12px}
.say-verbatim-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:9px}
.say-verbatim-list li{color:#3c3327}
.j-passes{display:flex;flex-direction:column;gap:14px;margin:0 0 26px}
.j-pass .j-cap{margin:0;color:#3c3327}
.why-block{margin:0 0 18px}
.why-q{font-weight:600;margin:0 0 5px}
.why-a{margin:0;color:#3c3327}
footer{border-top:1px solid rgba(17,17,17,.12);margin-top:48px;padding-top:16px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#8a7f6d}
@media print{body{background:#fff}.wrap{padding:0}section{page-break-inside:avoid}}
`;

export function buildFirstReadExportHtml(d: FirstReadExportData): string {
  const cover = `<header class="cover"><p class="title">${esc(T.coverTitle)}</p><p class="company">${esc(d.company.name)}</p><p class="meta">${esc(d.session.date)}${d.session.presenter ? ` · ${esc(d.session.presenter)}` : ""}</p></header>`;
  const sec = (title: string, body: string) => `<section><h1 class="sec">${esc(title)}</h1>${body}</section>`;
  // V2-10 audit: the raw session id (machinery/internal) is out of the client leave-behind.
  const footer = `<footer>Exported ${esc(fmtDateTime(d.exportedAt))}</footer>`;

  // FR-V2-1 / V2-3 — the leave-behind follows the v2 act order + titles from the SAME
  // source as the rail (FR_EXPORT_ACTS), so screen and export can't diverge. Every act
  // now carries substance (no placeholders remain). Act 2 renders the signed rationale +
  // a text journey; Act 5 ("How We Can Help") folds the job map + Gap + Proposal.
  const sectionByKey: Record<string, (d: FirstReadExportData) => string> = {
    say: sectionSay,
    why_outside: sectionWhyOutside,
    outside_shows: sectionMirror,
    check: sectionCheck,
    help: (dd) => `${sectionStandard(dd)}${sectionGap(dd)}${sectionProposal(dd)}`,
  };
  const body = [
    cover,
    ...FR_EXPORT_ACTS.map((a) => sec(a.title, (sectionByKey[a.key] ?? (() => ""))(d))),
    footer,
  ].join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(T.coverTitle)} — ${esc(d.company.name)}</title><style>${STYLE}</style></head><body><div class="wrap">${body}</div></body></html>`;
}

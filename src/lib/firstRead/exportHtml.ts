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
import { admitProposalBlock, REFUSED_BLOCK } from "@/components/client-view/story/check/ProposalAct";
import { checkItemAnnotation, CHECK_KIND_LABEL, TALLY_SEGMENTS, NOT_IMPORTANT_NOTE } from "@/lib/firstRead/checkItemView";
import { KIND_LABEL, HERO_EMPTY } from "@/components/client-view/story/OutsideHeroAct";
import { GAP_EMPTY } from "@/components/client-view/story/GapAct";
import { STANDARD_ATTRIBUTION_LINE } from "@/lib/firstRead/standardCopy";
import { FR_EXPORT_ACTS } from "@/lib/firstRead/acts";
import { admitStatedProblem } from "@/lib/firstRead/statedProblem";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

export interface ExportStandardStep { step_number: number; step_label: string; description: string }
export interface ExportMirrorFinding { label: string; text: string }

export interface FirstReadExportData {
  company: { name: string };
  session: { id: string; date: string; presenter: string | null };
  // V2-2 Act 1 — the client's stated problem (client_voice own-domain distillation).
  statedProblem: { statement: string; quote: string | null } | null;
  standard: { label: string; taxonomyVersion: string | null; steps: ExportStandardStep[] } | null;
  mirror: {
    score: number | null;
    bet: ExportMirrorFinding | null;
    findings: ExportMirrorFinding[];
  };
  check: { items: CheckItem[]; tally: CaptureTally };
  gap: string[];
  proposal: Proposal | null;
  exportedAt: string;
}

// ── Fixed client-visible copy — OPERATOR-SIGNED 2026-07-23 (Gate 5). Section
//    titles reuse the signed act names. Honest-empty strings mirror the acts. ──
// The bet and gap empty lines are NOT restated here: they import from their act
// modules (HERO_EMPTY, GAP_EMPTY) so the export can never drift from the screen.
const T = {
  coverTitle: "First Read",
  standard: "The Standard",
  mirror: "The Mirror",
  check: "The Check",
  gap: "The Gap",
  proposal: "The Proposal",
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
  if (!sp || !admitStatedProblem(sp.statement)) return `<p class="empty">${esc(T.sayEmpty)}</p>`;
  // The verbatim quote (if lifted) carries the SIGNED "As captured" label — single-sourced.
  const quoteHtml = sp.quote
    ? `<figure class="ann notimportant"><blockquote>“${esc(sp.quote)}”</blockquote><figcaption>${esc(AS_CAPTURED_LABEL)}</figcaption></figure>`
    : "";
  return `<p class="std-label">${esc(sp.statement)}</p>${quoteHtml}`;
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
  return `${betHtml}${scoreHtml}<div class="findings">${findingsHtml}</div>`;
}

function sectionCheck(d: FirstReadExportData): string {
  const { items, tally } = d.check;
  // Single-sourced with the screen (CheckTally) via TALLY_SEGMENTS — same order,
  // same labels, incl. the fourth "set aside" segment.
  const tallyHtml = `<p class="tally">${TALLY_SEGMENTS.map((seg) => `<b>${tally[seg.key]}</b> ${seg.label}`).join(" · ")}</p>`;
  if (items.length === 0) return `${tallyHtml}<p class="empty">${esc(T.checkEmpty)}</p>`;
  const rows = items
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
  return `${tallyHtml}<div class="check-list">${rows}</div>`;
}

function sectionGap(d: FirstReadExportData): string {
  if (d.gap.length === 0) return `<p class="empty">${esc(GAP_EMPTY)}</p>`;
  const items = d.gap.map((q, i) => `<li><span class="num">${i + 1}</span><span>${esc(q)}</span></li>`).join("");
  return `<ol class="gap-list">${items}</ol>`;
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
  const meta = `<p class="proposal-meta">Generated ${esc(p.generated_at ? fmtDateTime(p.generated_at) : "")} · ${esc(p.trace?.model ?? "model")}</p>`;
  return `${headline}${blocks}${meta}`;
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
.gap-list .num{font-family:ui-monospace,Menlo,monospace;font-size:11px;opacity:.5;min-width:18px}
.proposal-headline{font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.01em;margin:0 0 22px}
.proposal-block{margin:0 0 20px}
.proposal-block p:last-child{margin:0;white-space:pre-wrap}
.withheld{font-style:italic;opacity:.6;border-left:2px solid rgba(180,83,9,.5);padding-left:10px;margin:0 0 20px}
.proposal-meta{font-family:ui-monospace,Menlo,monospace;font-size:10px;opacity:.5;margin:22px 0 0}
footer{border-top:1px solid rgba(17,17,17,.12);margin-top:48px;padding-top:16px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#8a7f6d}
@media print{body{background:#fff}.wrap{padding:0}section{page-break-inside:avoid}}
`;

export function buildFirstReadExportHtml(d: FirstReadExportData): string {
  const cover = `<header class="cover"><p class="title">${esc(T.coverTitle)}</p><p class="company">${esc(d.company.name)}</p><p class="meta">${esc(d.session.date)}${d.session.presenter ? ` · ${esc(d.session.presenter)}` : ""}</p></header>`;
  const sec = (title: string, body: string) => `<section><h1 class="sec">${esc(title)}</h1>${body}</section>`;
  const footer = `<footer>Session ${esc(d.session.id)} · Exported ${esc(fmtDateTime(d.exportedAt))}</footer>`;

  // FR-V2-1 — the leave-behind follows the v2 act order + titles from the SAME source
  // as the rail (FR_EXPORT_ACTS), so screen and export can't diverge. The two
  // placeholder acts carry no substance and are OMITTED (a leave-behind of real
  // content only). Act 5 ("How We Can Help") folds the job map + Gap + Proposal.
  const sectionByKey: Record<string, (d: FirstReadExportData) => string> = {
    say: sectionSay,
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

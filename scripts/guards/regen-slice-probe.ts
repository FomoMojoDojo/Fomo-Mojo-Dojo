// R31 probe — three fixtures through admitOutsideEvidence (deterministic, no model, no db):
//   newline_bytes_equal  the stored excerpt equals the page slice at (offset, length) when the model copy crossed a newline
//   nbsp_bytes_equal     same, with a no-break space in the page
//   founders_sentences   "…radiologists Dr. A. Alexander and Dr. Brian Tsui…" counts as ONE sentence (expected 1)
//   bare_code            "Geniant Chairman and Co-CEO David Lancashire said." → e2_bare_attribution
// Plants: P1 store the model copy → newline_bytes_equal false; P2 drop "Dr." → founders_sentences 2; P3 drop the refusal → bare_code admitted.
import { admitOutsideEvidence } from "../../supabase/functions/_shared/outsideEvidenceRegen.ts";
import { splitSentences } from "../../src/lib/evidenceMappers.ts";
const PAGE_NL = "Benefits\nCoreViva’s approach is built around patient needs, offering a unique set of benefits:\nDirect Consultation: Patients receive a 1:1 consultation with a board-certified radiologist to review scan results.\nRapid Results";
const COPY_NL = "CoreViva’s approach is built around patient needs, offering a unique set of benefits: Direct Consultation: Patients receive a 1:1 consultation with a board-certified radiologist to review scan results.";
const PAGE_NBSP = "Plan\nWith support from the Foundation, the department is also expanding screening initiatives, including whole-body MRI screenings for personnel with  CoreViva .\nNext";
const COPY_NBSP = "With support from the Foundation, the department is also expanding screening initiatives, including whole-body MRI screenings for personnel with CoreViva .";
const FOUNDERS = "CoreViva, founded by radiologists Dr. A. Alexander and Dr. Brian Tsui, officially opened its flagship clinic in Newport Beach this month.";
const BARE = "Geniant Chairman and Co-CEO David Lancashire said.";
const eq = (copy: string, page: string) => { const r = admitOutsideEvidence(copy, page); return r.admit ? page.slice(r.offset, r.offset + r.length) === r.excerpt && r.excerpt !== copy : `refused:${r.reason}`; };
const bare = admitOutsideEvidence(BARE, `${BARE}\nMore text here.`);
console.log(JSON.stringify({ newline_bytes_equal: eq(COPY_NL, PAGE_NL), nbsp_bytes_equal: eq(COPY_NBSP, PAGE_NBSP), founders_sentences: splitSentences(FOUNDERS).length, bare_code: bare.admit ? "admitted" : bare.reason }));

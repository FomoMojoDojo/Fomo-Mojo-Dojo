import { useState, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import TopNav from '@/components/layout/TopNav';

/* ── Palette from MapView ── */
const c = {
  bg: '#faf7f6',
  field: '#ffffff',
  card: '#ffffff',
  line: '#DDE6D1',
  lineFaint: '#EEF3E9',
  charcoal: '#233C4B',
  secondary: '#46606D',
  muted: '#6E847F',
  faint: '#C8D8CA',
  coral: '#FF7D2D',
  teal: '#5F9B8C',
  amber: '#FAC846',
};

/* ── Step data ── */
interface Step {
  id: string | number;
  label: string;
  phase: string;
  r: number;
  cx: number;
  cy: number;
  source: string;
  detail: string;
}

/* Scale factor: original r ranges 20-58, we want min ~55, max ~100 */
const SCALE = 1.65;
const X_SCALE = 1.4;
const Y_SCALE = 1.6;
const X_CENTER = 600;
const SVG_WIDTH = 1680;

function sx(cx: number) { return X_CENTER + (cx - 600) * X_SCALE; }
function sy(cy: number) { return cy * Y_SCALE + 80; }
function sr(r: number) { return Math.max(55, r * SCALE); }

const rawSteps: (Omit<Step, 'cx' | 'cy' | 'r'> & { _r: number; _cx: number; _cy: number })[] = [
  { id:1, label:'Customer\nInitial Quiz', phase:'system', _r:28, _cx:600, _cy:60, source:'Core Workflow', detail:'Customer fills out the intake quiz on the website, providing company name and URL. This single action triggers the entire automated workflow.' },
  { id:2, label:'Create\nPrivate Folder', phase:'system', _r:20, _cx:600, _cy:155, source:'Core Workflow', detail:'AI agent creates a structured private client folder. All data, transcripts, maps, and documents live here throughout the engagement.' },
  { id:3, label:'AI Web Search:\nPublic Docs', phase:'diagnosis', _r:36, _cx:600, _cy:255, source:'Core Workflow', detail:'Deep web search for all publicly available information: website, annual reports, press releases, news, financial filings, social profiles, job postings, and reviews.' },
  { id:'D1', label:'Competitive\nAlternatives Audit', phase:'positioning', _r:44, _cx:600, _cy:370, source:'April Dunford — Obviously Awesome', detail:'Identify what customers are actually doing instead of using this product/service. Foundation of all positioning work.' },
  { id:4, label:'Initial Mojo Map\nScoring (DFF)', phase:'diagnosis', _r:52, _cx:600, _cy:490, source:'Core Workflow + DFF Framework', detail:'All public data run through the DFF framework. All 12 factors scored with confidence flags. v1.0 map created.' },
  { id:'ODI1', label:'Define\nJob Performer', phase:'odi', _r:36, _cx:600, _cy:600, source:'ODI — Tony Ulwick (Step 1)', detail:'Explicitly define WHO performs the core job. Distinguish the job performer from the buyer, influencer, and end beneficiary.' },
  { id:'ODI2', label:'Core Functional\nJob Statement', phase:'odi', _r:40, _cx:600, _cy:710, source:'ODI — Tony Ulwick (Step 1)', detail:'Write the core functional job as: Verb + Object of Control + Clarifier. Must be solution-agnostic and stable over time.' },
  { id:'ODI3', label:'Build Job Map\n(8-12 Steps)', phase:'odi', _r:48, _cx:600, _cy:830, source:'ODI — Tony Ulwick (Step 2)', detail:'Deconstruct the core job into 8-12 universal job steps: Define → Locate → Prepare → Confirm → Execute → Monitor → Modify → Conclude.' },
  { id:'ODI4', label:'Consumption Chain\n+ Emotional Jobs', phase:'odi', _r:40, _cx:600, _cy:950, source:'ODI — Tony Ulwick (Step 3)', detail:'Identify all related jobs beyond the core functional job including Purchase, Learn-to-use, Maintain, Repair, and Dispose jobs. Also Emotional and Social jobs.' },
  { id:'D2', label:'Winning\nAspiration', phase:'cascade', _r:40, _cx:600, _cy:1060, source:'Roger Martin — Playing to Win', detail:'Define what "winning" looks like for this organization. A specific, inspiring picture of success.' },
  { id:'D3', label:'Bright Spots\nAnalysis', phase:'diagnosis', _r:36, _cx:600, _cy:1165, source:'Heath Brothers — Switch', detail:'Find what is already working. Identify the bright spots and understand why, so they can be amplified.' },
  { id:'D5', label:'Hero + Problem\nDefinition', phase:'messaging', _r:42, _cx:600, _cy:1275, source:'Donald Miller — StoryBrand', detail:'Define the Hero (customer) and the 3-level Problem: External, Internal, and Philosophical.' },
  { id:5, label:'Question List\n+ Doc Needs', phase:'diagnosis', _r:30, _cx:600, _cy:1375, source:'Core Workflow', detail:'AI generates a prioritized list of questions from low-confidence DFF factors and a list of documents needed.' },
  { id:6, label:'Alert Partners:\nNew Map', phase:'system', _r:22, _cx:600, _cy:1460, source:'Core Workflow', detail:'Automated alert sent to all partners notifying them of the new client and Mojo Map.' },
  { id:'G1', label:'Partner Review\n& Quality Check', phase:'gate', _r:40, _cx:600, _cy:1560, source:'Core Workflow', detail:'DECISION GATE: Partners review the initial map and scoring. Go/No-Go decision.' },
  { id:7, label:'Initial Fit\nMeeting', phase:'diagnosis', _r:46, _cx:400, _cy:1700, source:'Core Workflow', detail:'Discovery meeting with the prospective client. Recorded and transcribed.' },
  { id:8, label:'Transcript →\nSMART Framework', phase:'diagnosis', _r:42, _cx:800, _cy:1700, source:'Core Workflow', detail:'Meeting transcript processed through the SMART framework to extract Goals, Metrics, Timelines, and Accountability.' },
  { id:'8a', label:'Transcript →\nODI Needs Capture', phase:'odi', _r:44, _cx:800, _cy:1820, source:'Core Workflow + ODI', detail:'Transcript processed to capture raw needs, wants, and desires for ODI outcome statements.' },
  { id:'D6', label:'Six Questions\nDecision Audit', phase:'diagnosis', _r:34, _cx:400, _cy:1820, source:'Heath Brothers', detail:'Run initial findings through the Six Questions framework to surface hidden assumptions.' },
  { id:9, label:'Draft Approach:\nSOW + Pricing', phase:'focus', _r:48, _cx:600, _cy:1950, source:'Core Workflow', detail:'AI generates a draft approach document: key next steps, recommended pricing, draft Statement of Work.' },
  { id:'G2', label:'Client Reviews\nSOW', phase:'gate', _r:36, _cx:600, _cy:2060, source:'Core Workflow', detail:'DECISION GATE: Client reviews the SOW, pricing, and proposed approach. Go/no-go moment.' },
  { id:10, label:'Contract + NDA\nSigned', phase:'client', _r:34, _cx:400, _cy:2170, source:'Core Workflow', detail:'CLIENT ACTION: Client signs the contract, NDA, and all required agreements.' },
  { id:'10b', label:'Initial Payment\nReceived', phase:'client', _r:30, _cx:800, _cy:2170, source:'Core Workflow', detail:'CLIENT ACTION: Initial payment is processed.' },
  { id:11, label:'Client Uploads\nDocuments', phase:'client', _r:28, _cx:600, _cy:2275, source:'Core Workflow', detail:'CLIENT ACTION: Client uploads all requested internal documents to their secure folder.' },
  { id:12, label:'Kick-Off Meeting\nCaptured', phase:'diagnosis', _r:44, _cx:600, _cy:2380, source:'Core Workflow', detail:'Formal kick-off meeting with the full client team. Recorded and transcribed.' },
  { id:'D7', label:'Where to Play\n& How to Win', phase:'cascade', _r:50, _cx:600, _cy:2505, source:'Roger Martin — Playing to Win', detail:'Define the two most critical strategic choices: Where to Play and How to Win.' },
  { id:13, label:'Stakeholder &\nCustomer Interviews', phase:'diagnosis', _r:56, _cx:600, _cy:2645, source:'Core Workflow + Torres CDH', detail:'MOST SIGNIFICANT STEP: Structured interviews with key internal stakeholders and external customers.' },
  { id:'ODI5', label:'Capture Outcome\nStatements', phase:'odi', _r:52, _cx:600, _cy:2785, source:'ODI — Tony Ulwick (Step 4)', detail:'Convert all raw needs from interviews into properly formatted outcome statements.' },
  { id:'ODI6', label:'Organize + Validate\nOutcomes', phase:'odi', _r:44, _cx:600, _cy:2910, source:'ODI — Tony Ulwick (Step 5)', detail:'Group outcome statements by job step. Remove duplicates. Validate solution-agnosticism.' },
  { id:'ODI7', label:'Outcome Statement\nValidation Workshop', phase:'odi', _r:42, _cx:600, _cy:3030, source:'ODI — Internal Quality Gate', detail:'Internal workshop to review, challenge, and finalize the outcome statement list.' },
  { id:'D8', label:'Unique Attributes\nIsolation', phase:'positioning', _r:44, _cx:600, _cy:3150, source:'April Dunford — Obviously Awesome', detail:'Isolate the unique attributes and capabilities that competitors cannot easily replicate.' },
  { id:'ODI8', label:'Design ODI Survey\n(Imp + Sat)', phase:'odi', _r:46, _cx:600, _cy:3270, source:'ODI — Tony Ulwick (Step 6)', detail:'Build the ODI survey. Each outcome rated on Importance and Satisfaction. Min 180 respondents.' },
  { id:14, label:'Create & Distribute\nODI Survey', phase:'diagnosis', _r:40, _cx:600, _cy:3385, source:'Core Workflow + ODI', detail:'ODI survey finalized and distributed to the target population.' },
  { id:'14c', label:'Collect Survey\nResponses', phase:'system', _r:22, _cx:600, _cy:3475, source:'Core Workflow', detail:'Survey responses collected and aggregated. System monitors response rates.' },
  { id:'G3', label:'Data Quality\nCheck', phase:'gate', _r:36, _cx:600, _cy:3565, source:'Core Workflow', detail:'DECISION GATE: Survey data assessed for quality and completeness. Min 180 responses required.' },
  { id:'ODI9', label:'Calculate\nOpportunity Scores', phase:'odi', _r:48, _cx:600, _cy:3680, source:'ODI — Tony Ulwick (Step 8)', detail:'Apply the Ulwick Opportunity Score formula. Scores range 0-20. Above 10 = high-opportunity.' },
  { id:'ODI10', label:'Segment Market\nby Outcomes', phase:'odi', _r:50, _cx:600, _cy:3810, source:'ODI — Tony Ulwick (Step 9)', detail:'Use outcome data to find natural customer segments with unique underserved outcomes.' },
  { id:'ODI11', label:'Opportunity\nLandscape Map', phase:'odi', _r:48, _cx:600, _cy:3940, source:'ODI — Tony Ulwick (Step 10)', detail:'Plot all outcomes on a 2x2 matrix of Importance vs. Satisfaction.' },
  { id:15, label:'Analyze Survey Data\n+ Update Map', phase:'focus', _r:48, _cx:600, _cy:4070, source:'Core Workflow + ODI', detail:'All ODI scores, segments, and opportunity landscape data integrated into the Mojo Map.' },
  { id:'ODI12', label:'Select\nInnovation Strategy', phase:'odi', _r:46, _cx:600, _cy:4195, source:'ODI — Tony Ulwick (Step 10)', detail:'Choose the innovation strategy: Differentiated, Dominant, Disruptive, or Discrete.' },
  { id:'F1', label:'Strategic Options\n+ What Must Be True', phase:'focus', _r:54, _cx:600, _cy:4330, source:'Roger Martin — What Must Be True', detail:'Generate 2-4 distinct strategic options. List conditions that must be true for each to succeed.' },
  { id:'F2', label:'Capabilities &\nSystems Audit', phase:'cascade', _r:46, _cx:600, _cy:4460, source:'Roger Martin — Playing to Win', detail:'Audit the capabilities and management systems needed to execute the chosen strategy.' },
  { id:'F3', label:'Assumption\nMapping', phase:'focus', _r:42, _cx:600, _cy:4580, source:'Teresa Torres — CDH', detail:'Map all underlying assumptions. Categorize by desirability, viability, and feasibility.' },
  { id:'ODI13', label:'Generate\nSolution Concepts', phase:'odi', _r:48, _cx:600, _cy:4705, source:'ODI — Tony Ulwick (Step 10)', detail:'Generate solution concepts addressing the highest-opportunity outcomes.' },
  { id:'F4', label:'Market Frame\nof Reference', phase:'positioning', _r:40, _cx:600, _cy:4825, source:'April Dunford — Obviously Awesome', detail:'Decide which market category to compete in. Sets customer expectations.' },
  { id:'F5', label:'Critical Moves\n& Destination', phase:'focus', _r:44, _cx:600, _cy:4940, source:'Heath Brothers — Switch', detail:'Script the 1-3 specific behavior changes required. Create a vivid destination postcard.' },
  { id:'F6', label:'STEPPS\nVirality Audit', phase:'focus', _r:42, _cx:600, _cy:5055, source:'Jonah Berger — Contagious', detail:'Audit through the STEPPS lens: Social Currency, Triggers, Emotion, Public, Practical Value, Stories.' },
  { id:'F7', label:'Sticky Message\nAudit (SUCCESs)', phase:'messaging', _r:40, _cx:600, _cy:5170, source:'Heath Brothers — Made to Stick', detail:'Audit: Simple? Unexpected? Concrete? Credible? Emotional? Story?' },
  { id:16, label:'Prioritization\nWorkshop', phase:'focus', _r:54, _cx:600, _cy:5300, source:'Core Workflow', detail:'Facilitated workshop to synthesize all ODI scores, strategic options, and WMBT analysis.' },
  { id:'ODI14', label:'Validate\nSolution Concepts', phase:'odi', _r:44, _cx:600, _cy:5425, source:'ODI — Tony Ulwick', detail:'Test solution concepts with the target segment to confirm they address unmet outcomes.' },
  { id:'F8', label:'Positioning\nStatement Draft', phase:'positioning', _r:46, _cx:600, _cy:5550, source:'April Dunford — Obviously Awesome', detail:'Draft the formal positioning statement grounded in validated ODI outcomes.' },
  { id:17, label:'Final Synthesis:\nOpportunity Map', phase:'focus', _r:58, _cx:600, _cy:5690, source:'Core Workflow + ODI + Torres CDH', detail:'MOST COMPLEX STEP: All data synthesized into the complete Opportunity/Solution Map.' },
  { id:'F9', label:'Strategy Cascade\nCoherence Check', phase:'cascade', _r:44, _cx:600, _cy:5830, source:'Roger Martin — Playing to Win', detail:'Validate that all 5 strategic choices reinforce each other.' },
  { id:'L1', label:'BrandScript\n& Messaging Guide', phase:'messaging', _r:50, _cx:600, _cy:5970, source:'Donald Miller — StoryBrand', detail:'Build the full BrandScript: Hero, Problem, Guide, Plan, Call to Action, Failure, Success.' },
  { id:18, label:'Deliver Final\nMojo Map', phase:'flow', _r:52, _cx:600, _cy:6110, source:'Core Workflow', detail:'The completed Mojo Map is delivered — a living, interactive HTML map.' },
  { id:'L2', label:'Internal Positioning\nSocialization', phase:'positioning', _r:38, _cx:600, _cy:6225, source:'April Dunford — Obviously Awesome', detail:'Facilitate internal workshops to socialize the new positioning across the organization.' },
  { id:'L3', label:'Apply Messaging\nto Website + Comms', phase:'messaging', _r:44, _cx:600, _cy:6345, source:'Donald Miller — StoryBrand', detail:'Apply the BrandScript to the website header, one-liner, lead generator, and email nurture sequence.' },
  { id:'L4', label:'Experiment Design\n& WMBT Tests', phase:'flow', _r:46, _cx:600, _cy:6470, source:'Torres CDH + Roger Martin', detail:'Design the smallest possible tests to validate the most fragile assumptions.' },
  { id:'L5', label:'Small Wins\n& Habit Design', phase:'flow', _r:38, _cx:600, _cy:6580, source:'Heath Brothers — Switch', detail:'Break the strategic goal into small wins that generate momentum.' },
  { id:19, label:'Ongoing Support\n& Guidance', phase:'flow', _r:44, _cx:600, _cy:6690, source:'Core Workflow', detail:'FLOW PHASE: Client executes their strategy with FomoMojoDojo guidance.' },
  { id:'L6', label:'Weekly Customer\nInterview Cadence', phase:'flow', _r:40, _cx:600, _cy:6800, source:'Teresa Torres — CDH', detail:'Establish an ongoing weekly cadence of at least one customer interview per week.' },
  { id:'L7', label:'Build-Measure\n-Learn Loop', phase:'flow', _r:42, _cx:600, _cy:6915, source:'Teresa Torres — CDH', detail:'Establish the continuous discovery loop: Build, Measure, Learn.' },
  { id:'G4', label:'End of\nEngagement?', phase:'gate', _r:34, _cx:600, _cy:7045, source:'Core Workflow', detail:'DECISION GATE: Is the engagement complete? Archive or continue.' },
  { id:20, label:'Archive or\nClose Map', phase:'system', _r:24, _cx:400, _cy:7170, source:'Core Workflow', detail:'Map is archived. Client folder preserved and can be reactivated.' },
  { id:21, label:'Continue:\nUpdate Map', phase:'flow', _r:30, _cx:800, _cy:7170, source:'Core Workflow', detail:'Map is updated with new information, scores, and priorities. Cycle repeats.' },
];

const steps: Step[] = rawSteps.map(s => ({
  ...s,
  cx: sx(s._cx),
  cy: sy(s._cy),
  r: sr(s._r),
}));

const connections: [string | number, string | number][] = [
  [1,2],[2,3],[3,'D1'],['D1',4],[4,'ODI1'],['ODI1','ODI2'],['ODI2','ODI3'],['ODI3','ODI4'],
  ['ODI4','D2'],['D2','D3'],['D3','D5'],['D5',5],[5,6],[6,'G1'],
  ['G1',7],['G1',8],
  [7,'D6'],[8,'8a'],
  ['D6',9],['8a',9],
  [9,'G2'],['G2',10],['G2','10b'],
  [10,11],['10b',11],
  [11,12],[12,'D7'],['D7',13],[13,'ODI5'],['ODI5','ODI6'],['ODI6','ODI7'],['ODI7','D8'],
  ['D8','ODI8'],['ODI8',14],[14,'14c'],['14c','G3'],
  ['G3','ODI9'],['ODI9','ODI10'],['ODI10','ODI11'],['ODI11',15],[15,'ODI12'],
  ['ODI12','F1'],['F1','F2'],['F2','F3'],['F3','ODI13'],['ODI13','F4'],['F4','F5'],['F5','F6'],['F6','F7'],['F7',16],
  [16,'ODI14'],['ODI14','F8'],['F8',17],[17,'F9'],
  ['F9','L1'],['L1',18],[18,'L2'],['L2','L3'],['L3','L4'],['L4','L5'],['L5',19],[19,'L6'],['L6','L7'],['L7','G4'],
  ['G4',20],['G4',21],
];

/* ── Phase colors — warm palette matching MapView ── */
const phaseColors: Record<string, string> = {
  diagnosis:   '#233C4B',
  focus:       c.amber,
  flow:        c.teal,
  gate:        c.coral,
  client:      '#A0C382',
  system:      c.muted,
  positioning: '#FAC846',
  cascade:     '#FF7D2D',
  messaging:   '#5F9B8C',
  odi:         '#A0C382',
};

const phaseLabels: Record<string, string> = {
  diagnosis: 'Diagnosis', focus: 'Focus', flow: 'Flow', gate: 'Decision Gate',
  client: 'Client Action', system: 'System', positioning: 'Positioning',
  cascade: 'Strategy Cascade', messaging: 'Messaging', odi: 'ODI Process',
};

const phaseBands = [
  { label: 'DIAGNOSIS — INTAKE', yStart: 0, yEnd: 1600 },
  { label: 'DIAGNOSIS — INITIAL MEETING', yStart: 1600, yEnd: 2250 },
  { label: 'DIAGNOSIS — DEEP DISCOVERY', yStart: 2250, yEnd: 3600 },
  { label: 'FOCUS — SYNTHESIS & STRATEGY', yStart: 3600, yEnd: 5700 },
  { label: 'FLOW — DELIVERY & EXECUTION', yStart: 5700, yEnd: 7300 },
];

const sizeKey = [
  { label: 'Simple', r: 20 },
  { label: 'Moderate', r: 30 },
  { label: 'Significant', r: 42 },
  { label: 'Complex', r: 56 },
];

const SVG_HEIGHT = sy(7300);

const cardStyle = {
  background: c.card,
  borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  border: `1px solid ${c.line}`,
} as const;

export default function MojoMapPage() {
  const [tooltip, setTooltip] = useState<{ step: Step; x: number; y: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stepMap = useMemo(() => {
    const m: Record<string, Step> = {};
    steps.forEach((s) => { m[String(s.id)] = s; });
    return m;
  }, []);

  const handleMouseEnter = useCallback((step: Step, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ step, x: e.clientX - rect.left, y: e.clientY - rect.top });
    setHoveredId(step.id);
  }, []);

  const handleMouseMove = useCallback((step: Step, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ step, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredId(null);
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />
      <main className="max-w-content mx-auto py-7 px-4 sm:px-6 md:px-9 pb-12">
        {/* Breadcrumb */}
        <div className="mb-5">
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.08em] hover:opacity-70 transition-opacity" style={{ color: c.muted }}>
            Map View
          </Link>
          <span className="font-mono text-[11px] mx-2" style={{ color: c.faint }}>›</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
            MojoMap™ Process
          </span>
        </div>

        {/* Header card */}
        <div className="overflow-hidden mb-6" style={cardStyle}>
          <div className="p-6 sm:p-8">
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: c.coral }}>Complete Process Map</span>
            <h1 className="font-sans text-[28px] sm:text-[34px] font-bold tracking-tight mt-2" style={{ color: c.charcoal }}>
              MojoMap™ Workflow v3
            </h1>
            <p className="font-sans text-[14px] leading-[1.65] mt-2 max-w-xl" style={{ color: c.secondary }}>
              All steps across Diagnosis · Focus · Flow — including the full ODI process. Hover any circle for details.
            </p>
          </div>
        </div>

        {/* Legend bar */}
        <div className="overflow-hidden mb-6 p-5 flex flex-wrap gap-6 items-start" style={{ ...cardStyle }}>
          <div className="flex-1 min-w-[280px]">
            <p className="font-sans text-[9px] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: c.muted }}>Phase Legend</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.entries(phaseLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: phaseColors[key] }} />
                  <span className="font-sans text-[11px]" style={{ color: c.secondary }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-sans text-[9px] font-bold uppercase tracking-[0.1em] mb-3" style={{ color: c.muted }}>Complexity</p>
            <div className="flex items-end gap-4">
              {sizeKey.map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <div className="rounded-full" style={{ width: sr(s.r) * 0.4, height: sr(s.r) * 0.4, background: c.lineFaint, border: `1px solid ${c.line}` }} />
                  <span className="font-mono text-[9px]" style={{ color: c.muted }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recessed field for map */}
        <div
          ref={containerRef}
          className="rounded-2xl relative"
          style={{
            background: c.field,
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full"
            style={{ display: 'block' }}
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c.faint} />
              </marker>
              <filter id="bubble-shadow">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.12)" />
              </filter>
            </defs>

            {/* Grid pattern */}
            <defs>
              <pattern id="grid-mojo" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke={c.line} strokeWidth="0.5" opacity="0.6" />
              </pattern>
            </defs>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#grid-mojo)" opacity="0.3" />

            {/* Phase bands */}
            {phaseBands.map((band, i) => {
              const bandYStart = sy(band.yStart);
              const bandYEnd = sy(band.yEnd);
              return (
                <g key={band.label}>
                  {i % 2 === 0 && (
                    <rect x={0} y={bandYStart} width={SVG_WIDTH} height={bandYEnd - bandYStart} fill="rgba(0,0,0,0.015)" />
                  )}
                  <text
                    x={50} y={bandYStart + 40}
                    fill={c.muted}
                    fontSize={14}
                    fontFamily="system-ui, sans-serif"
                    fontWeight="700"
                    letterSpacing="0.12em"
                    opacity="0.5"
                  >
                    {band.label}
                  </text>
                  <line x1={50} y1={bandYStart + 50} x2={350} y2={bandYStart + 50} stroke={c.line} strokeWidth={1} opacity="0.5" />
                </g>
              );
            })}

            {/* Connection lines */}
            {connections.map(([fromId, toId], i) => {
              const from = stepMap[String(fromId)];
              const to = stepMap[String(toId)];
              if (!from || !to) return null;
              const dx = to.cx - from.cx;
              const dy = to.cy - from.cy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist === 0) return null;
              const nx = dx / dist;
              const ny = dy / dist;
              const x1 = from.cx + nx * from.r;
              const y1 = from.cy + ny * from.r;
              const x2 = to.cx - nx * to.r;
              const y2 = to.cy - ny * to.r;
              const midX = (x1 + x2) / 2 + (Math.abs(dx) > 80 ? (dx > 0 ? -40 : 40) : 0);
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                  fill="none"
                  stroke={c.faint}
                  strokeWidth={2}
                  strokeOpacity={0.5}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            {/* Circles */}
            {steps.map((step) => {
              const color = phaseColors[step.phase] || c.muted;
              const isGate = step.phase === 'gate';
              const isHovered = hoveredId === step.id;
              const lines = step.label.split('\n');
              const fontSize = Math.max(12, Math.min(16, step.r * 0.2));
              return (
                <g
                  key={String(step.id)}
                  onMouseEnter={(e) => handleMouseEnter(step, e)}
                  onMouseMove={(e) => handleMouseMove(step, e)}
                  onMouseLeave={handleMouseLeave}
                  style={{ cursor: 'pointer', opacity: hoveredId === null || isHovered ? 1 : 0.45, transition: 'opacity 0.2s' }}
                  filter="url(#bubble-shadow)"
                >
                  <circle
                    cx={step.cx} cy={step.cy} r={step.r}
                    fill={c.card}
                    stroke={color}
                    strokeWidth={isGate ? 4 : isHovered ? 3.5 : 2.5}
                  />
                  {isHovered && (
                    <circle
                      cx={step.cx} cy={step.cy} r={step.r + 6}
                      fill="none"
                      stroke={color}
                      strokeOpacity={0.3}
                      strokeWidth={3}
                    />
                  )}
                  {/* Colored accent dot at top */}
                  <circle cx={step.cx} cy={step.cy - step.r + 12} r={5} fill={color} />
                  {lines.map((line, li) => (
                    <text
                      key={li}
                      x={step.cx}
                      y={step.cy + (li - (lines.length - 1) / 2) * (fontSize + 3) + 4}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={c.charcoal}
                      fontSize={fontSize}
                      fontFamily="system-ui, sans-serif"
                      fontWeight={600}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed pointer-events-none z-50"
              style={{
                left: tooltip.x + (containerRef.current?.getBoundingClientRect().left ?? 0) + 20,
                top: tooltip.y + (containerRef.current?.getBoundingClientRect().top ?? 0) - 10,
                transform: 'translateY(-100%)',
              }}
            >
              <div className="rounded-xl p-4 shadow-xl max-w-[320px]" style={{ ...cardStyle, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
                <p className="font-sans font-bold text-[15px] leading-tight mb-2" style={{ color: c.charcoal }}>
                  {tooltip.step.label.replace(/\n/g, ' ')}
                </p>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold"
                    style={{ background: phaseColors[tooltip.step.phase] + '18', color: phaseColors[tooltip.step.phase] }}
                  >
                    {phaseLabels[tooltip.step.phase]}
                  </span>
                  <span className="font-mono text-[9px] px-2 py-0.5 rounded-full" style={{ background: c.lineFaint, color: c.muted }}>
                    {tooltip.step.source}
                  </span>
                </div>
                <p className="font-sans text-[12px] leading-[1.7]" style={{ color: c.secondary }}>{tooltip.step.detail}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

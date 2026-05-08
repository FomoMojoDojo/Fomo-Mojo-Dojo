import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ProposalConfidence = 'high' | 'medium' | 'low';

export interface CandidateNeed {
  desired_outcome: string;
  importance?: number;
  satisfaction?: number;
  customer_validated?: boolean;
  evidence?: string;
  confidence?: ProposalConfidence;
}

export interface FrameworkFinding {
  claim: string;
  evidence: string;
  confidence: ProposalConfidence;
  mojo_area: string;
  suggested_update: string;
  risk_if_ignored: string;
}

export interface FrameworkResult {
  framework: string;
  findings: FrameworkFinding[];
}

export interface CandidatePositioningUpdate {
  field: 'target_customer' | 'category' | 'alternatives' | 'unique_attributes' | 'value' | 'proof';
  current_issue: string;
  suggested_update: string;
  evidence: string;
  confidence: ProposalConfidence;
}

export interface CandidateJobStep {
  step_label: string;
  step_description: string;
  evidence: string;
  confidence: ProposalConfidence;
}

export interface CandidateOutcome {
  outcome: string;
  related_opportunities: string[];
  evidence: string;
  confidence: ProposalConfidence;
}

export interface PossibleRoute {
  title: string;
  why_this_could_matter: string;
  linked_opportunity: string;
  evidence: string;
  confidence: ProposalConfidence;
}

export interface ExperimentToRun {
  experiment: string;
  what_it_tests: string;
  evidence: string;
}

export interface ProposalContradiction {
  claim: string;
  conflicts_with: string;
  evidence: string;
}

export interface FileProposalRow {
  id: string;
  company_id: string;
  file_id: string;
  file_name: string;
  source_type: string;
  summary: string;
  evidence: string[];
  signal_type: string;
  framework_results: FrameworkResult[];
  suggested_areas: string[];
  candidate_positioning_updates: CandidatePositioningUpdate[];
  candidate_job_steps: CandidateJobStep[];
  candidate_needs: CandidateNeed[];
  candidate_outcomes: CandidateOutcome[];
  possible_gaps: string[];
  possible_routes: PossibleRoute[];
  experiments_to_run: ExperimentToRun[];
  contradictions: ProposalContradiction[];
  confidence: ProposalConfidence;
  confidence_reason: string;
  questions_to_verify: string[];
  status: 'pending' | 'accepted' | 'rejected';
  processing_state: 'queued' | 'running' | 'ready' | 'failed';
  processing_error: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  applied_areas: string[];
  created_at: string;
  reviewed_at: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => asString(item).trim())
    .filter((s) => Boolean(s) && s !== '[object Object]');
}

function asConfidence(value: unknown): ProposalConfidence {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function normalizeFrameworkFinding(value: unknown): FrameworkFinding | null {
  const record = asRecord(value);
  if (!record) return null;
  const claim = asString(record.claim).trim();
  if (!claim) return null;
  return {
    claim,
    evidence: asString(record.evidence).trim(),
    confidence: asConfidence(record.confidence),
    mojo_area: asString(record.mojo_area).trim(),
    suggested_update: asString(record.suggested_update).trim(),
    risk_if_ignored: asString(record.risk_if_ignored).trim(),
  };
}

function normalizeFrameworkResult(value: unknown): FrameworkResult | null {
  const record = asRecord(value);
  if (!record) return null;
  const framework = asString(record.framework).trim();
  if (!framework) return null;

  // Handle { framework, result } shape returned by current Dify workflow
  if (typeof record.result === "string" && record.result.trim()) {
    return {
      framework,
      findings: [{
        claim: record.result.trim(),
        evidence: "",
        confidence: "medium" as const,
        mojo_area: "",
        suggested_update: "",
        risk_if_ignored: "",
      }],
    };
  }

  return {
    framework,
    findings: asArray(record.findings)
      .map((item) => normalizeFrameworkFinding(item))
      .filter((item): item is FrameworkFinding => !!item),
  };
}

function normalizeNeed(value: unknown): CandidateNeed | null {
  const record = asRecord(value);
  if (!record) return null;
  const desiredOutcome = asString(record.desired_outcome).trim();
  if (!desiredOutcome) return null;
  return {
    desired_outcome: desiredOutcome,
    importance: typeof record.importance === 'number' ? record.importance : undefined,
    satisfaction: typeof record.satisfaction === 'number' ? record.satisfaction : undefined,
    customer_validated: typeof record.customer_validated === 'boolean' ? record.customer_validated : undefined,
    evidence: asString(record.evidence).trim() || undefined,
    confidence: record.confidence ? asConfidence(record.confidence) : undefined,
  };
}

function normalizePositioningUpdate(value: unknown): CandidatePositioningUpdate | null {
  const record = asRecord(value);
  if (!record) return null;
  const field = asString(record.field).trim() as CandidatePositioningUpdate['field'];
  const suggestedUpdate = asString(record.suggested_update).trim();
  if (!field || !suggestedUpdate) return null;
  return {
    field,
    current_issue: asString(record.current_issue).trim(),
    suggested_update: suggestedUpdate,
    evidence: asString(record.evidence).trim(),
    confidence: asConfidence(record.confidence),
  };
}

function normalizeJobStep(value: unknown): CandidateJobStep | null {
  const record = asRecord(value);
  if (!record) return null;
  const stepLabel = asString(record.step_label).trim();
  if (!stepLabel) return null;
  return {
    step_label: stepLabel,
    step_description: asString(record.step_description).trim(),
    evidence: asString(record.evidence).trim(),
    confidence: asConfidence(record.confidence),
  };
}

function normalizeOutcome(value: unknown): CandidateOutcome | null {
  const record = asRecord(value);
  if (!record) return null;
  const outcome = asString(record.outcome).trim();
  if (!outcome) return null;
  return {
    outcome,
    related_opportunities: asStringArray(record.related_opportunities),
    evidence: asString(record.evidence).trim(),
    confidence: asConfidence(record.confidence),
  };
}

function normalizeRoute(value: unknown): PossibleRoute | null {
  if (typeof value === 'string') {
    const title = value.trim();
    return title
      ? { title, why_this_could_matter: '', linked_opportunity: '', evidence: '', confidence: 'low' }
      : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.title).trim();
  if (!title) return null;
  return {
    title,
    why_this_could_matter: asString(record.why_this_could_matter).trim(),
    linked_opportunity: asString(record.linked_opportunity).trim(),
    evidence: asString(record.evidence).trim(),
    confidence: asConfidence(record.confidence),
  };
}

function normalizeExperiment(value: unknown): ExperimentToRun | null {
  const record = asRecord(value);
  if (!record) return null;
  const experiment = asString(record.experiment).trim();
  if (!experiment) return null;
  return {
    experiment,
    what_it_tests: asString(record.what_it_tests).trim(),
    evidence: asString(record.evidence).trim(),
  };
}

function normalizeContradiction(value: unknown): ProposalContradiction | null {
  if (typeof value === 'string') {
    const claim = value.trim();
    if (!claim || claim === '[object Object]') return null;
    return { claim, conflicts_with: '', evidence: '' };
  }
  const record = asRecord(value);
  if (!record) return null;
  const claim = asString(record.claim).trim();
  if (!claim || claim === '[object Object]') return null;
  return {
    claim,
    conflicts_with: asString(record.conflicts_with).trim(),
    evidence: asString(record.evidence).trim(),
  };
}

function normalizeProposal(row: Record<string, unknown>): FileProposalRow {
  return {
    ...(row as unknown as Omit<FileProposalRow,
      | 'evidence'
      | 'framework_results'
      | 'suggested_areas'
      | 'candidate_positioning_updates'
      | 'candidate_job_steps'
      | 'candidate_needs'
      | 'candidate_outcomes'
      | 'possible_gaps'
      | 'possible_routes'
      | 'experiments_to_run'
      | 'contradictions'
      | 'questions_to_verify'
      | 'confidence'
      | 'confidence_reason'
    >),
    evidence: asStringArray(row.evidence),
    framework_results: asArray(row.framework_results)
      .map((item) => normalizeFrameworkResult(item))
      .filter((item): item is FrameworkResult => !!item),
    suggested_areas: asStringArray(row.suggested_areas),
    candidate_positioning_updates: asArray(row.candidate_positioning_updates)
      .map((item) => normalizePositioningUpdate(item))
      .filter((item): item is CandidatePositioningUpdate => !!item),
    candidate_job_steps: asArray(row.candidate_job_steps)
      .map((item) => normalizeJobStep(item))
      .filter((item): item is CandidateJobStep => !!item),
    candidate_needs: asArray(row.candidate_needs)
      .map((item) => normalizeNeed(item))
      .filter((item): item is CandidateNeed => !!item),
    candidate_outcomes: asArray(row.candidate_outcomes)
      .map((item) => normalizeOutcome(item))
      .filter((item): item is CandidateOutcome => !!item),
    possible_gaps: asStringArray(row.possible_gaps),
    possible_routes: asArray(row.possible_routes)
      .map((item) => normalizeRoute(item))
      .filter((item): item is PossibleRoute => !!item),
    experiments_to_run: asArray(row.experiments_to_run)
      .map((item) => normalizeExperiment(item))
      .filter((item): item is ExperimentToRun => !!item),
    contradictions: asArray(row.contradictions)
      .map((item) => normalizeContradiction(item))
      .filter((item): item is ProposalContradiction => !!item),
    confidence: asConfidence(row.confidence),
    confidence_reason: asString(row.confidence_reason),
    questions_to_verify: asStringArray(row.questions_to_verify),
  };
}

// Fetches pending and accepted proposals for a company's files.
// Rejected proposals are excluded — they remain in the DB but never surface
// in the UI or affect scoring.
export function useFileProposals(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['file-proposals', companyId],
    queryFn: async (): Promise<FileProposalRow[]> => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('file_proposals')
        .select('*')
        .eq('company_id', companyId)
        .neq('status', 'rejected')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => normalizeProposal(row as Record<string, unknown>));
    },
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as FileProposalRow[];
      return rows.some((row) => row.processing_state === 'queued' || row.processing_state === 'running')
        ? 5000
        : false;
    },
    enabled: !!companyId,
  });
}

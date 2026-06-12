export interface ClientData {
  company_name: string;
  quarter: string;
  tier: number;
  archetype: string;
  last_updated: string;
}

export interface ClientNavConfig {
  show_job_steps: boolean;
  show_strategy: boolean;
  show_opps_map: boolean;
  show_positioning: boolean;
  show_analytics: boolean;
}

export interface ClientSummary {
  mojo_score: number;
  score_delta: number;
  potential_score: number;
  key_insights: { headline: string; detail: string }[];
  next_move: string;
  next_move_deadline: string;
  next_move_effort: string;
  constraint_area: string;
  constraint_explanation: string;
}

export interface ScoreArea {
  area_key: string;
  area_label: string;
  layer: number;
  score: number;
  trend: 'up' | 'down' | 'flat';
  status_note: string;
  ceiling: number | null;
}

export interface Milestone {
  id: string;
  sort_order: number;
  title: string;
  description: string;
  status: 'done' | 'current' | 'upcoming';
}

export interface Opportunity {
  id: string;
  area_key: string;
  sort_order: number;
  title: string;
  description: string;
  pts_value: number;
  effort: 'low' | 'medium' | 'high';
  type: 'Fix' | 'Improve' | 'Create';
}

export interface InputItem {
  id: string;
  input_key: string;
  input_label: string;
  group_key: 'foundation' | 'execution' | 'market_evidence';
  group_label: string;
  sub_group: string;
  completeness: number;
  status: 'complete' | 'partial' | 'gap' | 'not_started';
  score_impact: number;
  impact_tier: 'high' | 'med' | 'low' | 'done';
  description: string;
  why_it_matters: string;
  subitems: InputSubitem[];
  files: InputFile[];
}

export interface InputSubitem {
  id: string;
  sort_order: number;
  name: string;
  done: boolean;
}

export interface InputFile {
  id: string;
  file_name: string;
  file_type: string;
  file_url: string;
  tags: string[];
  uploaded_at?: string;
}

export interface DeepDive {
  area_key: string;
  why_it_matters: string;
  what_we_found: string;
  what_good_looks_like: string;
  path_forward: PathStep[];
  holding_back: GapItem[];
  generated_at?: string | null;
  updated_at?: string | null;
}

export interface PathStep {
  step: string;
  duration: string;
  owner: string;
  impact_pts: number;
  action_label?: string;
}

export interface GapItem {
  gap: string;
  description: string;
}

// === Extended Views ===

export interface JobStep {
  step_number: number;
  step_label: string;
  description: string;
  designed: boolean;
  has_gap: boolean;
  gap_note?: string;
  outcomes: JobStepOutcome[];
}

export interface JobStepOutcome {
  id: string;
  outcome: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  priority: 'focus' | 'monitor' | 'defer';
}

export interface StrategyCascade {
  winning_aspiration: string;
  where_to_play: string;
  how_to_win: string;
  capabilities: CascadeItem[];
  management_systems: CascadeItem[];
  assumptions: CascadeAssumption[];
}

export interface CascadeItem {
  name: string;
  status: 'strong' | 'developing' | 'gap';
  note?: string;
  evidence?: string;
  unverified?: boolean;
}

export interface CascadeAssumption {
  assumption: string;
  tested: boolean;
  outcome?: string;
  note?: string;
}

export interface OpportunityOutcome {
  id: string;
  outcome: string;
  step_number: number;
  step_label: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  priority_tier: 'focus' | 'monitor' | 'defer';
}

export interface PositioningCanvas {
  competitive_alternatives: PositioningItem[];
  unique_attributes: PositioningItem[];
  value_for_customer: string;
  best_fit_customers: string;
  market_category: string;
  category_rationale: string;
  current_tagline: string;
  proposed_tagline: string;
  frameworks_used?: string[];
  // A68 strategy-alignment evaluation
  strategy_alignment?: "aligned" | "off_strategy" | "unknown" | null;
  strategy_alignment_reason?: string | null;
  strategy_alignment_evaluated_at?: string | null;
  // Acknowledged serious negatives from the outside voice (acknowledge-and-scope shape)
  known_tensions?: KnownTension[];
}

export interface KnownTension {
  title: string;
  what_we_see: string;
  what_it_is: string;
  what_it_isnt: string;
  resolution_condition: string;
}

export interface PositioningItem {
  id: string;
  name: string;
  description: string;
  highlighted?: boolean;
  // Verified provenance of the claim (unique attributes): corroborated by independent
  // evidence, the company's own claim not yet echoed outside, or a declared-direction
  // claim (Gate 3b — cites no public sources by definition). Absent on items that
  // predate verification and on operator-added items.
  evidence_status?: "corroborated" | "self_reported" | "declared";
  basis_urls?: string[];
}

export interface ScoreHistoryPoint {
  recorded_at: string;
  mojo_score: number;
  area_scores: Record<string, number>;
  input_complete_count: number;
}

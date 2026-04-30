export type WorkshopTab = "positioning" | "jobmap" | "strategy" | "jtbd" | "needs" | "council";

export type ActiveCheckpoint = {
  journeyKey: string;
  stepNum: number;
  stepLabel: string;
  jobStepId: string;
} | null;
export type SignalStage = "outside" | "org" | "customer";
export type GapAlignment = "aligned" | "drift" | "gap" | "missing";

export interface ExclusionControls {
  isExcluded: (fp: string) => boolean;
  excludeSignal: (fp: string, reason?: string) => Promise<void>;
  restoreSignal: (fp: string) => Promise<void>;
}

export interface BaselineVoiceSignal {
  perspective?: string;
  source_type?: string;
  signal?: string;
  sentiment?: string;
  alignment?: string;
  url?: string;
  confidence?: number;
}

export interface BaselineEvidenceItem {
  bucket?: string;
  signal_strength?: string;
  confidence?: number;
  snippet?: string;
  url?: string;
}

export interface BaselineResult {
  status?: string;
  category_archetype?: string;
  lens_card?: {
    economic_engine?: string;
    primary_buyer?: string;
    chooser?: string;
    user?: string;
  };
  evidence_ledger?: BaselineEvidenceItem[];
  top_hypotheses?: string[];
  open_questions?: string[];
  message_alignment?: {
    company_claim_posture?: string;
    outside_voice_posture?: string;
    alignment_status?: string;
    alignment_summary?: string;
  };
  outside_voice_signals?: BaselineVoiceSignal[];
}

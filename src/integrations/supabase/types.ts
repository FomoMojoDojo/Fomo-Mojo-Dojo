export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_flow_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          flow_type: string | null
          id: string
          input_json: Json
          mode: string
          selected_context_mode: string | null
          status: string
          summary_json: Json
          trigger: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          flow_type?: string | null
          id?: string
          input_json?: Json
          mode?: string
          selected_context_mode?: string | null
          status?: string
          summary_json?: Json
          trigger?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          flow_type?: string | null
          id?: string
          input_json?: Json
          mode?: string
          selected_context_mode?: string | null
          status?: string
          summary_json?: Json
          trigger?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_flow_stage_runs: {
        Row: {
          company_id: string
          created_at: string
          duration_ms: number | null
          error_text: string
          finished_at: string | null
          id: string
          input_json: Json
          output_json: Json
          run_id: string
          stage_key: string
          stage_order: number
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_ms?: number | null
          error_text?: string
          finished_at?: string | null
          id?: string
          input_json?: Json
          output_json?: Json
          run_id: string
          stage_key: string
          stage_order?: number
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          error_text?: string
          finished_at?: string | null
          id?: string
          input_json?: Json
          output_json?: Json
          run_id?: string
          stage_key?: string
          stage_order?: number
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_flow_stage_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_flow_stage_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          object_id: string
          object_type: string
          snapshot: Json
          source_event_id: string | null
          source_run_id: string | null
          version_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          object_id: string
          object_type: string
          snapshot: Json
          source_event_id?: string | null
          source_run_id?: string | null
          version_number: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          object_id?: string
          object_type?: string
          snapshot?: Json
          source_event_id?: string | null
          source_run_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_versions_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "strategic_events"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_contest_removals: {
        Row: {
          claim_id: string | null
          claim_identity: string
          company_id: string
          contest_id: string
          contest_kind: string
          id: string
          reason: string
          removed_at: string
          resolution: string | null
          session_id: string
        }
        Insert: {
          claim_id?: string | null
          claim_identity: string
          company_id: string
          contest_id: string
          contest_kind: string
          id?: string
          reason: string
          removed_at?: string
          resolution?: string | null
          session_id: string
        }
        Update: {
          claim_id?: string | null
          claim_identity?: string
          company_id?: string
          contest_id?: string
          contest_kind?: string
          id?: string
          reason?: string
          removed_at?: string
          resolution?: string | null
          session_id?: string
        }
        Relationships: []
      }
      claim_contests: {
        Row: {
          claim_id: string
          claim_identity: string
          company_id: string
          contest_kind: string
          created_at: string
          id: string
          rationale: string | null
          resolution: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          source: string
        }
        Insert: {
          claim_id: string
          claim_identity: string
          company_id: string
          contest_kind: string
          created_at?: string
          id?: string
          rationale?: string | null
          resolution?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          source?: string
        }
        Update: {
          claim_id?: string
          claim_identity?: string
          company_id?: string
          contest_kind?: string
          created_at?: string
          id?: string
          rationale?: string | null
          resolution?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_contests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_contests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "first_read_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_delta_rejection_removals: {
        Row: {
          company_id: string
          content_identity: string
          declared_claim_id: string | null
          id: string
          public_claim_id: string | null
          reason: string
          rejected_by: string | null
          removed_at: string
        }
        Insert: {
          company_id: string
          content_identity: string
          declared_claim_id?: string | null
          id?: string
          public_claim_id?: string | null
          reason: string
          rejected_by?: string | null
          removed_at?: string
        }
        Update: {
          company_id?: string
          content_identity?: string
          declared_claim_id?: string | null
          id?: string
          public_claim_id?: string | null
          reason?: string
          rejected_by?: string | null
          removed_at?: string
        }
        Relationships: []
      }
      claim_delta_rejections: {
        Row: {
          company_id: string
          computed_at: string
          content_identity: string
          declared_claim_id: string
          gen_model: string
          id: string
          judge_model: string | null
          public_claim_id: string
          reject_reason: string | null
          rejected_by: string
        }
        Insert: {
          company_id: string
          computed_at?: string
          content_identity: string
          declared_claim_id: string
          gen_model: string
          id?: string
          judge_model?: string | null
          public_claim_id: string
          reject_reason?: string | null
          rejected_by: string
        }
        Update: {
          company_id?: string
          computed_at?: string
          content_identity?: string
          declared_claim_id?: string
          gen_model?: string
          id?: string
          judge_model?: string | null
          public_claim_id?: string
          reject_reason?: string | null
          rejected_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_delta_rejections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_delta_rejections_declared_claim_id_fkey"
            columns: ["declared_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_delta_rejections_public_claim_id_fkey"
            columns: ["public_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_deltas: {
        Row: {
          company_id: string
          computed_at: string
          content_identity: string
          declared_claim_id: string | null
          delta_type: string
          id: string
          judge_reason: string | null
          operator_disposition: string | null
          operator_seen_at: string | null
          pairing_basis: string
          public_claim_id: string | null
        }
        Insert: {
          company_id: string
          computed_at?: string
          content_identity: string
          declared_claim_id?: string | null
          delta_type: string
          id?: string
          judge_reason?: string | null
          operator_disposition?: string | null
          operator_seen_at?: string | null
          pairing_basis?: string
          public_claim_id?: string | null
        }
        Update: {
          company_id?: string
          computed_at?: string
          content_identity?: string
          declared_claim_id?: string | null
          delta_type?: string
          id?: string
          judge_reason?: string | null
          operator_disposition?: string | null
          operator_seen_at?: string | null
          pairing_basis?: string
          public_claim_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_deltas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_deltas_declared_claim_id_fkey"
            columns: ["declared_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_deltas_public_claim_id_fkey"
            columns: ["public_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_events: {
        Row: {
          claim_id: string
          company_id: string
          evidence_delta: Json
          from_state: string | null
          id: string
          occurred_at: string
          to_state: string
          triggered_by_event: string
        }
        Insert: {
          claim_id: string
          company_id: string
          evidence_delta?: Json
          from_state?: string | null
          id?: string
          occurred_at?: string
          to_state: string
          triggered_by_event?: string
        }
        Update: {
          claim_id?: string
          company_id?: string
          evidence_delta?: Json
          from_state?: string | null
          id?: string
          occurred_at?: string
          to_state?: string
          triggered_by_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_job_step_refs: {
        Row: {
          claim_id: string
          company_id: string
          created_at: string
          id: string
          job_step_id: string
        }
        Insert: {
          claim_id: string
          company_id: string
          created_at?: string
          id?: string
          job_step_id: string
        }
        Update: {
          claim_id?: string
          company_id?: string
          created_at?: string
          id?: string
          job_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_job_step_refs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_job_step_refs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_job_step_refs_job_step_id_fkey"
            columns: ["job_step_id"]
            isOneToOne: false
            referencedRelation: "job_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_removals: {
        Row: {
          actor: string | null
          claim_statement: string
          company_id: string
          id: string
          provenance: string | null
          reason_category: string
          removed_at: string
          statement_identity: string
        }
        Insert: {
          actor?: string | null
          claim_statement: string
          company_id: string
          id?: string
          provenance?: string | null
          reason_category: string
          removed_at?: string
          statement_identity: string
        }
        Update: {
          actor?: string | null
          claim_statement?: string
          company_id?: string
          id?: string
          provenance?: string | null
          reason_category?: string
          removed_at?: string
          statement_identity?: string
        }
        Relationships: []
      }
      claim_signal_refs: {
        Row: {
          claim_id: string
          company_id: string
          created_at: string
          id: string
          relationship: string
          signal_id: string
        }
        Insert: {
          claim_id: string
          company_id: string
          created_at?: string
          id?: string
          relationship?: string
          signal_id: string
        }
        Update: {
          claim_id?: string
          company_id?: string
          created_at?: string
          id?: string
          relationship?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_signal_refs_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_signal_refs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_signal_refs_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          action_category: string | null
          claim_type: string
          company_id: string
          confidence: string
          created_at: string
          customer_support_count: number
          id: string
          need_statement: string | null
          organization_support_count: number
          outside_support_count: number
          provenance: string
          raw_payload: Json
          revalidation_flag: boolean
          state: string
          statement: string
          status: string
          struck_at: string | null
          struck_by: string | null
          struck_reason: string | null
          topic: string | null
          triangulation_state: string
          updated_at: string
        }
        Insert: {
          action_category?: string | null
          claim_type?: string
          company_id: string
          confidence?: string
          created_at?: string
          customer_support_count?: number
          id?: string
          need_statement?: string | null
          organization_support_count?: number
          outside_support_count?: number
          provenance?: string
          raw_payload?: Json
          revalidation_flag?: boolean
          state?: string
          statement: string
          status?: string
          struck_at?: string | null
          struck_by?: string | null
          struck_reason?: string | null
          topic?: string | null
          triangulation_state?: string
          updated_at?: string
        }
        Update: {
          action_category?: string | null
          claim_type?: string
          company_id?: string
          confidence?: string
          created_at?: string
          customer_support_count?: number
          id?: string
          need_statement?: string | null
          organization_support_count?: number
          outside_support_count?: number
          provenance?: string
          raw_payload?: Json
          revalidation_flag?: boolean
          state?: string
          statement?: string
          status?: string
          struck_at?: string | null
          struck_by?: string | null
          struck_reason?: string | null
          topic?: string | null
          triangulation_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          archetype: string
          area_scores_json: Json | null
          created_at: string
          created_by: string
          engagement_started_at: string | null
          evidence_note: string | null
          evidence_status: string | null
          excluded_signals_json: Json
          human_decision: string | null
          id: string
          industry_key: string | null
          instance_of: string | null
          last_scored_at: string | null
          last_updated: string
          manual_industry_vocab: string[]
          mojo_score: number | null
          name: string
          potential_score: number | null
          program_phase: string | null
          projected_score: number | null
          public_source_filters_json: Json
          quarter: string
          review_source: string | null
          review_status: string | null
          selected_route_id: string | null
          selected_route_summary_json: Json
          selected_route_updated_at: string | null
          strategic_problem_brief: string | null
          tier: number
          website: string | null
        }
        Insert: {
          archetype?: string
          area_scores_json?: Json | null
          created_at?: string
          created_by: string
          engagement_started_at?: string | null
          evidence_note?: string | null
          evidence_status?: string | null
          excluded_signals_json?: Json
          human_decision?: string | null
          id?: string
          industry_key?: string | null
          instance_of?: string | null
          last_scored_at?: string | null
          last_updated?: string
          manual_industry_vocab?: string[]
          mojo_score?: number | null
          name: string
          potential_score?: number | null
          program_phase?: string | null
          projected_score?: number | null
          public_source_filters_json?: Json
          quarter?: string
          review_source?: string | null
          review_status?: string | null
          selected_route_id?: string | null
          selected_route_summary_json?: Json
          selected_route_updated_at?: string | null
          strategic_problem_brief?: string | null
          tier?: number
          website?: string | null
        }
        Update: {
          archetype?: string
          area_scores_json?: Json | null
          created_at?: string
          created_by?: string
          engagement_started_at?: string | null
          evidence_note?: string | null
          evidence_status?: string | null
          excluded_signals_json?: Json
          human_decision?: string | null
          id?: string
          industry_key?: string | null
          instance_of?: string | null
          last_scored_at?: string | null
          last_updated?: string
          manual_industry_vocab?: string[]
          mojo_score?: number | null
          name?: string
          potential_score?: number | null
          program_phase?: string | null
          projected_score?: number | null
          public_source_filters_json?: Json
          quarter?: string
          review_source?: string | null
          review_status?: string | null
          selected_route_id?: string | null
          selected_route_summary_json?: Json
          selected_route_updated_at?: string | null
          strategic_problem_brief?: string | null
          tier?: number
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_instance_of_fkey"
            columns: ["instance_of"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_run_locks: {
        Row: {
          company_id: string
          expires_at: string
          operation: string
          started_at: string
          started_by: string
        }
        Insert: {
          company_id: string
          expires_at: string
          operation: string
          started_at?: string
          started_by: string
        }
        Update: {
          company_id?: string
          expires_at?: string
          operation?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_run_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_discovery_runs: {
        Row: {
          baseline_run_id: number | null
          company_id: string
          created_at: string
          id: number
          result_json: Json
        }
        Insert: {
          baseline_run_id?: number | null
          company_id: string
          created_at?: string
          id?: never
          result_json: Json
        }
        Update: {
          baseline_run_id?: number | null
          company_id?: string
          created_at?: string
          id?: never
          result_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "competitor_discovery_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      condition_removals: {
        Row: {
          actor: string
          affected_leg_ids: string[]
          company_id: string
          condition_identity: string
          condition_text: string
          id: string
          reason: string
          removed_at: string
          route_id: string
        }
        Insert: {
          actor: string
          affected_leg_ids?: string[]
          company_id: string
          condition_identity: string
          condition_text: string
          id?: string
          reason: string
          removed_at?: string
          route_id: string
        }
        Update: {
          actor?: string
          affected_leg_ids?: string[]
          company_id?: string
          condition_identity?: string
          condition_text?: string
          id?: string
          reason?: string
          removed_at?: string
          route_id?: string
        }
        Relationships: []
      }
      council_recommendations: {
        Row: {
          category: string
          company_id: string
          confidence: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_id: string | null
          decision_note: string | null
          id: string
          priority: string
          rationale: string
          recommendation: string
          run_id: string | null
          source_basis: string
          source_context_json: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          company_id: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id?: string | null
          decision_note?: string | null
          id?: string
          priority?: string
          rationale?: string
          recommendation: string
          run_id?: string | null
          source_basis?: string
          source_context_json?: Json
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string
          confidence?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id?: string | null
          decision_note?: string | null
          id?: string
          priority?: string
          rationale?: string
          recommendation?: string
          run_id?: string | null
          source_basis?: string
          source_context_json?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_recommendations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "strategic_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_recommendations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "council_review_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      council_review_runs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          model: string
          recommendation_count: number
          source_snapshot_json: Json
          status: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          model?: string
          recommendation_count?: number
          source_snapshot_json?: Json
          status: string
          summary?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          model?: string
          recommendation_count?: number
          source_snapshot_json?: Json
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "council_review_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_routes: {
        Row: {
          company_id: string
          created_at: string
          decision_id: string
          id: string
          relationship: string
          route_id: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          decision_id: string
          id?: string
          relationship?: string
          route_id: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          decision_id?: string
          id?: string
          relationship?: string
          route_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "decision_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_routes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "strategic_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_dive_analyses: {
        Row: {
          area_key: string
          company_id: string | null
          generated_at: string
          holding_back: Json
          id: string
          path_forward: Json
          updated_at: string
          user_id: string
          what_good_looks_like: string
          what_we_found: string
          why_it_matters: string
        }
        Insert: {
          area_key: string
          company_id?: string | null
          generated_at?: string
          holding_back?: Json
          id?: string
          path_forward?: Json
          updated_at?: string
          user_id: string
          what_good_looks_like?: string
          what_we_found?: string
          why_it_matters?: string
        }
        Update: {
          area_key?: string
          company_id?: string | null
          generated_at?: string
          holding_back?: Json
          id?: string
          path_forward?: Json
          updated_at?: string
          user_id?: string
          what_good_looks_like?: string
          what_we_found?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "deep_dive_analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delta_dispositions: {
        Row: {
          company_id: string
          created_at: string
          disposition: string
          id: string
          phase: string | null
          signal_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          disposition: string
          id?: string
          phase?: string | null
          signal_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          disposition?: string
          id?: string
          phase?: string | null
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delta_dispositions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delta_dispositions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: true
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      desired_outcomes: {
        Row: {
          company_id: string
          created_at: string
          id: string
          importance_score: number | null
          is_primary: boolean
          metric: string | null
          satisfaction_score: number | null
          statement: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          importance_score?: number | null
          is_primary?: boolean
          metric?: string | null
          satisfaction_score?: number | null
          statement: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          importance_score?: number | null
          is_primary?: boolean
          metric?: string | null
          satisfaction_score?: number | null
          statement?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "desired_outcomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_voice_verdicts: {
        Row: {
          basis: string
          classifier_model: string | null
          company_id: string
          content_sha: string
          created_at: string
          id: string
          input_file_id: string
          operator_override: string | null
          override_by: string | null
          override_reason: string | null
          verdict: string
        }
        Insert: {
          basis: string
          classifier_model?: string | null
          company_id: string
          content_sha: string
          created_at?: string
          id?: string
          input_file_id: string
          operator_override?: string | null
          override_by?: string | null
          override_reason?: string | null
          verdict: string
        }
        Update: {
          basis?: string
          classifier_model?: string | null
          company_id?: string
          content_sha?: string
          created_at?: string
          id?: string
          input_file_id?: string
          operator_override?: string | null
          override_by?: string | null
          override_reason?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_voice_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_voice_verdicts_input_file_id_fkey"
            columns: ["input_file_id"]
            isOneToOne: false
            referencedRelation: "input_files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_proposals: {
        Row: {
          applied_areas: string[]
          candidate_job_steps: Json
          candidate_needs: Json
          candidate_outcomes: Json
          candidate_positioning_updates: Json
          company_id: string
          confidence: string
          confidence_reason: string
          contradictions: Json
          created_at: string
          dify_task_id: string | null
          dify_workflow_run_id: string | null
          evidence: Json
          experiments_to_run: Json
          file_id: string | null
          file_name: string
          framework_results: Json
          id: string
          possible_gaps: Json
          possible_routes: Json
          processing_completed_at: string | null
          processing_error: string | null
          processing_started_at: string | null
          processing_state: string
          questions_to_verify: Json
          reviewed_at: string | null
          signal_type: string
          source_type: string
          status: string
          suggested_areas: string[]
          summary: string
        }
        Insert: {
          applied_areas?: string[]
          candidate_job_steps?: Json
          candidate_needs?: Json
          candidate_outcomes?: Json
          candidate_positioning_updates?: Json
          company_id: string
          confidence?: string
          confidence_reason?: string
          contradictions?: Json
          created_at?: string
          dify_task_id?: string | null
          dify_workflow_run_id?: string | null
          evidence?: Json
          experiments_to_run?: Json
          file_id?: string | null
          file_name?: string
          framework_results?: Json
          id?: string
          possible_gaps?: Json
          possible_routes?: Json
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_state?: string
          questions_to_verify?: Json
          reviewed_at?: string | null
          signal_type?: string
          source_type?: string
          status?: string
          suggested_areas?: string[]
          summary?: string
        }
        Update: {
          applied_areas?: string[]
          candidate_job_steps?: Json
          candidate_needs?: Json
          candidate_outcomes?: Json
          candidate_positioning_updates?: Json
          company_id?: string
          confidence?: string
          confidence_reason?: string
          contradictions?: Json
          created_at?: string
          dify_task_id?: string | null
          dify_workflow_run_id?: string | null
          evidence?: Json
          experiments_to_run?: Json
          file_id?: string | null
          file_name?: string
          framework_results?: Json
          id?: string
          possible_gaps?: Json
          possible_routes?: Json
          processing_completed_at?: string | null
          processing_error?: string | null
          processing_started_at?: string | null
          processing_state?: string
          questions_to_verify?: Json
          reviewed_at?: string | null
          signal_type?: string
          source_type?: string
          status?: string
          suggested_areas?: string[]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_cluster_verdicts: {
        Row: {
          candidate_basis: string
          company_id: string
          created_at: string
          finding_id: string
          finding_statement_identity: string
          id: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          signal_id: string
          signal_statement_identity: string
          verdict: string
        }
        Insert: {
          candidate_basis: string
          company_id: string
          created_at?: string
          finding_id: string
          finding_statement_identity: string
          id?: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          signal_id: string
          signal_statement_identity: string
          verdict: string
        }
        Update: {
          candidate_basis?: string
          company_id?: string
          created_at?: string
          finding_id?: string
          finding_statement_identity?: string
          id?: string
          judge_model?: string
          judge_reason?: string
          pair_identity?: string
          signal_id?: string
          signal_statement_identity?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_cluster_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_recurrence: {
        Row: {
          cluster_signal_ids: Json
          company_id: string
          computed_at: string
          distinct_host_count: number
          finding_id: string
          host_list: Json
          verdict_count: number
        }
        Insert: {
          cluster_signal_ids: Json
          company_id: string
          computed_at?: string
          distinct_host_count: number
          finding_id: string
          host_list: Json
          verdict_count: number
        }
        Update: {
          cluster_signal_ids?: Json
          company_id?: string
          computed_at?: string
          distinct_host_count?: number
          finding_id?: string
          host_list?: Json
          verdict_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "finding_recurrence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_recurrence_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: true
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          beats: Json | null
          body: string
          company_id: string
          created_at: string
          id: string
          kind: string
          origin_run_id: number | null
          origin_signal_id: string | null
          register: string | null
          resolved_at: string | null
          status: string
          tone: string | null
        }
        Insert: {
          beats?: Json | null
          body: string
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          origin_run_id?: number | null
          origin_signal_id?: string | null
          register?: string | null
          resolved_at?: string | null
          status?: string
          tone?: string | null
        }
        Update: {
          beats?: Json | null
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          origin_run_id?: number | null
          origin_signal_id?: string | null
          register?: string | null
          resolved_at?: string | null
          status?: string
          tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_origin_run_id_fkey"
            columns: ["origin_run_id"]
            isOneToOne: false
            referencedRelation: "public_baseline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "findings_origin_signal_id_fkey"
            columns: ["origin_signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      first_read_open_questions: {
        Row: {
          anchor_identity: string | null
          company_id: string
          created_at: string
          finding_identity: string | null
          id: string
          question_identity: string
          question_text: string
          run_id: string
          source_kind: string
          status: string
        }
        Insert: {
          anchor_identity?: string | null
          company_id: string
          created_at?: string
          finding_identity?: string | null
          id?: string
          question_identity: string
          question_text: string
          run_id: string
          source_kind?: string
          status?: string
        }
        Update: {
          anchor_identity?: string | null
          company_id?: string
          created_at?: string
          finding_identity?: string | null
          id?: string
          question_identity?: string
          question_text?: string
          run_id?: string
          source_kind?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_read_open_questions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      first_read_responses: {
        Row: {
          captured_at: string
          company_id: string
          correction_text: string | null
          id: string
          item_identity: string
          item_kind: string
          item_ref: string | null
          item_text: string
          session_id: string
          source: string
          verdict: string
        }
        Insert: {
          captured_at?: string
          company_id: string
          correction_text?: string | null
          id?: string
          item_identity: string
          item_kind: string
          item_ref?: string | null
          item_text: string
          session_id: string
          source?: string
          verdict: string
        }
        Update: {
          captured_at?: string
          company_id?: string
          correction_text?: string | null
          id?: string
          item_identity?: string
          item_kind?: string
          item_ref?: string | null
          item_text?: string
          session_id?: string
          source?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_read_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "first_read_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      first_read_session_removals: {
        Row: {
          company_id: string
          confirmed_count: number
          corrected_count: number
          deleted_at: string
          id: string
          reason: string
          rejected_count: number
          session_id: string
          status_at_deletion: string
        }
        Insert: {
          company_id: string
          confirmed_count?: number
          corrected_count?: number
          deleted_at?: string
          id?: string
          reason: string
          rejected_count?: number
          session_id: string
          status_at_deletion: string
        }
        Update: {
          company_id?: string
          confirmed_count?: number
          corrected_count?: number
          deleted_at?: string
          id?: string
          reason?: string
          rejected_count?: number
          session_id?: string
          status_at_deletion?: string
        }
        Relationships: []
      }
      first_read_sessions: {
        Row: {
          company_id: string
          confirmed_count: number | null
          corrected_count: number | null
          domains: string[] | null
          id: string
          landmines: string | null
          legal_name: string | null
          mojo_score_at_open: number | null
          presenter: string | null
          proposal_issued_at: string | null
          proposal_json: Json | null
          rejected_count: number | null
          resolved_at: string | null
          room_roles: Json | null
          started_at: string
          status: string
          trigger_event: string | null
        }
        Insert: {
          company_id: string
          confirmed_count?: number | null
          corrected_count?: number | null
          domains?: string[] | null
          id?: string
          landmines?: string | null
          legal_name?: string | null
          mojo_score_at_open?: number | null
          presenter?: string | null
          proposal_issued_at?: string | null
          proposal_json?: Json | null
          rejected_count?: number | null
          resolved_at?: string | null
          room_roles?: Json | null
          started_at?: string
          status?: string
          trigger_event?: string | null
        }
        Update: {
          company_id?: string
          confirmed_count?: number | null
          corrected_count?: number | null
          domains?: string[] | null
          id?: string
          landmines?: string | null
          legal_name?: string | null
          mojo_score_at_open?: number | null
          presenter?: string | null
          proposal_issued_at?: string | null
          proposal_json?: Json | null
          rejected_count?: number | null
          resolved_at?: string | null
          room_roles?: Json | null
          started_at?: string
          status?: string
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "first_read_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      first_read_stated_problem: {
        Row: {
          company_id: string
          descriptive_fallback: boolean
          gen_model: string
          generated_at: string
          id: string
          judge_model: string | null
          quote: string | null
          quote_source_text: string | null
          register: string
          statement: string
          statement_identity: string
          status: string
        }
        Insert: {
          company_id: string
          descriptive_fallback?: boolean
          gen_model: string
          generated_at?: string
          id?: string
          judge_model?: string | null
          quote?: string | null
          quote_source_text?: string | null
          register?: string
          statement: string
          statement_identity: string
          status?: string
        }
        Update: {
          company_id?: string
          descriptive_fallback?: boolean
          gen_model?: string
          generated_at?: string
          id?: string
          judge_model?: string | null
          quote?: string | null
          quote_source_text?: string | null
          register?: string
          statement?: string
          statement_identity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_read_stated_problem_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_reference_job_maps: {
        Row: {
          content_sha: string | null
          created_at: string
          description: string
          generator_run_id: string | null
          id: string
          industry_key: string
          industry_label: string
          is_published: boolean
          provenance: string
          step_key: string
          step_label: string
          step_number: number
          taxonomy_version: string | null
        }
        Insert: {
          content_sha?: string | null
          created_at?: string
          description: string
          generator_run_id?: string | null
          id?: string
          industry_key: string
          industry_label: string
          is_published?: boolean
          provenance?: string
          step_key: string
          step_label: string
          step_number: number
          taxonomy_version?: string | null
        }
        Update: {
          content_sha?: string | null
          created_at?: string
          description?: string
          generator_run_id?: string | null
          id?: string
          industry_key?: string
          industry_label?: string
          is_published?: boolean
          provenance?: string
          step_key?: string
          step_label?: string
          step_number?: number
          taxonomy_version?: string | null
        }
        Relationships: []
      }
      input_files: {
        Row: {
          archive_reason: string | null
          archive_source: string | null
          archived_at: string | null
          archived_by: string | null
          file_name: string
          file_path: string
          file_type: string
          id: string
          input_id: string
          restored_at: string | null
          restored_by: string | null
          tags: string[]
          uploaded_at: string
        }
        Insert: {
          archive_reason?: string | null
          archive_source?: string | null
          archived_at?: string | null
          archived_by?: string | null
          file_name: string
          file_path: string
          file_type?: string
          id?: string
          input_id: string
          restored_at?: string | null
          restored_by?: string | null
          tags?: string[]
          uploaded_at?: string
        }
        Update: {
          archive_reason?: string | null
          archive_source?: string | null
          archived_at?: string | null
          archived_by?: string | null
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          input_id?: string
          restored_at?: string | null
          restored_by?: string | null
          tags?: string[]
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "input_files_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
        ]
      }
      input_subitems: {
        Row: {
          done: boolean
          id: string
          input_id: string
          name: string
          sort_order: number
        }
        Insert: {
          done?: boolean
          id?: string
          input_id: string
          name: string
          sort_order?: number
        }
        Update: {
          done?: boolean
          id?: string
          input_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "input_subitems_input_id_fkey"
            columns: ["input_id"]
            isOneToOne: false
            referencedRelation: "inputs"
            referencedColumns: ["id"]
          },
        ]
      }
      inputs: {
        Row: {
          company_id: string | null
          completeness: number
          created_at: string
          description: string
          frameworks_used: string[]
          group_key: Database["public"]["Enums"]["input_group_key"]
          group_label: string
          id: string
          impact_tier: Database["public"]["Enums"]["input_impact_tier"]
          input_key: string
          input_label: string
          score_impact: number
          status: Database["public"]["Enums"]["input_status"]
          sub_group: string
          updated_at: string
          user_id: string
          why_it_matters: string
        }
        Insert: {
          company_id?: string | null
          completeness?: number
          created_at?: string
          description?: string
          frameworks_used?: string[]
          group_key?: Database["public"]["Enums"]["input_group_key"]
          group_label?: string
          id?: string
          impact_tier?: Database["public"]["Enums"]["input_impact_tier"]
          input_key: string
          input_label: string
          score_impact?: number
          status?: Database["public"]["Enums"]["input_status"]
          sub_group?: string
          updated_at?: string
          user_id: string
          why_it_matters?: string
        }
        Update: {
          company_id?: string | null
          completeness?: number
          created_at?: string
          description?: string
          frameworks_used?: string[]
          group_key?: Database["public"]["Enums"]["input_group_key"]
          group_label?: string
          id?: string
          impact_tier?: Database["public"]["Enums"]["input_impact_tier"]
          input_key?: string
          input_label?: string
          score_impact?: number
          status?: Database["public"]["Enums"]["input_status"]
          sub_group?: string
          updated_at?: string
          user_id?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "inputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_runs: {
        Row: {
          admitted: number | null
          company_id: string
          component: string
          error: string | null
          examined: number | null
          excluded_by_rule: Json | null
          id: number
          ran_at: string
          run_ref: string | null
          status: string
          surface_id: string | null
          surface_type: string | null
        }
        Insert: {
          admitted?: number | null
          company_id: string
          component: string
          error?: string | null
          examined?: number | null
          excluded_by_rule?: Json | null
          id?: never
          ran_at?: string
          run_ref?: string | null
          status: string
          surface_id?: string | null
          surface_type?: string | null
        }
        Update: {
          admitted?: number | null
          company_id?: string
          component?: string
          error?: string | null
          examined?: number | null
          excluded_by_rule?: Json | null
          id?: never
          ran_at?: string
          run_ref?: string | null
          status?: string
          surface_id?: string | null
          surface_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrity_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_steps: {
        Row: {
          company_id: string
          conditions_json: Json | null
          created_at: string
          dependency_state: string
          description: string
          designed: boolean
          evidence_basis: string
          evidence_confidence: number
          evidence_state: string
          evidence_status: string
          frameworks_used: string[]
          gap_note: string
          has_gap: boolean
          id: string
          journey_key: string
          journey_subtitle: string
          journey_title: string
          last_reviewed_at: string | null
          provenance_type: string | null
          source_run_id: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          step_label: string
          step_number: number
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          company_id: string
          conditions_json?: Json | null
          created_at?: string
          dependency_state?: string
          description?: string
          designed?: boolean
          evidence_basis?: string
          evidence_confidence?: number
          evidence_state?: string
          evidence_status?: string
          frameworks_used?: string[]
          gap_note?: string
          has_gap?: boolean
          id?: string
          journey_key?: string
          journey_subtitle?: string
          journey_title?: string
          last_reviewed_at?: string | null
          provenance_type?: string | null
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          company_id?: string
          conditions_json?: Json | null
          created_at?: string
          dependency_state?: string
          description?: string
          designed?: boolean
          evidence_basis?: string
          evidence_confidence?: number
          evidence_state?: string
          evidence_status?: string
          frameworks_used?: string[]
          gap_note?: string
          has_gap?: boolean
          id?: string
          journey_key?: string
          journey_subtitle?: string
          journey_title?: string
          last_reviewed_at?: string | null
          provenance_type?: string | null
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id?: string
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_steps_stale_since_event_id_fkey"
            columns: ["stale_since_event_id"]
            isOneToOne: false
            referencedRelation: "strategic_events"
            referencedColumns: ["id"]
          },
        ]
      }
      long_runner_runs: {
        Row: {
          company_id: string
          done_count: number
          error_text: string | null
          finished_at: string | null
          id: string
          request_id: string | null
          run_kind: string
          started_at: string
          status: string
          target_count: number
          updated_at: string
        }
        Insert: {
          company_id: string
          done_count?: number
          error_text?: string | null
          finished_at?: string | null
          id?: string
          request_id?: string | null
          run_kind: string
          started_at?: string
          status?: string
          target_count?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          done_count?: number
          error_text?: string | null
          finished_at?: string | null
          id?: string
          request_id?: string | null
          run_kind?: string
          started_at?: string
          status?: string
          target_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      managed_outcomes: {
        Row: {
          action: string
          actor: string
          company_id: string
          confidence: number
          constraint: string | null
          context: string | null
          created_at: string
          dependency_state: string
          direction: string | null
          evidence_basis: string
          evidence_level: string | null
          evidence_state: string
          frameworks_used: string[]
          id: string
          is_primary: boolean
          journey_key: string
          lagging_indicators: string[] | null
          last_reviewed_at: string | null
          leading_indicator: string
          leading_indicators: string[] | null
          level: string | null
          metric: string | null
          object: string | null
          outcome_statement: string
          outcome_title: string
          related_opportunity_areas: string[] | null
          source_run_id: string | null
          stage: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          target_direction: string
          updated_at: string
          user_id: string
          validation_state: string
          why_behavioral: string | null
          why_this_level: string | null
        }
        Insert: {
          action?: string
          actor?: string
          company_id: string
          confidence?: number
          constraint?: string | null
          context?: string | null
          created_at?: string
          dependency_state?: string
          direction?: string | null
          evidence_basis?: string
          evidence_level?: string | null
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          is_primary?: boolean
          journey_key?: string
          lagging_indicators?: string[] | null
          last_reviewed_at?: string | null
          leading_indicator?: string
          leading_indicators?: string[] | null
          level?: string | null
          metric?: string | null
          object?: string | null
          outcome_statement?: string
          outcome_title?: string
          related_opportunity_areas?: string[] | null
          source_run_id?: string | null
          stage?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          target_direction?: string
          updated_at?: string
          user_id: string
          validation_state?: string
          why_behavioral?: string | null
          why_this_level?: string | null
        }
        Update: {
          action?: string
          actor?: string
          company_id?: string
          confidence?: number
          constraint?: string | null
          context?: string | null
          created_at?: string
          dependency_state?: string
          direction?: string | null
          evidence_basis?: string
          evidence_level?: string | null
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          is_primary?: boolean
          journey_key?: string
          lagging_indicators?: string[] | null
          last_reviewed_at?: string | null
          leading_indicator?: string
          leading_indicators?: string[] | null
          level?: string | null
          metric?: string | null
          object?: string | null
          outcome_statement?: string
          outcome_title?: string
          related_opportunity_areas?: string[] | null
          source_run_id?: string | null
          stage?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          target_direction?: string
          updated_at?: string
          user_id?: string
          validation_state?: string
          why_behavioral?: string | null
          why_this_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managed_outcomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "managed_outcomes_stale_since_event_id_fkey"
            columns: ["stale_since_event_id"]
            isOneToOne: false
            referencedRelation: "strategic_events"
            referencedColumns: ["id"]
          },
        ]
      }
      market_discovery_verdicts: {
        Row: {
          company_id: string
          created_at: string
          id: string
          judge_model: string
          judge_reason: string
          market_a_identity: string
          market_b_identity: string | null
          pair_identity: string
          verdict: string
          verdict_kind: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          judge_model: string
          judge_reason: string
          market_a_identity: string
          market_b_identity?: string | null
          pair_identity: string
          verdict: string
          verdict_kind: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          judge_model?: string
          judge_reason?: string
          market_a_identity?: string
          market_b_identity?: string | null
          pair_identity?: string
          verdict?: string
          verdict_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_discovery_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      market_lens: {
        Row: {
          anchor_outcome_id: string | null
          coherence_note: string | null
          coherence_status: string
          company_id: string
          created_at: string
          id: string
          journey_key: string
          portfolio_role: string
          portfolio_state: string
          title: string | null
          updated_at: string
        }
        Insert: {
          anchor_outcome_id?: string | null
          coherence_note?: string | null
          coherence_status?: string
          company_id: string
          created_at?: string
          id?: string
          journey_key: string
          portfolio_role?: string
          portfolio_state?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          anchor_outcome_id?: string | null
          coherence_note?: string | null
          coherence_status?: string
          company_id?: string
          created_at?: string
          id?: string
          journey_key?: string
          portfolio_role?: string
          portfolio_state?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_lens_anchor_outcome_id_fkey"
            columns: ["anchor_outcome_id"]
            isOneToOne: false
            referencedRelation: "managed_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_lens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      market_lens_links: {
        Row: {
          company_id: string
          created_at: string
          from_lens_id: string
          id: string
          link_type: string
          note: string | null
          to_lens_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          from_lens_id: string
          id?: string
          link_type: string
          note?: string | null
          to_lens_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          from_lens_id?: string
          id?: string
          link_type?: string
          note?: string | null
          to_lens_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_lens_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_lens_links_from_lens_id_fkey"
            columns: ["from_lens_id"]
            isOneToOne: false
            referencedRelation: "market_lens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_lens_links_to_lens_id_fkey"
            columns: ["to_lens_id"]
            isOneToOne: false
            referencedRelation: "market_lens"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_tensions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          difficulty_claim_id: string
          id: string
          operator_note: string | null
          promise_claim_id: string
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          difficulty_claim_id: string
          id?: string
          operator_note?: string | null
          promise_claim_id: string
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          difficulty_claim_id?: string
          id?: string
          operator_note?: string | null
          promise_claim_id?: string
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curated_tensions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_tensions_promise_claim_id_fkey"
            columns: ["promise_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curated_tensions_difficulty_claim_id_fkey"
            columns: ["difficulty_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      market_options: {
        Row: {
          attempt: number
          basis: string | null
          company_id: string
          content_identity: string
          created_at: string
          criteria_version: number
          criterion_executor_group: boolean | null
          criterion_executor_reason: string | null
          criterion_odi_form: boolean | null
          criterion_odi_form_reason: string | null
          criterion_solution_agnostic: boolean | null
          criterion_solution_agnostic_reason: string | null
          duplicate_of: string | null
          executor_statement: string
          gen_model: string
          id: string
          job_statement: string
          judge_model: string | null
          market_register: string
          proof_tier: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          recovered_from: string | null
          rejected_criterion: string | null
          relationship_kind: string | null
          revision_of: string | null
          run_id: string | null
          status: string
          superseded_by_id: string | null
        }
        Insert: {
          attempt?: number
          basis?: string | null
          company_id: string
          content_identity: string
          created_at?: string
          criteria_version?: number
          criterion_executor_group?: boolean | null
          criterion_executor_reason?: string | null
          criterion_odi_form?: boolean | null
          criterion_odi_form_reason?: string | null
          criterion_solution_agnostic?: boolean | null
          criterion_solution_agnostic_reason?: string | null
          duplicate_of?: string | null
          executor_statement: string
          gen_model: string
          id?: string
          job_statement: string
          judge_model?: string | null
          market_register: string
          proof_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          recovered_from?: string | null
          rejected_criterion?: string | null
          relationship_kind?: string | null
          revision_of?: string | null
          run_id?: string | null
          status: string
          superseded_by_id?: string | null
        }
        Update: {
          attempt?: number
          basis?: string | null
          company_id?: string
          content_identity?: string
          created_at?: string
          criteria_version?: number
          criterion_executor_group?: boolean | null
          criterion_executor_reason?: string | null
          criterion_odi_form?: boolean | null
          criterion_odi_form_reason?: string | null
          criterion_solution_agnostic?: boolean | null
          criterion_solution_agnostic_reason?: string | null
          duplicate_of?: string | null
          executor_statement?: string
          gen_model?: string
          id?: string
          job_statement?: string
          judge_model?: string | null
          market_register?: string
          proof_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          recovered_from?: string | null
          rejected_criterion?: string | null
          relationship_kind?: string | null
          revision_of?: string | null
          run_id?: string | null
          status?: string
          superseded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_recovered_from_fkey"
            columns: ["recovered_from"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_options_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "market_options"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_pages: {
        Row: {
          created_at: string
          hero_description: string
          hero_subtitle: string
          id: string
          impact_score: string
          is_published: boolean
          page_number: string
          page_title: string
          phase: string
          process_steps: Json
          score_detail: string
          section1_content: string
          section1_title: string
          section2_content: string
          section2_title: string
          section3_content: string
          section3_title: string
          section4_content: string
          section4_title: string
          section5_content: string
          section5_title: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero_description?: string
          hero_subtitle?: string
          id?: string
          impact_score?: string
          is_published?: boolean
          page_number: string
          page_title: string
          phase?: string
          process_steps?: Json
          score_detail?: string
          section1_content?: string
          section1_title?: string
          section2_content?: string
          section2_title?: string
          section3_content?: string
          section3_title?: string
          section4_content?: string
          section4_title?: string
          section5_content?: string
          section5_title?: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero_description?: string
          hero_subtitle?: string
          id?: string
          impact_score?: string
          is_published?: boolean
          page_number?: string
          page_title?: string
          phase?: string
          process_steps?: Json
          score_detail?: string
          section1_content?: string
          section1_title?: string
          section2_content?: string
          section2_title?: string
          section3_content?: string
          section3_title?: string
          section4_content?: string
          section4_title?: string
          section5_content?: string
          section5_title?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      mojo_maps: {
        Row: {
          created_at: string
          id: string
          map_json: Json
          seed_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id: string
          map_json?: Json
          seed_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          map_json?: Json
          seed_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mojo_scores: {
        Row: {
          company_id: string
          component_scores: Json
          computed_at: string
          explanation: Json
          id: string
          methodology_version: string
          total_score: number
        }
        Insert: {
          company_id: string
          component_scores?: Json
          computed_at?: string
          explanation?: Json
          id?: string
          methodology_version?: string
          total_score: number
        }
        Update: {
          company_id?: string
          component_scores?: Json
          computed_at?: string
          explanation?: Json
          id?: string
          methodology_version?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "mojo_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_industry_sources: {
        Row: {
          company_id: string
          computed_at: string
          content_sha: string
          host: string | null
          id: string
          registrable_domain: string | null
          source_run_id: string
          source_text: string
          source_url: string | null
          syndicated: boolean
        }
        Insert: {
          company_id: string
          computed_at?: string
          content_sha: string
          host?: string | null
          id?: string
          registrable_domain?: string | null
          source_run_id: string
          source_text: string
          source_url?: string | null
          syndicated?: boolean
        }
        Update: {
          company_id?: string
          computed_at?: string
          content_sha?: string
          host?: string | null
          id?: string
          registrable_domain?: string | null
          source_run_id?: string
          source_text?: string
          source_url?: string | null
          syndicated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "normative_industry_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_job_steps: {
        Row: {
          company_id: string
          computed_at: string
          content_sha: string
          description: string
          executor_context: string
          id: string
          journey_key: string
          provenance: string
          source_run_id: string
          step_key: string
          step_label: string
          step_number: number
          title_source: string
        }
        Insert: {
          company_id: string
          computed_at?: string
          content_sha: string
          description: string
          executor_context: string
          id?: string
          journey_key: string
          provenance?: string
          source_run_id: string
          step_key: string
          step_label: string
          step_number: number
          title_source: string
        }
        Update: {
          company_id?: string
          computed_at?: string
          content_sha?: string
          description?: string
          executor_context?: string
          id?: string
          journey_key?: string
          provenance?: string
          source_run_id?: string
          step_key?: string
          step_label?: string
          step_number?: number
          title_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "normative_job_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_source_removals: {
        Row: {
          company_id: string
          content_sha: string | null
          id: string
          reason: string
          registrable_domain: string | null
          removed_at: string
          removed_source_id: string
          source_run_id: string
        }
        Insert: {
          company_id: string
          content_sha?: string | null
          id?: string
          reason: string
          registrable_domain?: string | null
          removed_at?: string
          removed_source_id: string
          source_run_id: string
        }
        Update: {
          company_id?: string
          content_sha?: string | null
          id?: string
          reason?: string
          registrable_domain?: string | null
          removed_at?: string
          removed_source_id?: string
          source_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "normative_source_removals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_step_recurrence: {
        Row: {
          company_id: string
          computed_at: string
          distinct_host_count: number
          host_list: Json
          id: string
          source_run_id: string
          step_id: string
          verdict_count: number
        }
        Insert: {
          company_id: string
          computed_at?: string
          distinct_host_count?: number
          host_list?: Json
          id?: string
          source_run_id: string
          step_id: string
          verdict_count?: number
        }
        Update: {
          company_id?: string
          computed_at?: string
          distinct_host_count?: number
          host_list?: Json
          id?: string
          source_run_id?: string
          step_id?: string
          verdict_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "normative_step_recurrence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normative_step_recurrence_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: true
            referencedRelation: "normative_job_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      normative_step_source_verdicts: {
        Row: {
          candidate_basis: string
          company_id: string
          created_at: string
          id: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          source_id: string
          source_identity: string
          source_run_id: string
          step_id: string
          step_identity: string
          verdict: string
        }
        Insert: {
          candidate_basis: string
          company_id: string
          created_at?: string
          id?: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          source_id: string
          source_identity: string
          source_run_id: string
          step_id: string
          step_identity: string
          verdict: string
        }
        Update: {
          candidate_basis?: string
          company_id?: string
          created_at?: string
          id?: string
          judge_model?: string
          judge_reason?: string
          pair_identity?: string
          source_id?: string
          source_identity?: string
          source_run_id?: string
          step_id?: string
          step_identity?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "normative_step_source_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normative_step_source_verdicts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "normative_industry_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "normative_step_source_verdicts_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "normative_job_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      object_dependencies: {
        Row: {
          company_id: string
          created_at: string
          dependency_type: string
          downstream_object_id: string
          downstream_object_type: string
          id: string
          strength: string
          updated_at: string
          upstream_object_id: string
          upstream_object_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dependency_type: string
          downstream_object_id: string
          downstream_object_type: string
          id?: string
          strength: string
          updated_at?: string
          upstream_object_id: string
          upstream_object_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dependency_type?: string
          downstream_object_id?: string
          downstream_object_type?: string
          id?: string
          strength?: string
          updated_at?: string
          upstream_object_id?: string
          upstream_object_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_dependencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      odi_market_definitions: {
        Row: {
          chooser: string
          company_id: string
          confidence: number | null
          created_at: string
          declared_source_ref: string | null
          declared_verbatim: string | null
          frameworks_used: string[]
          id: string
          innovation_strategy: string | null
          job_executor: string
          journey_key: string
          jtbd: string
          market_register: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          relationship_basis: string | null
          relationship_kind: string | null
          source_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chooser?: string
          company_id: string
          confidence?: number | null
          created_at?: string
          declared_source_ref?: string | null
          declared_verbatim?: string | null
          frameworks_used?: string[]
          id?: string
          innovation_strategy?: string | null
          job_executor?: string
          journey_key?: string
          jtbd?: string
          market_register: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          relationship_basis?: string | null
          relationship_kind?: string | null
          source_path?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chooser?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          declared_source_ref?: string | null
          declared_verbatim?: string | null
          frameworks_used?: string[]
          id?: string
          innovation_strategy?: string | null
          job_executor?: string
          journey_key?: string
          jtbd?: string
          market_register?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          relationship_basis?: string | null
          relationship_kind?: string | null
          source_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "odi_market_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      odi_needs: {
        Row: {
          company_id: string
          confidence: number | null
          content_identity: string | null
          created_at: string
          dependency_state: string
          desired_outcome: string
          evidence_baseline_captured_at: string | null
          evidence_baseline_signal_ids: Json | null
          evidence_state: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          last_confirmed_run_id: string | null
          last_reviewed_at: string | null
          notes: string | null
          odi_canonical_statement: string | null
          opportunity_score: number
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction: number
          service_state: string
          social_extraction_json: Json | null
          sort_order: number
          source_path: string
          source_run_id: string | null
          source_url: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          status: string
          step_label: string
          step_number: number
          strategy_alignment: string | null
          strategy_alignment_evaluated_at: string | null
          strategy_alignment_reason: string | null
          superseded_by_id: string | null
          superseded_reason: string | null
          tier: string
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
          content_identity?: string | null
          created_at?: string
          dependency_state?: string
          desired_outcome?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_confirmed_run_id?: string | null
          last_reviewed_at?: string | null
          notes?: string | null
          odi_canonical_statement?: string | null
          opportunity_score?: number
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          service_state?: string
          social_extraction_json?: Json | null
          sort_order?: number
          source_path?: string
          source_run_id?: string | null
          source_url?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          status?: string
          step_label?: string
          step_number?: number
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          superseded_by_id?: string | null
          superseded_reason?: string | null
          tier?: string
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
          content_identity?: string | null
          created_at?: string
          dependency_state?: string
          desired_outcome?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_confirmed_run_id?: string | null
          last_reviewed_at?: string | null
          notes?: string | null
          odi_canonical_statement?: string | null
          opportunity_score?: number
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          service_state?: string
          social_extraction_json?: Json | null
          sort_order?: number
          source_path?: string
          source_run_id?: string | null
          source_url?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          status?: string
          step_label?: string
          step_number?: number
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          superseded_by_id?: string | null
          superseded_reason?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "odi_needs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odi_needs_stale_since_event_id_fkey"
            columns: ["stale_since_event_id"]
            isOneToOne: false
            referencedRelation: "strategic_events"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_primary_selection: {
        Row: {
          chosen_at: string
          chosen_by: string | null
          company_id: string
          domain: string
          item_id: string | null
          item_key: string | null
        }
        Insert: {
          chosen_at?: string
          chosen_by?: string | null
          company_id: string
          domain: string
          item_id?: string | null
          item_key?: string | null
        }
        Update: {
          chosen_at?: string
          chosen_by?: string | null
          company_id?: string
          domain?: string
          item_id?: string | null
          item_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_primary_selection_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          company_id: string
          confidence: number | null
          content_identity: string | null
          created_at: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          last_confirmed_run_id: string | null
          managed_outcome_id: string | null
          opportunity_score: number
          outcome: string
          parent_opportunity_id: string | null
          priority_tier: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction: number
          source_run_id: string | null
          status: string
          step_label: string
          step_number: number
          superseded_by_id: string | null
          superseded_reason: string | null
          updated_at: string
          user_id: string
          workflow_status: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
          content_identity?: string | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_confirmed_run_id?: string | null
          managed_outcome_id?: string | null
          opportunity_score?: number
          outcome?: string
          parent_opportunity_id?: string | null
          priority_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          source_run_id?: string | null
          status?: string
          step_label?: string
          step_number?: number
          superseded_by_id?: string | null
          superseded_reason?: string | null
          updated_at?: string
          user_id: string
          workflow_status?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
          content_identity?: string | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_confirmed_run_id?: string | null
          managed_outcome_id?: string | null
          opportunity_score?: number
          outcome?: string
          parent_opportunity_id?: string | null
          priority_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          source_run_id?: string | null
          status?: string
          step_label?: string
          step_number?: number
          superseded_by_id?: string | null
          superseded_reason?: string | null
          updated_at?: string
          user_id?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_managed_outcome_id_fkey"
            columns: ["managed_outcome_id"]
            isOneToOne: false
            referencedRelation: "managed_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_parent_opportunity_id_fkey"
            columns: ["parent_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      positioning_canvases: {
        Row: {
          artifact_role: string
          best_fit_customers: string
          category_rationale: string
          company_id: string
          competitive_alternatives_json: Json
          confidence: number | null
          created_at: string
          current_tagline: string
          evidence_baseline_captured_at: string | null
          evidence_baseline_signal_ids: Json | null
          frameworks_used: string[]
          id: string
          known_tensions_json: Json
          market_category: string
          proposed_tagline: string
          provenance_type:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source: string
          source_direction_key: string
          strategy_alignment: string | null
          strategy_alignment_evaluated_at: string | null
          strategy_alignment_reason: string | null
          unique_attributes_json: Json
          updated_at: string
          user_id: string
          value_for_customer: string
        }
        Insert: {
          artifact_role: string
          best_fit_customers?: string
          category_rationale?: string
          company_id: string
          competitive_alternatives_json?: Json
          confidence?: number | null
          created_at?: string
          current_tagline?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          frameworks_used?: string[]
          id?: string
          known_tensions_json?: Json
          market_category?: string
          proposed_tagline?: string
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source?: string
          source_direction_key: string
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          unique_attributes_json?: Json
          updated_at?: string
          user_id: string
          value_for_customer?: string
        }
        Update: {
          artifact_role?: string
          best_fit_customers?: string
          category_rationale?: string
          company_id?: string
          competitive_alternatives_json?: Json
          confidence?: number | null
          created_at?: string
          current_tagline?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          frameworks_used?: string[]
          id?: string
          known_tensions_json?: Json
          market_category?: string
          proposed_tagline?: string
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source?: string
          source_direction_key?: string
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          unique_attributes_json?: Json
          updated_at?: string
          user_id?: string
          value_for_customer?: string
        }
        Relationships: [
          {
            foreignKeyName: "positioning_canvases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      public_baseline_runs: {
        Row: {
          company_id: string
          company_name: string
          created_at: string
          id: number
          result_json: Json | null
          sources_json: Json | null
          website: string
        }
        Insert: {
          company_id: string
          company_name?: string
          created_at?: string
          id?: number
          result_json?: Json | null
          sources_json?: Json | null
          website?: string
        }
        Update: {
          company_id?: string
          company_name?: string
          created_at?: string
          id?: number
          result_json?: Json | null
          sources_json?: Json | null
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_baseline_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      research_artifact_runs: {
        Row: {
          artifacts_json: Json
          baseline_run_id: number | null
          company_id: string
          created_at: string
          evidence_status: string | null
          id: string
          mojo_score: number | null
          provenance_type: string | null
          status: string
          summary_json: Json
          user_id: string
        }
        Insert: {
          artifacts_json?: Json
          baseline_run_id?: number | null
          company_id: string
          created_at?: string
          evidence_status?: string | null
          id?: string
          mojo_score?: number | null
          provenance_type?: string | null
          status?: string
          summary_json?: Json
          user_id: string
        }
        Update: {
          artifacts_json?: Json
          baseline_run_id?: number | null
          company_id?: string
          created_at?: string
          evidence_status?: string | null
          id?: string
          mojo_score?: number | null
          provenance_type?: string | null
          status?: string
          summary_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_artifact_runs_baseline_run_id_fkey"
            columns: ["baseline_run_id"]
            isOneToOne: false
            referencedRelation: "public_baseline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_artifact_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      research_review_runs: {
        Row: {
          baseline_run_id: number | null
          company_id: string
          created_at: string
          finalizer_applied: boolean
          id: string
          review_summary: string
          reviews_json: Json
          status: string
          user_id: string
        }
        Insert: {
          baseline_run_id?: number | null
          company_id: string
          created_at?: string
          finalizer_applied?: boolean
          id?: string
          review_summary?: string
          reviews_json?: Json
          status?: string
          user_id: string
        }
        Update: {
          baseline_run_id?: number | null
          company_id?: string
          created_at?: string
          finalizer_applied?: boolean
          id?: string
          review_summary?: string
          reviews_json?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_review_runs_baseline_run_id_fkey"
            columns: ["baseline_run_id"]
            isOneToOne: false
            referencedRelation: "public_baseline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_review_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      route_decision_events: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          route_id: string | null
          summary_json: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          route_id?: string | null
          summary_json?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          route_id?: string | null
          summary_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "route_decision_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      route_lens_refs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lens_id: string
          ref_state: string
          route_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lens_id: string
          ref_state?: string
          route_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lens_id?: string
          ref_state?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_lens_refs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_lens_refs_lens_id_fkey"
            columns: ["lens_id"]
            isOneToOne: false
            referencedRelation: "market_lens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_lens_refs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          category: string
          claim_id: string | null
          company_id: string
          confidence: number | null
          created_at: string
          dependency_state: string
          effort: string
          evidence_baseline_captured_at: string | null
          evidence_baseline_signal_ids: Json | null
          evidence_json: Json
          evidence_state: string
          frameworks_used: string[]
          id: string
          last_reviewed_at: string | null
          level: string
          linked_need_ids: string[] | null
          linked_tension_ids: string[] | null
          parent_id: string | null
          primary_desired_outcome_id: string | null
          provenance_type:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          pts_value: number
          rejected_alternatives: Json
          relevance_state: string
          route_insights_json: Json | null
          secondary_desired_outcome_ids: string[]
          short_description: string
          sort_order: number
          source: string
          source_file_ids: string[] | null
          source_run_id: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          steps_json: Json
          strategy_alignment: string | null
          strategy_alignment_evaluated_at: string | null
          strategy_alignment_reason: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          validation_state: string
          what_would_have_to_be_true: Json
          why_this_matters_json: Json
        }
        Insert: {
          category?: string
          claim_id?: string | null
          company_id: string
          confidence?: number | null
          created_at?: string
          dependency_state?: string
          effort?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          evidence_json?: Json
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          last_reviewed_at?: string | null
          level?: string
          linked_need_ids?: string[] | null
          linked_tension_ids?: string[] | null
          parent_id?: string | null
          primary_desired_outcome_id?: string | null
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          pts_value?: number
          rejected_alternatives?: Json
          relevance_state?: string
          route_insights_json?: Json | null
          secondary_desired_outcome_ids?: string[]
          short_description?: string
          sort_order?: number
          source?: string
          source_file_ids?: string[] | null
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          steps_json?: Json
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id: string
          validation_state?: string
          what_would_have_to_be_true?: Json
          why_this_matters_json?: Json
        }
        Update: {
          category?: string
          claim_id?: string | null
          company_id?: string
          confidence?: number | null
          created_at?: string
          dependency_state?: string
          effort?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          evidence_json?: Json
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          last_reviewed_at?: string | null
          level?: string
          linked_need_ids?: string[] | null
          linked_tension_ids?: string[] | null
          parent_id?: string | null
          primary_desired_outcome_id?: string | null
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          pts_value?: number
          rejected_alternatives?: Json
          relevance_state?: string
          route_insights_json?: Json | null
          secondary_desired_outcome_ids?: string[]
          short_description?: string
          sort_order?: number
          source?: string
          source_file_ids?: string[] | null
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          steps_json?: Json
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          validation_state?: string
          what_would_have_to_be_true?: Json
          why_this_matters_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "routes_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_primary_desired_outcome_id_fkey"
            columns: ["primary_desired_outcome_id"]
            isOneToOne: false
            referencedRelation: "desired_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_stale_since_event_id_fkey"
            columns: ["stale_since_event_id"]
            isOneToOne: false
            referencedRelation: "strategic_events"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_recurrence_verdicts: {
        Row: {
          candidate_basis: string
          company_id: string
          created_at: string
          id: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          signal_a_id: string
          signal_b_id: string
          statement_a_identity: string
          statement_b_identity: string
          verdict: string
        }
        Insert: {
          candidate_basis: string
          company_id: string
          created_at?: string
          id?: string
          judge_model: string
          judge_reason: string
          pair_identity: string
          signal_a_id: string
          signal_b_id: string
          statement_a_identity: string
          statement_b_identity: string
          verdict: string
        }
        Update: {
          candidate_basis?: string
          company_id?: string
          created_at?: string
          id?: string
          judge_model?: string
          judge_reason?: string
          pair_identity?: string
          signal_a_id?: string
          signal_b_id?: string
          statement_a_identity?: string
          statement_b_identity?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_recurrence_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          claim_text: string
          company_id: string
          confidence_to_use: string
          created_at: string
          directness: string
          event_date: string | null
          event_date_precision: string
          evidence_excerpt: string
          evidence_type: string
          framework: string | null
          framing_fit: string
          id: string
          quote: string | null
          quote_source_text: string | null
          raw_payload: Json
          recency: string | null
          relevance_state: string
          signal_band: string
          source_id: string | null
          source_title: string | null
          source_type: string
          source_url: string | null
          structure_level: string
          syndicated_from_client: boolean | null
          syndication_score: number | null
          topic: string | null
          updated_at: string
          validation_status: string
          voice_class: string | null
        }
        Insert: {
          claim_text: string
          company_id: string
          confidence_to_use?: string
          created_at?: string
          directness?: string
          event_date?: string | null
          event_date_precision?: string
          evidence_excerpt?: string
          evidence_type?: string
          framework?: string | null
          framing_fit?: string
          id?: string
          quote?: string | null
          quote_source_text?: string | null
          raw_payload?: Json
          recency?: string | null
          relevance_state?: string
          signal_band: string
          source_id?: string | null
          source_title?: string | null
          source_type: string
          source_url?: string | null
          structure_level?: string
          syndicated_from_client?: boolean | null
          syndication_score?: number | null
          topic?: string | null
          updated_at?: string
          validation_status?: string
          voice_class?: string | null
        }
        Update: {
          claim_text?: string
          company_id?: string
          confidence_to_use?: string
          created_at?: string
          directness?: string
          event_date?: string | null
          event_date_precision?: string
          evidence_excerpt?: string
          evidence_type?: string
          framework?: string | null
          framing_fit?: string
          id?: string
          quote?: string | null
          quote_source_text?: string | null
          raw_payload?: Json
          recency?: string | null
          relevance_state?: string
          signal_band?: string
          source_id?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          structure_level?: string
          syndicated_from_client?: boolean | null
          syndication_score?: number | null
          topic?: string | null
          updated_at?: string
          validation_status?: string
          voice_class?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      solution_ideas: {
        Row: {
          category: string
          company_id: string
          confidence: number
          created_at: string
          description: string
          effort: string
          frameworks_used: string[]
          id: string
          opportunity_id: string
          route_id: string | null
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          company_id: string
          confidence?: number
          created_at?: string
          description?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          opportunity_id: string
          route_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string
          confidence?: number
          created_at?: string
          description?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          opportunity_id?: string
          route_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solution_ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_ideas_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_ideas_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      solution_tests: {
        Row: {
          company_id: string
          created_at: string
          frameworks_used: string[]
          id: string
          method: string
          metric: string
          solution_idea_id: string
          sort_order: number
          success_threshold: string
          timebox: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          method?: string
          metric?: string
          solution_idea_id: string
          sort_order?: number
          success_threshold?: string
          timebox?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          method?: string
          metric?: string
          solution_idea_id?: string
          sort_order?: number
          success_threshold?: string
          timebox?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solution_tests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solution_tests_solution_idea_id_fkey"
            columns: ["solution_idea_id"]
            isOneToOne: false
            referencedRelation: "solution_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      step_perspective_verdicts: {
        Row: {
          company_id: string
          content_hash: string
          id: string
          judge_model: string
          judged_at: string
          step_label_excerpt: string
          verdict: string
        }
        Insert: {
          company_id: string
          content_hash: string
          id?: string
          judge_model: string
          judged_at?: string
          step_label_excerpt?: string
          verdict: string
        }
        Update: {
          company_id?: string
          content_hash?: string
          id?: string
          judge_model?: string
          judged_at?: string
          step_label_excerpt?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_perspective_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_decisions: {
        Row: {
          active_tension_ids: string[]
          affected_capabilities: string[]
          affected_job_steps: string[]
          affected_positioning: boolean
          blocked_by: string[]
          company_id: string
          confidence_movement: Json
          confidence_state: string
          contradicting_evidence: Json
          created_at: string
          current_posture: string | null
          decision_memory: Json
          decision_question: string
          decision_state: string
          id: string
          last_meaningful_change_at: string | null
          linked_claim_id: string | null
          source: string
          stale_dependencies: string[]
          supporting_evidence: Json
          supporting_hypothesis_ids: string[]
          title: string
          updated_at: string
          validation_requirements: Json
        }
        Insert: {
          active_tension_ids?: string[]
          affected_capabilities?: string[]
          affected_job_steps?: string[]
          affected_positioning?: boolean
          blocked_by?: string[]
          company_id: string
          confidence_movement?: Json
          confidence_state?: string
          contradicting_evidence?: Json
          created_at?: string
          current_posture?: string | null
          decision_memory?: Json
          decision_question: string
          decision_state?: string
          id?: string
          last_meaningful_change_at?: string | null
          linked_claim_id?: string | null
          source?: string
          stale_dependencies?: string[]
          supporting_evidence?: Json
          supporting_hypothesis_ids?: string[]
          title: string
          updated_at?: string
          validation_requirements?: Json
        }
        Update: {
          active_tension_ids?: string[]
          affected_capabilities?: string[]
          affected_job_steps?: string[]
          affected_positioning?: boolean
          blocked_by?: string[]
          company_id?: string
          confidence_movement?: Json
          confidence_state?: string
          contradicting_evidence?: Json
          created_at?: string
          current_posture?: string | null
          decision_memory?: Json
          decision_question?: string
          decision_state?: string
          id?: string
          last_meaningful_change_at?: string | null
          linked_claim_id?: string | null
          source?: string
          stale_dependencies?: string[]
          supporting_evidence?: Json
          supporting_hypothesis_ids?: string[]
          title?: string
          updated_at?: string
          validation_requirements?: Json
        }
        Relationships: [
          {
            foreignKeyName: "strategic_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_decisions_linked_claim_id_fkey"
            columns: ["linked_claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          company_id: string
          created_at: string
          event_type: string
          id: string
          new_value: Json | null
          object_id: string
          object_type: string
          previous_value: Json | null
          reason: string | null
          source_run_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          new_value?: Json | null
          object_id: string
          object_type: string
          previous_value?: Json | null
          reason?: string | null
          source_run_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_value?: Json | null
          object_id?: string
          object_type?: string
          previous_value?: Json | null
          reason?: string | null
          source_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategic_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_hypotheses: {
        Row: {
          company_id: string
          confidence: string
          created_at: string
          hypothesis_key: string
          hypothesis_kind: string
          hypothesis_state: string
          id: string
          is_active: boolean
          originating_context: string | null
          raw_payload: Json
          reframed_from_hypothesis_id: string | null
          reframed_reason: string | null
          source_run_id: string | null
          statement: string
          superseded_by_id: string | null
          topic: string | null
          updated_at: string
          validation_state: string
          what_must_be_true: Json
        }
        Insert: {
          company_id: string
          confidence?: string
          created_at?: string
          hypothesis_key: string
          hypothesis_kind: string
          hypothesis_state?: string
          id?: string
          is_active?: boolean
          originating_context?: string | null
          raw_payload?: Json
          reframed_from_hypothesis_id?: string | null
          reframed_reason?: string | null
          source_run_id?: string | null
          statement: string
          superseded_by_id?: string | null
          topic?: string | null
          updated_at?: string
          validation_state?: string
          what_must_be_true?: Json
        }
        Update: {
          company_id?: string
          confidence?: string
          created_at?: string
          hypothesis_key?: string
          hypothesis_kind?: string
          hypothesis_state?: string
          id?: string
          is_active?: boolean
          originating_context?: string | null
          raw_payload?: Json
          reframed_from_hypothesis_id?: string | null
          reframed_reason?: string | null
          source_run_id?: string | null
          statement?: string
          superseded_by_id?: string | null
          topic?: string | null
          updated_at?: string
          validation_state?: string
          what_must_be_true?: Json
        }
        Relationships: [
          {
            foreignKeyName: "strategic_hypotheses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_hypotheses_reframed_from_hypothesis_id_fkey"
            columns: ["reframed_from_hypothesis_id"]
            isOneToOne: false
            referencedRelation: "strategic_hypotheses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_hypotheses_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "strategic_hypotheses"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_tensions: {
        Row: {
          affected_needs: string[]
          affected_positioning: boolean
          affected_routes: string[]
          affected_strategy: boolean
          blocked_commitments: string[]
          company_id: string
          confidence: number
          created_at: string
          created_from: string
          current_interpretation: string | null
          detail: string | null
          id: string
          is_commitment_blocker: boolean
          pressure: string
          reframed_from: string | null
          resolution_signals: string[]
          source: string
          statement: string
          status: string
          updated_at: string
          validation_requirements: string[]
        }
        Insert: {
          affected_needs?: string[]
          affected_positioning?: boolean
          affected_routes?: string[]
          affected_strategy?: boolean
          blocked_commitments?: string[]
          company_id: string
          confidence?: number
          created_at?: string
          created_from?: string
          current_interpretation?: string | null
          detail?: string | null
          id?: string
          is_commitment_blocker?: boolean
          pressure?: string
          reframed_from?: string | null
          resolution_signals?: string[]
          source?: string
          statement: string
          status?: string
          updated_at?: string
          validation_requirements?: string[]
        }
        Update: {
          affected_needs?: string[]
          affected_positioning?: boolean
          affected_routes?: string[]
          affected_strategy?: boolean
          blocked_commitments?: string[]
          company_id?: string
          confidence?: number
          created_at?: string
          created_from?: string
          current_interpretation?: string | null
          detail?: string | null
          id?: string
          is_commitment_blocker?: boolean
          pressure?: string
          reframed_from?: string | null
          resolution_signals?: string[]
          source?: string
          statement?: string
          status?: string
          updated_at?: string
          validation_requirements?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "strategic_tensions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_tensions_reframed_from_fkey"
            columns: ["reframed_from"]
            isOneToOne: false
            referencedRelation: "strategic_tensions"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_assumptions: {
        Row: {
          assumption: string
          company_id: string
          created_at: string
          id: string
          note: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assumption: string
          company_id: string
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assumption?: string
          company_id?: string
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_assumptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_cascades: {
        Row: {
          artifact_role: string
          assumptions_json: Json
          capabilities_json: Json
          company_id: string
          confidence: number | null
          created_at: string
          evidence_baseline_captured_at: string | null
          evidence_baseline_signal_ids: Json | null
          frameworks_used: string[]
          how_to_win: string
          id: string
          management_systems_json: Json
          provenance_type:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source: string
          source_direction_key: string
          updated_at: string
          user_id: string
          where_to_play: string
          winning_aspiration: string
        }
        Insert: {
          artifact_role: string
          assumptions_json?: Json
          capabilities_json?: Json
          company_id: string
          confidence?: number | null
          created_at?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          frameworks_used?: string[]
          how_to_win?: string
          id?: string
          management_systems_json?: Json
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source?: string
          source_direction_key: string
          updated_at?: string
          user_id: string
          where_to_play?: string
          winning_aspiration?: string
        }
        Update: {
          artifact_role?: string
          assumptions_json?: Json
          capabilities_json?: Json
          company_id?: string
          confidence?: number | null
          created_at?: string
          evidence_baseline_captured_at?: string | null
          evidence_baseline_signal_ids?: Json | null
          frameworks_used?: string[]
          how_to_win?: string
          id?: string
          management_systems_json?: Json
          provenance_type?:
            | Database["public"]["Enums"]["provenance_type_enum"]
            | null
          source?: string
          source_direction_key?: string
          updated_at?: string
          user_id?: string
          where_to_play?: string
          winning_aspiration?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_cascades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_problem_statements: {
        Row: {
          company_id: string
          created_at: string
          id: string
          reconciliation_note: string | null
          source: string
          statement: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          reconciliation_note?: string | null
          source?: string
          statement: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          reconciliation_note?: string | null
          source?: string
          statement?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_problem_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_drift_assessments: {
        Row: {
          accepted_as_aligned_at: string | null
          assessment_basis: Json | null
          company_id: string
          created_at: string
          drift_score: number
          drift_state: string
          id: string
          last_assessed_at: string
          llm_confirmation: string | null
          operator_seen_at: string | null
          surface_id: string
          surface_type: string
        }
        Insert: {
          accepted_as_aligned_at?: string | null
          assessment_basis?: Json | null
          company_id: string
          created_at?: string
          drift_score: number
          drift_state: string
          id?: string
          last_assessed_at?: string
          llm_confirmation?: string | null
          operator_seen_at?: string | null
          surface_id: string
          surface_type: string
        }
        Update: {
          accepted_as_aligned_at?: string | null
          assessment_basis?: Json | null
          company_id?: string
          created_at?: string
          drift_score?: number
          drift_state?: string
          id?: string
          last_assessed_at?: string
          llm_confirmation?: string | null
          operator_seen_at?: string | null
          surface_id?: string
          surface_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_drift_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_educational_content: {
        Row: {
          audience: string
          created_at: string
          id: string
          is_published: boolean
          section_a_template: string | null
          section_b_content: string | null
          sort_order: number
          surface_key: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          is_published?: boolean
          section_a_template?: string | null
          section_b_content?: string | null
          sort_order?: number
          surface_key: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          is_published?: boolean
          section_a_template?: string | null
          section_b_content?: string | null
          sort_order?: number
          surface_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      surface_proposals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          current_state: Json
          id: string
          proposed_state: Json
          raw_payload: Json | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          surface_id: string | null
          surface_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          current_state?: Json
          id?: string
          proposed_state?: Json
          raw_payload?: Json | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          surface_id?: string | null
          surface_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_state?: Json
          id?: string
          proposed_state?: Json
          raw_payload?: Json | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          surface_id?: string | null
          surface_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "surface_proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      syndication_verdicts: {
        Row: {
          company_id: string
          created_at: string
          id: number
          method: string
          source_url: string
          syndicated: boolean
          syndication_score: number
          text_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: never
          method: string
          source_url: string
          syndicated: boolean
          syndication_score: number
          text_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: never
          method?: string
          source_url?: string
          syndicated?: boolean
          syndication_score?: number
          text_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "syndication_verdicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      test_removals: {
        Row: {
          action_id: string
          actor: string | null
          company_id: string
          expected_negative_signal: string | null
          expected_positive_signal: string | null
          hypothesis: string
          id: string
          leg_condition: string | null
          leg_title: string | null
          no_test_needed: boolean | null
          no_test_needed_reason: string | null
          parent_route_title: string | null
          reason_category: string
          removed_at: string
          result: string | null
          test_source: string | null
        }
        Insert: {
          action_id: string
          actor?: string | null
          company_id: string
          expected_negative_signal?: string | null
          expected_positive_signal?: string | null
          hypothesis: string
          id?: string
          leg_condition?: string | null
          leg_title?: string | null
          no_test_needed?: boolean | null
          no_test_needed_reason?: string | null
          parent_route_title?: string | null
          reason_category: string
          removed_at?: string
          result?: string | null
          test_source?: string | null
        }
        Update: {
          action_id?: string
          actor?: string | null
          company_id?: string
          expected_negative_signal?: string | null
          expected_positive_signal?: string | null
          hypothesis?: string
          id?: string
          leg_condition?: string | null
          leg_title?: string | null
          no_test_needed?: boolean | null
          no_test_needed_reason?: string | null
          parent_route_title?: string | null
          reason_category?: string
          removed_at?: string
          result?: string | null
          test_source?: string | null
        }
        Relationships: []
      }
      tests: {
        Row: {
          action_id: string
          company_id: string
          created_at: string
          evidence_refs: string[]
          expected_negative_signal: string
          expected_positive_signal: string
          hypothesis: string
          id: string
          no_test_needed: boolean
          no_test_needed_reason: string | null
          result: string | null
          source: string
          updated_at: string
        }
        Insert: {
          action_id: string
          company_id: string
          created_at?: string
          evidence_refs?: string[]
          expected_negative_signal: string
          expected_positive_signal: string
          hypothesis: string
          id?: string
          no_test_needed?: boolean
          no_test_needed_reason?: string | null
          result?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          company_id?: string
          created_at?: string
          evidence_refs?: string[]
          expected_negative_signal?: string
          expected_positive_signal?: string
          hypothesis?: string
          id?: string
          no_test_needed?: boolean
          no_test_needed_reason?: string | null
          result?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      derived_tensions_structural: {
        Row: {
          claim_id: string | null
          claim_type: string | null
          company_id: string | null
          route_id: string | null
          stale_reason: string | null
          state: string | null
          statement: string | null
          tension_type: string | null
          topic: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      find_primary_finding: {
        Args: { p_company_id: string }
        Returns: {
          beats: Json | null
          body: string
          company_id: string
          created_at: string
          id: string
          kind: string
          origin_run_id: number | null
          origin_signal_id: string | null
          register: string | null
          resolved_at: string | null
          status: string
          tone: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "findings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_capability: {
        Args: { _cap: string; _company_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      remove_claim: {
        Args: {
          p_actor?: string
          p_claim_id: string
          p_reason_category: string
        }
        Returns: undefined
      }
      remove_claim_delta_rejections: {
        Args: { p_ids: string[]; p_reason: string }
        Returns: number
      }
      remove_claims_bulk: {
        Args: {
          p_actor?: string
          p_claim_ids: string[]
          p_reason_category: string
        }
        Returns: number
      }
      remove_first_read_session: {
        Args: { p_reason: string; p_session_id: string }
        Returns: undefined
      }
      remove_test: {
        Args: { p_actor?: string; p_reason_category: string; p_test_id: string }
        Returns: undefined
      }
      remove_tests_for_leg_reroll: {
        Args: { p_actor?: string; p_leg_ids: string[] }
        Returns: number
      }
      resolve_primary_job_step_set: {
        Args: { p_company_id: string }
        Returns: string
      }
      set_claim_status: {
        Args: {
          p_actor?: string
          p_claim_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      shares_company_with: { Args: { _other: string }; Returns: boolean }
      trigger_scheduled_drift_scan: { Args: never; Returns: undefined }
      trigger_scheduled_mojo_analysis: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      input_group_key: "foundation" | "execution" | "market_evidence"
      input_impact_tier: "high" | "med" | "low" | "done"
      input_status: "complete" | "partial" | "gap" | "not_started"
      provenance_type_enum:
        | "public_research"
        | "framework_adjudicated"
        | "odi_survey"
        | "manual"
        | "internal_declared"
        | "internal_hypothesis"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      input_group_key: ["foundation", "execution", "market_evidence"],
      input_impact_tier: ["high", "med", "low", "done"],
      input_status: ["complete", "partial", "gap", "not_started"],
      provenance_type_enum: [
        "public_research",
        "framework_adjudicated",
        "odi_survey",
        "manual",
        "internal_declared",
        "internal_hypothesis",
      ],
    },
  },
} as const


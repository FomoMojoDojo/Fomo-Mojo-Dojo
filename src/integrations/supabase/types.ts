Connecting to db 5432
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
          raw_payload: Json
          revalidation_flag: boolean
          state: string
          statement: string
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
          raw_payload?: Json
          revalidation_flag?: boolean
          state?: string
          statement: string
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
          raw_payload?: Json
          revalidation_flag?: boolean
          state?: string
          statement?: string
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
          evidence_note: string | null
          evidence_status: string | null
          excluded_signals_json: Json
          human_decision: string | null
          id: string
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
          evidence_note?: string | null
          evidence_status?: string | null
          excluded_signals_json?: Json
          human_decision?: string | null
          id?: string
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
          evidence_note?: string | null
          evidence_status?: string | null
          excluded_signals_json?: Json
          human_decision?: string | null
          id?: string
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
        Relationships: []
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
      job_steps: {
        Row: {
          company_id: string
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
          frameworks_used: string[]
          id: string
          innovation_strategy: string | null
          job_executor: string
          journey_key: string
          jtbd: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          source_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chooser?: string
          company_id: string
          confidence?: number | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          innovation_strategy?: string | null
          job_executor?: string
          journey_key?: string
          jtbd?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          source_path?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chooser?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          innovation_strategy?: string | null
          job_executor?: string
          journey_key?: string
          jtbd?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
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
          step_label: string
          step_number: number
          strategy_alignment: string | null
          strategy_alignment_evaluated_at: string | null
          strategy_alignment_reason: string | null
          tier: string
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
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
          step_label?: string
          step_number?: number
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          tier?: string
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
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
          step_label?: string
          step_number?: number
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
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
      opportunities: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          managed_outcome_id: string | null
          opportunity_score: number
          outcome: string
          parent_opportunity_id: string | null
          priority_tier: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction: number
          step_label: string
          step_number: number
          updated_at: string
          user_id: string
          workflow_status: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          managed_outcome_id?: string | null
          opportunity_score?: number
          outcome?: string
          parent_opportunity_id?: string | null
          priority_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id: string
          workflow_status?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          managed_outcome_id?: string | null
          opportunity_score?: number
          outcome?: string
          parent_opportunity_id?: string | null
          priority_tier?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          satisfaction?: number
          step_label?: string
          step_number?: number
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
          market_category: string
          proposed_tagline: string
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          source: string
          strategy_alignment: string | null
          strategy_alignment_evaluated_at: string | null
          strategy_alignment_reason: string | null
          unique_attributes_json: Json
          updated_at: string
          user_id: string
          value_for_customer: string
        }
        Insert: {
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
          market_category?: string
          proposed_tagline?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          source?: string
          strategy_alignment?: string | null
          strategy_alignment_evaluated_at?: string | null
          strategy_alignment_reason?: string | null
          unique_attributes_json?: Json
          updated_at?: string
          user_id: string
          value_for_customer?: string
        }
        Update: {
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
          market_category?: string
          proposed_tagline?: string
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          source?: string
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
            isOneToOne: true
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
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
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
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
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
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
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
      signals: {
        Row: {
          claim_text: string
          company_id: string
          confidence_to_use: string
          created_at: string
          directness: string
          evidence_excerpt: string
          evidence_type: string
          framework: string | null
          framing_fit: string
          id: string
          raw_payload: Json
          recency: string | null
          relevance_state: string
          signal_band: string
          source_id: string | null
          source_title: string | null
          source_type: string
          source_url: string | null
          structure_level: string
          topic: string | null
          updated_at: string
          validation_status: string
        }
        Insert: {
          claim_text: string
          company_id: string
          confidence_to_use?: string
          created_at?: string
          directness?: string
          evidence_excerpt?: string
          evidence_type?: string
          framework?: string | null
          framing_fit?: string
          id?: string
          raw_payload?: Json
          recency?: string | null
          relevance_state?: string
          signal_band: string
          source_id?: string | null
          source_title?: string | null
          source_type: string
          source_url?: string | null
          structure_level?: string
          topic?: string | null
          updated_at?: string
          validation_status?: string
        }
        Update: {
          claim_text?: string
          company_id?: string
          confidence_to_use?: string
          created_at?: string
          directness?: string
          evidence_excerpt?: string
          evidence_type?: string
          framework?: string | null
          framing_fit?: string
          id?: string
          raw_payload?: Json
          recency?: string | null
          relevance_state?: string
          signal_band?: string
          source_id?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          structure_level?: string
          topic?: string | null
          updated_at?: string
          validation_status?: string
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
          affected_route_ids: string[]
          assumption: string
          company_id: string
          contradicting_evidence: Json
          created_at: string
          id: string
          invalidated_reason: string | null
          note: string | null
          prior_statement: string | null
          reframed_from_id: string | null
          related_tension_ids: string[]
          source: string
          status: string
          supporting_evidence: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          affected_route_ids?: string[]
          assumption: string
          company_id: string
          contradicting_evidence?: Json
          created_at?: string
          id?: string
          invalidated_reason?: string | null
          note?: string | null
          prior_statement?: string | null
          reframed_from_id?: string | null
          related_tension_ids?: string[]
          source?: string
          status?: string
          supporting_evidence?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          affected_route_ids?: string[]
          assumption?: string
          company_id?: string
          contradicting_evidence?: Json
          created_at?: string
          id?: string
          invalidated_reason?: string | null
          note?: string | null
          prior_statement?: string | null
          reframed_from_id?: string | null
          related_tension_ids?: string[]
          source?: string
          status?: string
          supporting_evidence?: Json
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
          {
            foreignKeyName: "strategy_assumptions_reframed_from_id_fkey"
            columns: ["reframed_from_id"]
            isOneToOne: false
            referencedRelation: "strategy_assumptions"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_cascades: {
        Row: {
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
          provenance_type: Database["public"]["Enums"]["provenance_type_enum"]
          source: string
          updated_at: string
          user_id: string
          where_to_play: string
          winning_aspiration: string
        }
        Insert: {
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
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          source?: string
          updated_at?: string
          user_id: string
          where_to_play?: string
          winning_aspiration?: string
        }
        Update: {
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
          provenance_type?: Database["public"]["Enums"]["provenance_type_enum"]
          source?: string
          updated_at?: string
          user_id?: string
          where_to_play?: string
          winning_aspiration?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_cascades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      ],
    },
  },
} as const

A new version of Supabase CLI is available: v2.101.0 (currently installed v2.90.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli

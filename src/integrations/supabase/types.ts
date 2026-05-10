export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          archetype: string
          area_scores_json: Json | null
          created_at: string
          created_by: string
          evidence_note: string | null
          evidence_status: string | null
          id: string
          last_scored_at: string | null
          last_updated: string
          mojo_score: number | null
          name: string
          potential_score: number | null
          projected_score: number | null
          public_source_filters_json: Json | null
          quarter: string
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
          id?: string
          last_scored_at?: string | null
          last_updated?: string
          mojo_score?: number | null
          name: string
          potential_score?: number | null
          projected_score?: number | null
          public_source_filters_json?: Json | null
          quarter?: string
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
          id?: string
          last_scored_at?: string | null
          last_updated?: string
          mojo_score?: number | null
          name?: string
          potential_score?: number | null
          projected_score?: number | null
          public_source_filters_json?: Json | null
          quarter?: string
          tier?: number
          website?: string | null
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
          relationship: string
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
          claim_type: string
          company_id: string
          confidence: string
          created_at: string
          customer_support_count: number
          id: string
          organization_support_count: number
          outside_support_count: number
          raw_payload: Json
          revalidation_flag: boolean
          statement: string
          topic: string | null
          triangulation_state: string
          updated_at: string
        }
        Insert: {
          claim_type: string
          company_id: string
          confidence?: string
          created_at?: string
          customer_support_count?: number
          id?: string
          organization_support_count?: number
          outside_support_count?: number
          raw_payload?: Json
          revalidation_flag?: boolean
          statement: string
          topic?: string | null
          triangulation_state?: string
          updated_at?: string
        }
        Update: {
          claim_type?: string
          company_id?: string
          confidence?: string
          created_at?: string
          customer_support_count?: number
          id?: string
          organization_support_count?: number
          outside_support_count?: number
          raw_payload?: Json
          revalidation_flag?: boolean
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
      signals: {
        Row: {
          claim_text: string
          company_id: string
          confidence_to_use: string
          created_at: string
          directness: string
          evidence_excerpt: string
          evidence_type: string
          framing_fit: string
          framework: string | null
          id: string
          raw_payload: Json
          recency: string | null
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
          framing_fit?: string
          framework?: string | null
          id?: string
          raw_payload?: Json
          recency?: string | null
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
          framing_fit?: string
          framework?: string | null
          id?: string
          raw_payload?: Json
          recency?: string | null
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
      input_files: {
        Row: {
          file_name: string
          file_path: string
          file_type: string
          id: string
          input_id: string
          tags: string[]
          uploaded_at: string
        }
        Insert: {
          file_name: string
          file_path: string
          file_type?: string
          id?: string
          input_id: string
          tags?: string[]
          uploaded_at?: string
        }
        Update: {
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          input_id?: string
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
          evidence_state: string
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
          evidence_state?: string
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
          evidence_state?: string
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
        ]
      }
      managed_outcomes: {
        Row: {
          company_id: string
          constraint: string | null
          confidence: number
          context: string
          created_at: string
          dependency_state: string
          direction: string
          evidence_state: string
          evidence_basis: string
          frameworks_used: string[]
          id: string
          is_primary: boolean
          journey_key: string
          last_reviewed_at: string | null
          leading_indicator: string
          metric: string
          object: string
          outcome_statement: string
          outcome_title: string
          source_run_id: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          target_direction: string
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          company_id: string
          constraint?: string | null
          confidence?: number
          context?: string
          created_at?: string
          dependency_state?: string
          direction?: string
          evidence_state?: string
          evidence_basis?: string
          frameworks_used?: string[]
          id?: string
          is_primary?: boolean
          journey_key?: string
          last_reviewed_at?: string | null
          leading_indicator?: string
          metric?: string
          object?: string
          outcome_statement?: string
          outcome_title?: string
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          target_direction?: string
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          company_id?: string
          constraint?: string | null
          confidence?: number
          context?: string
          created_at?: string
          dependency_state?: string
          direction?: string
          evidence_state?: string
          evidence_basis?: string
          frameworks_used?: string[]
          id?: string
          is_primary?: boolean
          journey_key?: string
          last_reviewed_at?: string | null
          leading_indicator?: string
          metric?: string
          object?: string
          outcome_statement?: string
          outcome_title?: string
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          target_direction?: string
          updated_at?: string
          user_id?: string
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "managed_outcomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      odi_market_definitions: {
        Row: {
          chooser: string
          company_id: string
          created_at: string
          frameworks_used: string[]
          id: string
          job_executor: string
          jtbd: string
          source_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chooser?: string
          company_id: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          job_executor?: string
          jtbd?: string
          source_path?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chooser?: string
          company_id?: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          job_executor?: string
          jtbd?: string
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
          created_at: string
          dependency_state: string
          desired_outcome: string
          evidence_state: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          last_reviewed_at: string | null
          notes: string | null
          opportunity_score: number
          social_extraction_json: Json | null
          sort_order: number
          satisfaction: number
          service_state: string
          source_path: string
          source_run_id: string | null
          source_url: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          step_label: string
          step_number: number
          tier: string
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dependency_state?: string
          desired_outcome?: string
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_reviewed_at?: string | null
          notes?: string | null
          opportunity_score?: number
          social_extraction_json?: Json | null
          sort_order?: number
          satisfaction?: number
          service_state?: string
          source_path?: string
          source_run_id?: string | null
          source_url?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          step_label?: string
          step_number?: number
          tier?: string
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dependency_state?: string
          desired_outcome?: string
          evidence_state?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          last_reviewed_at?: string | null
          notes?: string | null
          opportunity_score?: number
          social_extraction_json?: Json | null
          sort_order?: number
          satisfaction?: number
          service_state?: string
          source_path?: string
          source_run_id?: string | null
          source_url?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          step_label?: string
          step_number?: number
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
        ]
      }
      opportunities: {
        Row: {
          company_id: string
          created_at: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          managed_outcome_id: string | null
          parent_opportunity_id: string | null
          opportunity_score: number
          outcome: string
          priority_tier: string
          satisfaction: number
          step_label: string
          step_number: number
          updated_at: string
          user_id: string
          workflow_status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          managed_outcome_id?: string | null
          parent_opportunity_id?: string | null
          opportunity_score?: number
          outcome?: string
          priority_tier?: string
          satisfaction?: number
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id: string
          workflow_status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          managed_outcome_id?: string | null
          parent_opportunity_id?: string | null
          opportunity_score?: number
          outcome?: string
          priority_tier?: string
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
          id: string
          result_json: Json | null
          sources_json: Json | null
          website: string
        }
        Insert: {
          company_id: string
          company_name: string
          created_at?: string
          id?: string
          result_json?: Json | null
          sources_json?: Json | null
          website: string
        }
        Update: {
          company_id?: string
          company_name?: string
          created_at?: string
          id?: string
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
      research_artifact_runs: {
        Row: {
          artifacts_json: Json
          baseline_run_id: number | null
          company_id: string
          created_at: string
          evidence_status: string | null
          id: string
          mojo_score: number | null
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
      positioning_canvases: {
        Row: {
          best_fit_customers: string
          category_rationale: string
          company_id: string
          competitive_alternatives_json: Json
          created_at: string
          current_tagline: string
          frameworks_used: string[]
          id: string
          market_category: string
          proposed_tagline: string
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
          created_at?: string
          current_tagline?: string
          frameworks_used?: string[]
          id?: string
          market_category?: string
          proposed_tagline?: string
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
          created_at?: string
          current_tagline?: string
          frameworks_used?: string[]
          id?: string
          market_category?: string
          proposed_tagline?: string
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
      routes: {
        Row: {
          category: string
          company_id: string
          created_at: string
          dependency_state: string
          evidence_state: string
          effort: string
          frameworks_used: string[]
          id: string
          last_reviewed_at: string | null
          pts_value: number
          short_description: string
          sort_order: number
          source_run_id: string | null
          stale_reason: string | null
          stale_since_event_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          validation_state: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          dependency_state?: string
          evidence_state?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          last_reviewed_at?: string | null
          pts_value?: number
          short_description?: string
          sort_order?: number
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id: string
          validation_state?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          dependency_state?: string
          evidence_state?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          last_reviewed_at?: string | null
          pts_value?: number
          short_description?: string
          sort_order?: number
          source_run_id?: string | null
          stale_reason?: string | null
          stale_since_event_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          validation_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_company_id_fkey"
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
          raw_payload: Json
          reframed_from_hypothesis_id: string | null
          source_run_id: string | null
          statement: string
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
          raw_payload?: Json
          reframed_from_hypothesis_id?: string | null
          source_run_id?: string | null
          statement: string
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
          raw_payload?: Json
          reframed_from_hypothesis_id?: string | null
          source_run_id?: string | null
          statement?: string
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
      solution_tests: {
        Row: {
          company_id: string
          created_at: string
          frameworks_used: string[]
          id: string
          metric: string
          method: string
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
          metric?: string
          method?: string
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
          metric?: string
          method?: string
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
      strategy_cascades: {
        Row: {
          assumptions_json: Json
          capabilities_json: Json
          company_id: string
          created_at: string
          frameworks_used: string[]
          how_to_win: string
          id: string
          management_systems_json: Json
          updated_at: string
          user_id: string
          where_to_play: string
          winning_aspiration: string
        }
        Insert: {
          assumptions_json?: Json
          capabilities_json?: Json
          company_id: string
          created_at?: string
          frameworks_used?: string[]
          how_to_win?: string
          id?: string
          management_systems_json?: Json
          updated_at?: string
          user_id: string
          where_to_play?: string
          winning_aspiration?: string
        }
        Update: {
          assumptions_json?: Json
          capabilities_json?: Json
          company_id?: string
          created_at?: string
          frameworks_used?: string[]
          how_to_win?: string
          id?: string
          management_systems_json?: Json
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      input_group_key: "foundation" | "execution" | "market_evidence"
      input_impact_tier: "high" | "med" | "low" | "done"
      input_status: "complete" | "partial" | "gap" | "not_started"
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
    },
  },
} as const

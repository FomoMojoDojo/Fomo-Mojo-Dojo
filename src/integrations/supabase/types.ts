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
          description: string
          designed: boolean
          frameworks_used: string[]
          gap_note: string
          has_gap: boolean
          id: string
          journey_key: string
          journey_subtitle: string
          journey_title: string
          step_label: string
          step_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string
          designed?: boolean
          frameworks_used?: string[]
          gap_note?: string
          has_gap?: boolean
          id?: string
          journey_key?: string
          journey_subtitle?: string
          journey_title?: string
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          designed?: boolean
          frameworks_used?: string[]
          gap_note?: string
          has_gap?: boolean
          id?: string
          journey_key?: string
          journey_subtitle?: string
          journey_title?: string
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id?: string
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
          confidence: number
          created_at: string
          evidence_basis: string
          frameworks_used: string[]
          id: string
          journey_key: string
          leading_indicator: string
          outcome_statement: string
          outcome_title: string
          target_direction: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          evidence_basis?: string
          frameworks_used?: string[]
          id?: string
          journey_key?: string
          leading_indicator?: string
          outcome_statement?: string
          outcome_title?: string
          target_direction?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          evidence_basis?: string
          frameworks_used?: string[]
          id?: string
          journey_key?: string
          leading_indicator?: string
          outcome_statement?: string
          outcome_title?: string
          target_direction?: string
          updated_at?: string
          user_id?: string
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
          desired_outcome: string
          frameworks_used: string[]
          id: string
          importance: number
          journey_key: string
          opportunity_score: number
          sort_order: number
          satisfaction: number
          service_state: string
          source_path: string
          step_label: string
          step_number: number
          tier: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          desired_outcome?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          opportunity_score?: number
          sort_order?: number
          satisfaction?: number
          service_state?: string
          source_path?: string
          step_label?: string
          step_number?: number
          tier?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          desired_outcome?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          opportunity_score?: number
          sort_order?: number
          satisfaction?: number
          service_state?: string
          source_path?: string
          step_label?: string
          step_number?: number
          tier?: string
          user_id?: string
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
          opportunity_score: number
          outcome: string
          priority_tier: string
          satisfaction: number
          step_label: string
          step_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          opportunity_score?: number
          outcome?: string
          priority_tier?: string
          satisfaction?: number
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          frameworks_used?: string[]
          id?: string
          importance?: number
          journey_key?: string
          opportunity_score?: number
          outcome?: string
          priority_tier?: string
          satisfaction?: number
          step_label?: string
          step_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
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
          effort: string
          frameworks_used: string[]
          id: string
          pts_value: number
          short_description: string
          sort_order: number
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          pts_value?: number
          short_description?: string
          sort_order?: number
          title?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          effort?: string
          frameworks_used?: string[]
          id?: string
          pts_value?: number
          short_description?: string
          sort_order?: number
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
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

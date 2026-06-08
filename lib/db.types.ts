/**
 * Supabase Postgres schema types for the SDR agent.
 *
 * NOTE — hand-written from the source-of-truth migration files under
 * supabase/migrations/. This is a temporary measure for Checkpoint 2
 * because the hosted Supabase MCP could not be reached from this
 * Claude Code on the web session to run `generate_typescript_types`.
 *
 * TODO: regenerate this file from Supabase Studio (Project Settings →
 * API → "Generate TypeScript types") at the first opportunity and
 * replace this hand-written version wholesale. See docs/decisions/
 * 0002-mcp-installation.md for the full context.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProspectStatus =
  | "new"
  | "surfaced"
  | "sent"
  | "replied"
  | "qualified"
  | "dead"
  | "opted_out"
  | "ignored";

export type ActionActor = "system" | "kyle";

export type GreenfieldFlag =
  | "sole_independent"
  | "standard"
  | "serial_operator"
  | "group_subsidiary"
  | "unknown";

export type PscStatus = "present" | "none_filed" | "unknown";

export interface Database {
  public: {
    Tables: {
      companies_house_raw: {
        Row: {
          id: string;
          company_number: string;
          fetched_at: string;
          raw_data: Json;
        };
        Insert: {
          id?: string;
          company_number: string;
          fetched_at?: string;
          raw_data: Json;
        };
        Update: {
          id?: string;
          company_number?: string;
          fetched_at?: string;
          raw_data?: Json;
        };
        Relationships: [];
      };
      prospects: {
        Row: {
          id: string;
          company_number: string;
          company_name: string;
          sic_code: string;
          sic_description: string | null;
          sic_tier: number;
          fit_weight: number;
          postcode: string;
          registered_address: string | null;
          incorporated_on: string | null;
          director_name: string | null;
          director_email: string | null;
          has_website: boolean | null;
          website_url: string | null;
          facebook_url: string | null;
          maps_place_id: string | null;
          observable_signal: string | null;
          personalised_email_subject: string | null;
          personalised_email_body: string | null;
          ranking_score: number | null;
          ranking_reasoning: string | null;
          status: ProspectStatus;
          surfaced_in_digest_at: string | null;
          apollo_attempted_at: string | null;
          director_officer_id: string | null;
          psc_corporate_count: number | null;
          psc_individual_count: number | null;
          psc_total_count: number | null;
          psc_status: PscStatus | null;
          director_active_appointments: number | null;
          within_pool_director_count: number | null;
          signals_attempted_at: string | null;
          greenfield_flag: GreenfieldFlag | null;
          starred: boolean;
          last_action_at: string | null;
          last_action_by: ActionActor | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_number: string;
          company_name: string;
          sic_code: string;
          sic_description?: string | null;
          sic_tier: number;
          fit_weight: number;
          postcode: string;
          registered_address?: string | null;
          incorporated_on?: string | null;
          director_name?: string | null;
          director_email?: string | null;
          has_website?: boolean | null;
          website_url?: string | null;
          facebook_url?: string | null;
          maps_place_id?: string | null;
          observable_signal?: string | null;
          personalised_email_subject?: string | null;
          personalised_email_body?: string | null;
          ranking_score?: number | null;
          ranking_reasoning?: string | null;
          status?: ProspectStatus;
          surfaced_in_digest_at?: string | null;
          apollo_attempted_at?: string | null;
          director_officer_id?: string | null;
          psc_corporate_count?: number | null;
          psc_individual_count?: number | null;
          psc_total_count?: number | null;
          psc_status?: PscStatus | null;
          director_active_appointments?: number | null;
          within_pool_director_count?: number | null;
          signals_attempted_at?: string | null;
          greenfield_flag?: GreenfieldFlag | null;
          starred?: boolean;
          last_action_at?: string | null;
          last_action_by?: ActionActor | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_number?: string;
          company_name?: string;
          sic_code?: string;
          sic_description?: string | null;
          sic_tier?: number;
          fit_weight?: number;
          postcode?: string;
          registered_address?: string | null;
          incorporated_on?: string | null;
          director_name?: string | null;
          director_email?: string | null;
          has_website?: boolean | null;
          website_url?: string | null;
          facebook_url?: string | null;
          maps_place_id?: string | null;
          observable_signal?: string | null;
          personalised_email_subject?: string | null;
          personalised_email_body?: string | null;
          ranking_score?: number | null;
          ranking_reasoning?: string | null;
          status?: ProspectStatus;
          surfaced_in_digest_at?: string | null;
          apollo_attempted_at?: string | null;
          director_officer_id?: string | null;
          psc_corporate_count?: number | null;
          psc_individual_count?: number | null;
          psc_total_count?: number | null;
          psc_status?: PscStatus | null;
          director_active_appointments?: number | null;
          within_pool_director_count?: number | null;
          signals_attempted_at?: string | null;
          greenfield_flag?: GreenfieldFlag | null;
          starred?: boolean;
          last_action_at?: string | null;
          last_action_by?: ActionActor | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospects_company_number_fkey";
            columns: ["company_number"];
            referencedRelation: "companies_house_raw";
            referencedColumns: ["company_number"];
          },
        ];
      };
      digests: {
        Row: {
          id: string;
          sent_at: string;
          prospect_ids: string[];
          candidate_count: number;
          delivered_to: string;
        };
        Insert: {
          id?: string;
          sent_at?: string;
          prospect_ids: string[];
          candidate_count: number;
          delivered_to: string;
        };
        Update: {
          id?: string;
          sent_at?: string;
          prospect_ids?: string[];
          candidate_count?: number;
          delivered_to?: string;
        };
        Relationships: [];
      };
      cron_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          kind: "prepare" | "digest" | "manual";
          status: "ok" | "partial" | "failed";
          summary: Json;
          errors: Json | null;
          duration_ms: number | null;
        };
        Insert: {
          id?: string;
          started_at: string;
          finished_at?: string | null;
          kind: "prepare" | "digest" | "manual";
          status: "ok" | "partial" | "failed";
          summary: Json;
          errors?: Json | null;
          duration_ms?: number | null;
        };
        Update: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          kind?: "prepare" | "digest" | "manual";
          status?: "ok" | "partial" | "failed";
          summary?: Json;
          errors?: Json | null;
          duration_ms?: number | null;
        };
        Relationships: [];
      };
      prospect_notes: {
        Row: {
          id: string;
          prospect_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospect_notes_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      prospect_sends: {
        Row: {
          id: string;
          prospect_id: string;
          sent_at: string;
          channel: string;
          subject: string | null;
          body: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          sent_at?: string;
          channel?: string;
          subject?: string | null;
          body?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          prospect_id?: string;
          sent_at?: string;
          channel?: string;
          subject?: string | null;
          body?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prospect_sends_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      prospect_replies: {
        Row: {
          id: string;
          prospect_id: string;
          received_at: string;
          body: string | null;
          sentiment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          received_at?: string;
          body?: string | null;
          sentiment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prospect_id?: string;
          received_at?: string;
          body?: string | null;
          sentiment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prospect_replies_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
      suppression_list: {
        Row: {
          email: string;
          reason: string;
          added_at: string;
          notes: string | null;
        };
        Insert: {
          email: string;
          reason: string;
          added_at?: string;
          notes?: string | null;
        };
        Update: {
          email?: string;
          reason?: string;
          added_at?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      prospect_status_transitions: {
        Row: {
          id: string;
          prospect_id: string;
          from_status: ProspectStatus | null;
          to_status: ProspectStatus;
          changed_at: string;
          changed_by: ActionActor;
        };
        Insert: {
          id?: string;
          prospect_id: string;
          from_status?: ProspectStatus | null;
          to_status: ProspectStatus;
          changed_at?: string;
          changed_by: ActionActor;
        };
        Update: {
          id?: string;
          prospect_id?: string;
          from_status?: ProspectStatus | null;
          to_status?: ProspectStatus;
          changed_at?: string;
          changed_by?: ActionActor;
        };
        Relationships: [
          {
            foreignKeyName: "prospect_status_transitions_prospect_id_fkey";
            columns: ["prospect_id"];
            referencedRelation: "prospects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

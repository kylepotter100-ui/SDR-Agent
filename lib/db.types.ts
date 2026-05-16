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
  | "contacted"
  | "replied"
  | "qualified"
  | "dead"
  | "ignored";

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

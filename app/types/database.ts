export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      raw_questions: {
        Row: {
          id: string
          content: string
          source: string
          source_url: string
          company: string | null
          question_type: string | null
          metadata: Json | null
          scraped_at: string
          published_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          content: string
          source: string
          source_url: string
          company?: string | null
          question_type?: string | null
          metadata?: Json | null
          scraped_at?: string
          published_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          content?: string
          source?: string
          source_url?: string
          company?: string | null
          question_type?: string | null
          metadata?: Json | null
          scraped_at?: string
          published_at?: string | null
          created_at?: string
        }
      }
      merged_questions: {
        Row: {
          id: string
          canonical_content: string
          frequency: number
          question_type: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          canonical_content: string
          frequency?: number
          question_type?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          canonical_content?: string
          frequency?: number
          question_type?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      question_mappings: {
        Row: {
          raw_question_id: string
          merged_question_id: string
          similarity_score: number | null
        }
        Insert: {
          raw_question_id: string
          merged_question_id: string
          similarity_score?: number | null
        }
        Update: {
          raw_question_id?: string
          merged_question_id?: string
          similarity_score?: number | null
        }
      }
      companies: {
        Row: {
          id: string
          name: string
          type: string | null
          industry: string | null
          logo_url: string | null
        }
        Insert: {
          id?: string
          name: string
          type?: string | null
          industry?: string | null
          logo_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          type?: string | null
          industry?: string | null
          logo_url?: string | null
        }
      }
      question_companies: {
        Row: {
          merged_question_id: string
          company_id: string
        }
        Insert: {
          merged_question_id: string
          company_id: string
        }
        Update: {
          merged_question_id?: string
          company_id?: string
        }
      }
      video_summaries: {
        Row: {
          id: string
          video_id: string
          summary_text: string
          relevance_score: number | null
          relevance_category: string | null
          model_used: string | null
          summarized_at: string
        }
        Insert: {
          id?: string
          video_id: string
          summary_text: string
          relevance_score?: number | null
          relevance_category?: string | null
          model_used?: string | null
          summarized_at?: string
        }
        Update: {
          id?: string
          video_id?: string
          summary_text?: string
          relevance_score?: number | null
          relevance_category?: string | null
          model_used?: string | null
          summarized_at?: string
        }
      }
      sample_answers: {
        Row: {
          id: string
          question_id: string
          answer_text: string
          source_videos: Json
          generated_at: string
          model_used: string | null
        }
        Insert: {
          id?: string
          question_id: string
          answer_text: string
          source_videos?: Json
          generated_at?: string
          model_used?: string | null
        }
        Update: {
          id?: string
          question_id?: string
          answer_text?: string
          source_videos?: Json
          generated_at?: string
          model_used?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

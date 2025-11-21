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
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          created_at?: string
        }
      }
      sources: {
        Row: {
          id: string
          project_id: string
          name: string
          type: string
          storage_path: string
          extracted_content: string | null
          metadata: Json | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          type: string
          storage_path: string
          extracted_content?: string | null
          metadata?: Json | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          type?: string
          storage_path?: string
          extracted_content?: string | null
          metadata?: Json | null
          status?: string
          created_at?: string
        }
      }
      questions: {
        Row: {
          id: string
          project_id: string
          source_id: string | null
          pergunta: string
          opcoes: Json
          resposta_correta: string
          dica: string | null
          justificativa: string | null
          topico: string | null
          dificuldade: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_id?: string | null
          pergunta: string
          opcoes: Json
          resposta_correta: string
          dica?: string | null
          justificativa?: string | null
          topico?: string | null
          dificuldade?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          source_id?: string | null
          pergunta?: string
          opcoes?: Json
          resposta_correta?: string
          dica?: string | null
          justificativa?: string | null
          topico?: string | null
          dificuldade?: string
          created_at?: string
        }
      }
      flashcards: {
        Row: {
          id: string
          project_id: string
          source_id: string | null
          frente: string
          verso: string
          topico: string | null
          dificuldade: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_id?: string | null
          frente: string
          verso: string
          topico?: string | null
          dificuldade?: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          source_id?: string | null
          frente?: string
          verso?: string
          topico?: string | null
          dificuldade?: string
          created_at?: string
        }
      }
      summaries: {
        Row: {
          id: string
          project_id: string
          titulo: string
          conteudo_html: string
          topicos: Json | null
          source_ids: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          titulo: string
          conteudo_html: string
          topicos?: Json | null
          source_ids?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          titulo?: string
          conteudo_html?: string
          topicos?: Json | null
          source_ids?: Json | null
          created_at?: string
        }
      }
      progress: {
        Row: {
          id: string
          user_id: string
          question_id: string | null
          flashcard_id: string | null
          acertou: boolean | null
          clicou_nao_sei: boolean
          tempo_resposta: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          question_id?: string | null
          flashcard_id?: string | null
          acertou?: boolean | null
          clicou_nao_sei?: boolean
          tempo_resposta?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          question_id?: string | null
          flashcard_id?: string | null
          acertou?: boolean | null
          clicou_nao_sei?: boolean
          tempo_resposta?: number | null
          created_at?: string
        }
      }
      difficulties: {
        Row: {
          id: string
          user_id: string
          project_id: string
          topico: string
          tipo_origem: string
          nivel: number
          resolvido: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          topico: string
          tipo_origem: string
          nivel?: number
          resolvido?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          topico?: string
          tipo_origem?: string
          nivel?: number
          resolvido?: boolean
          created_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: string
          content: string
          sources_cited: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role: string
          content: string
          sources_cited?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          role?: string
          content?: string
          sources_cited?: Json | null
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          response_language: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          response_language?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          response_language?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
      }
      token_usage_logs: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          operation_type: 'embedding' | 'chat' | 'quiz' | 'flashcard' | 'summary'
          tokens_input: number
          tokens_output: number
          cost_usd: number
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          operation_type: 'embedding' | 'chat' | 'quiz' | 'flashcard' | 'summary'
          tokens_input?: number
          tokens_output?: number
          cost_usd?: number
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          operation_type?: 'embedding' | 'chat' | 'quiz' | 'flashcard' | 'summary'
          tokens_input?: number
          tokens_output?: number
          cost_usd?: number
          metadata?: Json
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      get_token_usage_by_user: {
        Args: {
          start_date?: string
          end_date?: string
        }
        Returns: {
          user_id: string
          user_email: string
          display_name: string
          total_tokens: number
          total_input_tokens: number
          total_output_tokens: number
          total_cost_usd: number
          total_cost_brl: number
          operation_counts: Json
        }[]
      }
      get_token_usage_by_project: {
        Args: {
          target_user_id: string
          start_date?: string
          end_date?: string
        }
        Returns: {
          project_id: string
          project_name: string
          total_tokens: number
          total_input_tokens: number
          total_output_tokens: number
          total_cost_usd: number
          total_cost_brl: number
          operation_counts: Json
        }[]
      }
      get_daily_usage: {
        Args: {
          start_date?: string
          end_date?: string
          target_user_id?: string
        }
        Returns: {
          date: string
          total_tokens: number
          total_input_tokens: number
          total_output_tokens: number
          total_cost_usd: number
          total_cost_brl: number
          unique_users: number
        }[]
      }
      get_token_usage_summary: {
        Args: {
          start_date?: string
          end_date?: string
        }
        Returns: {
          total_tokens: number
          total_cost_usd: number
          total_cost_brl: number
          active_users: number
          total_operations: number
          avg_tokens_per_operation: number
          most_used_operation: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

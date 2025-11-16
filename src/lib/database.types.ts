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

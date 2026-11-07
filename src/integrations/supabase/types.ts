export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      conversations: {
        Row: { id: string; user_id: string; title: string; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; title?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; title?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      chat_messages: {
        Row: { id: string; conversation_id: string; user_id: string; role: "user" | "assistant"; content: string; created_at: string };
        Insert: { id?: string; conversation_id: string; user_id: string; role: "user" | "assistant"; content: string; created_at?: string };
        Update: { id?: string; conversation_id?: string; user_id?: string; role?: "user" | "assistant"; content?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "chat_messages_conversation_id_fkey"; columns: ["conversation_id"]; isOneToOne: false; referencedRelation: "conversations"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
type DefaultSchema = Database["public"];
export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"];
export const Constants = { public: { Enums: {} } } as const;

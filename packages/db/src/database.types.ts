/**
 * ATENÇÃO: escrito à mão no formato do gerador, porque o Supabase local não subiu na máquina
 * em que o passo 2 foi feito. Na primeira vez que `npm run db:start` funcionar, rode
 * `npm run db:types` — o arquivo gerado substitui este e deve ser equivalente.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id: string;
          name: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      username_base: { Args: { source: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

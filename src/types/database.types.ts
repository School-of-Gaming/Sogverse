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
      games: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      parent_gamer: {
        Row: {
          created_at: string | null
          gamer_id: string
          id: string
          parent_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string | null
          gamer_id: string
          id?: string
          parent_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string | null
          gamer_id?: string
          id?: string
          parent_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_gamer_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_gamer_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          created_by: string
          currency: string | null
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id: string
          image_url: string
          is_active: boolean | null
          max_age: number
          min_age: number
          name: string
          price: number
          start_time: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          currency?: string | null
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id?: string
          image_url: string
          is_active?: boolean | null
          max_age: number
          min_age: number
          name: string
          price: number
          start_time: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          currency?: string | null
          day_of_week?: number
          description?: string
          duration_minutes?: number
          game_id?: string
          id?: string
          image_url?: string
          is_active?: boolean | null
          max_age?: number
          min_age?: number
          name?: string
          price?: number
          start_time?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          token_balance: number
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          token_balance?: number
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          token_balance?: number
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          admin_id: string | null
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          type: Database["public"]["Enums"]["token_transaction_type"]
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          type: Database["public"]["Enums"]["token_transaction_type"]
          user_id: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          type?: Database["public"]["Enums"]["token_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_rooms: {
        Row: {
          closed_at: string | null
          created_at: string
          creator_id: string
          daily_room_name: string
          id: string
          name: string
          opened_at: string | null
          status: Database["public"]["Enums"]["voice_room_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          creator_id: string
          daily_room_name: string
          id?: string
          name: string
          opened_at?: string | null
          status?: Database["public"]["Enums"]["voice_room_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          creator_id?: string
          daily_room_name?: string
          id?: string
          name?: string
          opened_at?: string | null
          status?: Database["public"]["Enums"]["voice_room_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_rooms_gedu_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_token_balance: {
        Args: {
          p_admin_id?: string
          p_amount: number
          p_description?: string
          p_stripe_session_id?: string
          p_stripe_subscription_id?: string
          p_type: Database["public"]["Enums"]["token_transaction_type"]
          p_user_id: string
        }
        Returns: {
          new_balance: number
          transaction_id: string
        }[]
      }
      get_active_products: {
        Args: never
        Returns: {
          created_at: string | null
          created_by: string
          currency: string | null
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id: string
          image_url: string
          is_active: boolean | null
          max_age: number
          min_age: number
          name: string
          price: number
          start_time: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          timezone: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_gamers: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          token_balance: number
          updated_at: string | null
          username: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_parents: {
        Args: never
        Returns: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          token_balance: number
          updated_at: string | null
          username: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_open_voice_rooms: {
        Args: never
        Returns: {
          creator_display_name: string
          creator_id: string
          creator_role: string
          daily_room_name: string
          id: string
          name: string
          opened_at: string
          status: Database["public"]["Enums"]["voice_room_status"]
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_parent_of: { Args: { gamer_uuid: string }; Returns: boolean }
    }
    Enums: {
      token_transaction_type: "purchase" | "subscription" | "admin_adjustment"
      user_role: "admin" | "customer" | "gamer" | "gedu"
      voice_room_status: "open" | "closed"
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
      token_transaction_type: ["purchase", "subscription", "admin_adjustment"],
      user_role: ["admin", "customer", "gamer", "gedu"],
      voice_room_status: ["open", "closed"],
    },
  },
} as const

// Convenience type aliases
export type UserRole = Database["public"]["Enums"]["user_role"];
export type TokenTransactionType = Database["public"]["Enums"]["token_transaction_type"];

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type ParentGamer = Database["public"]["Tables"]["parent_gamer"]["Row"];
export type ParentGamerInsert = Database["public"]["Tables"]["parent_gamer"]["Insert"];

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type Game = Database["public"]["Tables"]["games"]["Row"];
export type GameInsert = Database["public"]["Tables"]["games"]["Insert"];

export type TokenTransaction = Database["public"]["Tables"]["token_transactions"]["Row"];

export type VoiceRoom = Database["public"]["Tables"]["voice_rooms"]["Row"];
export type VoiceRoomInsert = Database["public"]["Tables"]["voice_rooms"]["Insert"];
export type VoiceRoomUpdate = Database["public"]["Tables"]["voice_rooms"]["Update"];
export type VoiceRoomStatus = Database["public"]["Enums"]["voice_room_status"];
export type OpenVoiceRoom = Database["public"]["Functions"]["get_open_voice_rooms"]["Returns"][number];

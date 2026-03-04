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
      customer_profiles: {
        Row: {
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          token_balance: number
          user_id: string
        }
        Insert: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          token_balance?: number
          user_id: string
        }
        Update: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          token_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_charges: {
        Row: {
          amount: number
          charged_at: string
          enrollment_id: string
          id: string
          refund_transaction_id: string | null
          refunded_at: string | null
          session_date: string
          transaction_id: string
        }
        Insert: {
          amount: number
          charged_at?: string
          enrollment_id: string
          id?: string
          refund_transaction_id?: string | null
          refunded_at?: string | null
          session_date: string
          transaction_id: string
        }
        Update: {
          amount?: number
          charged_at?: string
          enrollment_id?: string
          id?: string
          refund_transaction_id?: string | null
          refunded_at?: string | null
          session_date?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_charges_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "group_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charges_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "token_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_charges_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "token_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gamer_profiles: {
        Row: {
          date_of_birth: string
          gender: Database["public"]["Enums"]["gender_type"]
          user_id: string
        }
        Insert: {
          date_of_birth: string
          gender: Database["public"]["Enums"]["gender_type"]
          user_id: string
        }
        Update: {
          date_of_birth?: string
          gender?: Database["public"]["Enums"]["gender_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      group_enrollments: {
        Row: {
          created_at: string
          enrolled_by: string
          gamer_id: string
          group_id: string
          id: string
          last_charged_at: string | null
          status: string
          unenrolled_at: string | null
        }
        Insert: {
          created_at?: string
          enrolled_by: string
          gamer_id: string
          group_id: string
          id?: string
          last_charged_at?: string | null
          status?: string
          unenrolled_at?: string | null
        }
        Update: {
          created_at?: string
          enrolled_by?: string
          gamer_id?: string
          group_id?: string
          id?: string
          last_charged_at?: string | null
          status?: string
          unenrolled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_enrollments_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_enrollments_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
        ]
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
      product_groups: {
        Row: {
          created_at: string
          display_order: number
          gedu_id: string
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          gedu_id: string
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          gedu_id?: string
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          created_by: string
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id: string
          image_url: string
          is_visible: boolean | null
          max_age: number
          min_age: number
          name: string
          start_time: string
          timezone: string
          token_cost: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id?: string
          image_url: string
          is_visible?: boolean | null
          max_age: number
          min_age: number
          name: string
          start_time: string
          timezone?: string
          token_cost: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          day_of_week?: number
          description?: string
          duration_minutes?: number
          game_id?: string
          id?: string
          image_url?: string
          is_visible?: boolean | null
          max_age?: number
          min_age?: number
          name?: string
          start_time?: string
          timezone?: string
          token_cost?: number
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
          created_at: string
          currency: string | null
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          display_name: string
          email?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          display_name?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
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
          currency: string | null
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
          currency?: string | null
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
          currency?: string | null
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
      _list_cron_jobs: {
        Args: never
        Returns: {
          command: string
          jobname: string
          schedule: string
        }[]
      }
      _list_rpc_access: {
        Args: never
        Returns: {
          anon_access: boolean
          authenticated_access: boolean
          function_name: string
        }[]
      }
      _list_tables_without_rls: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      adjust_token_balance: {
        Args: {
          p_admin_id?: string
          p_amount: number
          p_currency?: string
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
      commit_group_changes: {
        Args: {
          p_added_groups?: Json
          p_deleted_group_ids?: string[]
          p_enrollment_moves?: Json
          p_product_id: string
          p_updated_groups?: Json
        }
        Returns: Json
      }
      compute_next_session: {
        Args: {
          p_day_of_week: number
          p_start_time: string
          p_timezone: string
        }
        Returns: string
      }
      enroll_gamer_in_group: {
        Args: {
          p_customer_id: string
          p_gamer_id: string
          p_group_id: string
          p_session_date: string
        }
        Returns: {
          enrollment_id: string
          new_balance: number
          transaction_id: string
        }[]
      }
      get_customer_enrollments: {
        Args: { p_customer_id: string }
        Returns: {
          enrolled_at: string
          enrollment_id: string
          gamer_display_name: string
          gamer_id: string
          gedu_display_name: string
          group_id: string
          last_charge_session_date: string
          last_charged_at: string
          product_day_of_week: number
          product_duration_minutes: number
          product_id: string
          product_image_url: string
          product_name: string
          product_start_time: string
          product_timezone: string
          product_token_cost: number
          status: string
          unenrolled_at: string
        }[]
      }
      get_enrollment_groups: {
        Args: { p_product_id: string }
        Returns: {
          gamer_count: number
          gedu_display_name: string
          group_id: string
          max_gamer_age: number
          min_gamer_age: number
        }[]
      }
      get_my_gamers: {
        Args: never
        Returns: {
          created_at: string
          currency: string | null
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
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
          created_at: string
          currency: string | null
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
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
      get_product_groups_with_details: {
        Args: { p_product_id: string }
        Returns: {
          display_order: number
          enrollment_id: string
          gamer_date_of_birth: string
          gamer_display_name: string
          gamer_gender: Database["public"]["Enums"]["gender_type"]
          gamer_id: string
          gedu_display_name: string
          gedu_email: string
          gedu_id: string
          group_id: string
          product_id: string
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_visible_products: {
        Args: never
        Returns: {
          created_at: string | null
          created_by: string
          day_of_week: number
          description: string
          duration_minutes: number
          game_id: string
          id: string
          image_url: string
          is_visible: boolean | null
          max_age: number
          min_age: number
          name: string
          start_time: string
          timezone: string
          token_cost: number
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_parent_of: { Args: { gamer_uuid: string }; Returns: boolean }
      process_enrollment_charges: { Args: never; Returns: Json }
      unenroll_gamer: {
        Args: {
          p_customer_id: string
          p_enrollment_id: string
          p_refund: boolean
        }
        Returns: {
          new_balance: number
          refund_transaction_id: string
        }[]
      }
    }
    Enums: {
      gender_type: "boy" | "girl" | "non_binary"
      token_transaction_type:
        | "purchase"
        | "subscription"
        | "admin_adjustment"
        | "enrollment"
        | "enrollment_refund"
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
      gender_type: ["boy", "girl", "non_binary"],
      token_transaction_type: [
        "purchase",
        "subscription",
        "admin_adjustment",
        "enrollment",
        "enrollment_refund",
      ],
      user_role: ["admin", "customer", "gamer", "gedu"],
      voice_room_status: ["open", "closed"],
    },
  },
} as const

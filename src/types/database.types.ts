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
      calendar_holidays_v2: {
        Row: {
          calendar_id: string
          date: string
          id: string
          reason: string | null
        }
        Insert: {
          calendar_id: string
          date: string
          id?: string
          reason?: string | null
        }
        Update: {
          calendar_id?: string
          date?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_holidays_v2_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_deductions_v2: {
        Row: {
          delta: number
          gamer_id: string
          id: string
          participation_id: string
          processed_at: string
          product_id: string
          reason: string
          session_date: string
        }
        Insert: {
          delta: number
          gamer_id: string
          id?: string
          participation_id: string
          processed_at?: string
          product_id: string
          reason: string
          session_date: string
        }
        Update: {
          delta?: number
          gamer_id?: string
          id?: string
          participation_id?: string
          processed_at?: string
          product_id?: string
          reason?: string
          session_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_deductions_v2_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_deductions_v2_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "participations_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_deductions_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          token_balance: number
          user_id: string
        }
        Insert: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          token_balance?: number
          user_id: string
        }
        Update: {
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
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
      family_subscription_items_v2: {
        Row: {
          created_at: string
          family_subscription_id: string
          id: string
          participation_id: string
          stripe_price_id: string
          stripe_subscription_item_id: string
        }
        Insert: {
          created_at?: string
          family_subscription_id: string
          id?: string
          participation_id: string
          stripe_price_id: string
          stripe_subscription_item_id: string
        }
        Update: {
          created_at?: string
          family_subscription_id?: string
          id?: string
          participation_id?: string
          stripe_price_id?: string
          stripe_subscription_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_subscription_items_v2_family_subscription_id_fkey"
            columns: ["family_subscription_id"]
            isOneToOne: false
            referencedRelation: "family_subscriptions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_subscription_items_v2_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: true
            referencedRelation: "participations_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      family_subscriptions_v2: {
        Row: {
          created_at: string
          currency: string
          current_period_end: string | null
          customer_id: string
          discount_coupon_id: string | null
          frequency: Database["public"]["Enums"]["subscription_frequency_v2"]
          id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          current_period_end?: string | null
          customer_id: string
          discount_coupon_id?: string | null
          frequency: Database["public"]["Enums"]["subscription_frequency_v2"]
          id?: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          current_period_end?: string | null
          customer_id?: string
          discount_coupon_id?: string | null
          frequency?: Database["public"]["Enums"]["subscription_frequency_v2"]
          id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_subscriptions_v2_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          created_at: string
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamer_profiles: {
        Row: {
          date_of_birth: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          user_id: string
        }
        Insert: {
          date_of_birth: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          user_id: string
        }
        Update: {
          date_of_birth?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
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
      gedu_group_assignments_v2: {
        Row: {
          created_at: string
          gedu_id: string
          group_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          gedu_id: string
          group_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          gedu_id?: string
          group_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gedu_group_assignments_v2_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_group_assignments_v2_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_group_assignments_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      gedu_locations: {
        Row: {
          created_at: string
          gedu_id: string
          location_id: string
        }
        Insert: {
          created_at?: string
          gedu_id: string
          location_id: string
        }
        Update: {
          created_at?: string
          gedu_id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gedu_locations_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
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
      holiday_calendars_v2: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      minecraft_accounts: {
        Row: {
          minecraft_username: string | null
          minecraft_uuid: string | null
          user_id: string
        }
        Insert: {
          minecraft_username?: string | null
          minecraft_uuid?: string | null
          user_id: string
        }
        Update: {
          minecraft_username?: string | null
          minecraft_uuid?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "minecraft_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      participations_v2: {
        Row: {
          created_at: string
          credits_remaining: number
          customer_id: string
          gamer_id: string
          group_id: string | null
          id: string
          product_id: string
          reserved_until: string | null
          signed_up_at: string
          status: Database["public"]["Enums"]["participation_status_v2"]
          updated_at: string
          waitlist_position: number | null
        }
        Insert: {
          created_at?: string
          credits_remaining?: number
          customer_id: string
          gamer_id: string
          group_id?: string | null
          id?: string
          product_id: string
          reserved_until?: string | null
          signed_up_at?: string
          status: Database["public"]["Enums"]["participation_status_v2"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Update: {
          created_at?: string
          credits_remaining?: number
          customer_id?: string
          gamer_id?: string
          group_id?: string | null
          id?: string
          product_id?: string
          reserved_until?: string | null
          signed_up_at?: string
          status?: Database["public"]["Enums"]["participation_status_v2"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participations_v2_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_v2_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_v2_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_v2: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          id: string
          metadata: Json
          purpose: Database["public"]["Enums"]["payment_purpose_v2"]
          stripe_event_id: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: string
          customer_id: string
          id?: string
          metadata?: Json
          purpose: Database["public"]["Enums"]["payment_purpose_v2"]
          stripe_event_id: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          metadata?: Json
          purpose?: Database["public"]["Enums"]["payment_purpose_v2"]
          stripe_event_id?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_v2_customer_id_fkey"
            columns: ["customer_id"]
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
      product_groups_v2: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_holiday_calendars_v2: {
        Row: {
          calendar_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_holiday_calendars_v2_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_holiday_calendars_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices_v2: {
        Row: {
          created_at: string
          currency: string
          price_per_month: number
          price_per_session: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          price_per_month: number
          price_per_session: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          price_per_month?: number
          price_per_session?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_seat_counts_v2: {
        Row: {
          active_count: number
          product_id: string
          reserving_count: number
          updated_at: string
          waitlist_count: number
        }
        Insert: {
          active_count?: number
          product_id: string
          reserving_count?: number
          updated_at?: string
          waitlist_count?: number
        }
        Update: {
          active_count?: number
          product_id?: string
          reserving_count?: number
          updated_at?: string
          waitlist_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_seat_counts_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_subscription_prices_v2: {
        Row: {
          created_at: string
          currency: string
          frequency: Database["public"]["Enums"]["subscription_frequency_v2"]
          product_id: string
          stripe_price_id: string
          unit_amount_cents: number
        }
        Insert: {
          created_at?: string
          currency: string
          frequency: Database["public"]["Enums"]["subscription_frequency_v2"]
          product_id: string
          stripe_price_id: string
          unit_amount_cents: number
        }
        Update: {
          created_at?: string
          currency?: string
          frequency?: Database["public"]["Enums"]["subscription_frequency_v2"]
          product_id?: string
          stripe_price_id?: string
          unit_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_subscription_prices_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags_v2: {
        Row: {
          created_at: string
          product_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_v2_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations_v2: {
        Row: {
          created_at: string
          description: string
          locale: string
          name: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          locale: string
          name: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          locale?: string
          name?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_translations_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
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
          image_path: string
          is_remote: boolean
          is_visible: boolean | null
          location_id: string | null
          max_age: number
          min_age: number
          name: string
          padlet_url: string | null
          spoken_language_code: string
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
          image_path: string
          is_remote: boolean
          is_visible?: boolean | null
          location_id?: string | null
          max_age: number
          min_age: number
          name: string
          padlet_url?: string | null
          spoken_language_code: string
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
          image_path?: string
          is_remote?: boolean
          is_visible?: boolean | null
          location_id?: string | null
          max_age?: number
          min_age?: number
          name?: string
          padlet_url?: string | null
          spoken_language_code?: string
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
          {
            foreignKeyName: "products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_spoken_language_code_fkey"
            columns: ["spoken_language_code"]
            isOneToOne: false
            referencedRelation: "spoken_languages"
            referencedColumns: ["code"]
          },
        ]
      }
      products_v2: {
        Row: {
          billing_mode: Database["public"]["Enums"]["billing_mode_v2"]
          created_at: string
          created_by: string
          end_date: string | null
          id: string
          image_path: string | null
          is_remote: boolean
          is_visible: boolean
          location_id: string | null
          max_age: number
          min_age: number
          padlet_url: string | null
          product_type: Database["public"]["Enums"]["product_type_v2"]
          refund_policy_days: number | null
          registration_opens_at: string
          seat_count: number | null
          signup_threshold: number | null
          spoken_language_code: string
          start_date: string | null
          status: Database["public"]["Enums"]["product_status_v2"]
          timezone: string
          topic_id: string
          updated_at: string
          waitlist_enabled: boolean
        }
        Insert: {
          billing_mode: Database["public"]["Enums"]["billing_mode_v2"]
          created_at?: string
          created_by: string
          end_date?: string | null
          id?: string
          image_path?: string | null
          is_remote: boolean
          is_visible?: boolean
          location_id?: string | null
          max_age: number
          min_age: number
          padlet_url?: string | null
          product_type: Database["public"]["Enums"]["product_type_v2"]
          refund_policy_days?: number | null
          registration_opens_at: string
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status_v2"]
          timezone: string
          topic_id: string
          updated_at?: string
          waitlist_enabled?: boolean
        }
        Update: {
          billing_mode?: Database["public"]["Enums"]["billing_mode_v2"]
          created_at?: string
          created_by?: string
          end_date?: string | null
          id?: string
          image_path?: string | null
          is_remote?: boolean
          is_visible?: boolean
          location_id?: string | null
          max_age?: number
          min_age?: number
          padlet_url?: string | null
          product_type?: Database["public"]["Enums"]["product_type_v2"]
          refund_policy_days?: number | null
          registration_opens_at?: string
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status_v2"]
          timezone?: string
          topic_id?: string
          updated_at?: string
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_v2_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_v2_spoken_language_code_fkey"
            columns: ["spoken_language_code"]
            isOneToOne: false
            referencedRelation: "spoken_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "products_v2_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          email?: string | null
          first_name: string
          id: string
          last_name?: string | null
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: string[]
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: string[]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      refunds_v2: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          payment_id: string
          reason: Database["public"]["Enums"]["refund_reason_v2"]
          stripe_event_id: string
          stripe_refund_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          payment_id: string
          reason: Database["public"]["Enums"]["refund_reason_v2"]
          stripe_event_id: string
          stripe_refund_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          payment_id?: string
          reason?: Database["public"]["Enums"]["refund_reason_v2"]
          stripe_event_id?: string
          stripe_refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_v2_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots_v2: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          product_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          product_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          product_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_v2_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      session_cancellations_v2: {
        Row: {
          cancelled_at: string
          id: string
          participation_id: string
          session_date: string
        }
        Insert: {
          cancelled_at?: string
          id?: string
          participation_id: string
          session_date: string
        }
        Update: {
          cancelled_at?: string
          id?: string
          participation_id?: string
          session_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_cancellations_v2_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "participations_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      site_details_v2: {
        Row: {
          address: string | null
          created_at: string
          location_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          location_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          location_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_details_v2_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_staff_details_v2: {
        Row: {
          created_at: string
          location_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          location_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          location_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_staff_details_v2_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      spoken_languages: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      tag_translations_v2: {
        Row: {
          created_at: string
          description: string | null
          locale: string
          name: string
          tag_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          locale: string
          name: string
          tag_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          locale?: string
          name?: string
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_translations_v2_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      tags_v2: {
        Row: {
          created_at: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          updated_at?: string
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
          stripe_idempotency_key: string | null
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
          stripe_idempotency_key?: string | null
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
          stripe_idempotency_key?: string | null
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
      topic_translations_v2: {
        Row: {
          created_at: string
          description: string | null
          locale: string
          name: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          locale: string
          name: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          locale?: string
          name?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_translations_v2_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      topics_v2: {
        Row: {
          created_at: string
          icon_path: string | null
          id: string
          kind: Database["public"]["Enums"]["topic_kind_v2"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_path?: string | null
          id?: string
          kind: Database["public"]["Enums"]["topic_kind_v2"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_path?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["topic_kind_v2"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      voice_rooms: {
        Row: {
          created_at: string
          daily_room_name: string
          group_id: string | null
          id: string
          name: string
          room_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_room_name: string
          group_id?: string | null
          id?: string
          name: string
          room_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_room_name?: string
          group_id?: string | null
          id?: string
          name?: string
          room_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_rooms_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          last_message_at: string
          phone: string
          wa_name: string | null
        }
        Insert: {
          created_at?: string
          last_message_at?: string
          phone: string
          wa_name?: string | null
        }
        Update: {
          created_at?: string
          last_message_at?: string
          phone?: string
          wa_name?: string | null
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          id: string
          message_type: string
          phone: string
          raw_payload: Json | null
          status: string
          status_error: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          id: string
          message_type?: string
          phone: string
          raw_payload?: Json | null
          status: string
          status_error?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_type?: string
          phone?: string
          raw_payload?: Json | null
          status?: string
          status_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_phone_fkey"
            columns: ["phone"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["phone"]
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
      _list_security_definer_without_search_path: {
        Args: never
        Returns: {
          function_name: string
        }[]
      }
      _list_table_grants: {
        Args: never
        Returns: {
          privilege_type: string
          table_name: string
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
          p_stripe_idempotency_key?: string
          p_stripe_subscription_id?: string
          p_type: Database["public"]["Enums"]["token_transaction_type"]
          p_user_id: string
        }
        Returns: {
          new_balance: number
          transaction_id: string
        }[]
      }
      apply_credit_motion_v2: {
        Args: {
          p_delta: number
          p_participation_id: string
          p_reason: string
          p_session_date: string
        }
        Returns: boolean
      }
      cancel_participation_v2: {
        Args: { p_participation_id: string; p_reason: string }
        Returns: Json
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
      commit_group_changes_v2: {
        Args: {
          p_added_groups?: Json
          p_deleted_group_ids?: string[]
          p_gedu_assignments_added?: Json
          p_gedu_assignments_removed?: Json
          p_participation_moves?: Json
          p_product_id: string
          p_renamed_groups?: Json
        }
        Returns: Json
      }
      confirm_reservation_v2: {
        Args: { p_credits_to_grant: number; p_reservation_id: string }
        Returns: Json
      }
      count_active_seats_v2: { Args: { p_product_id: string }; Returns: number }
      count_seats_taken_v2: { Args: { p_product_id: string }; Returns: number }
      create_participation_v2: {
        Args: {
          p_currency: string
          p_customer_id: string
          p_gamer_id: string
          p_product_id: string
          p_purchase_shape: string
        }
        Returns: Json
      }
      create_product_v2: {
        Args: {
          p_billing_mode: Database["public"]["Enums"]["billing_mode_v2"]
          p_end_date?: string
          p_holiday_calendar_ids?: string[]
          p_image_path?: string
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_max_age: number
          p_min_age: number
          p_padlet_url?: string
          p_prices?: Json
          p_product_type: Database["public"]["Enums"]["product_type_v2"]
          p_refund_policy_days?: number
          p_registration_opens_at: string
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: string
          p_start_date?: string
          p_status?: Database["public"]["Enums"]["product_status_v2"]
          p_tag_ids?: string[]
          p_timezone: string
          p_topic_id: string
          p_translations: Json
          p_waitlist_enabled?: boolean
        }
        Returns: string
      }
      effective_status_v2: {
        Args: { p_product_id: string }
        Returns: Database["public"]["Enums"]["effective_product_status_v2"]
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
      expire_reservation_v2: {
        Args: { p_reservation_id: string }
        Returns: Json
      }
      get_available_voice_rooms: {
        Args: never
        Returns: {
          daily_room_name: string
          day_of_week: number
          duration_minutes: number
          enrolled_at: string
          gedu_first_name: string
          gedu_id: string
          group_id: string
          id: string
          name: string
          product_name: string
          room_type: string
          start_time: string
          timezone: string
        }[]
      }
      get_enrollment_groups: {
        Args: { p_product_id: string }
        Returns: {
          gamer_count: number
          gedu_first_name: string
          group_id: string
          max_gamer_age: number
          min_gamer_age: number
        }[]
      }
      get_gedu_product_detail_v2: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_my_gamers: {
        Args: never
        Returns: {
          created_at: string
          currency: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
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
      get_my_groups: {
        Args: never
        Returns: {
          day_of_week: number
          display_order: number
          duration_minutes: number
          enrollment_id: string
          game_id: string
          game_name: string
          gamer_date_of_birth: string
          gamer_first_name: string
          gamer_gender: string
          gamer_id: string
          gedu_first_name: string
          gedu_id: string
          group_id: string
          last_charge_session_date: string
          product_description: string
          product_id: string
          product_image_path: string
          product_max_age: number
          product_min_age: number
          product_name: string
          product_padlet_url: string
          product_token_cost: number
          start_time: string
          timezone: string
          voice_room_id: string
        }[]
      }
      get_my_parents: {
        Args: never
        Returns: {
          created_at: string
          currency: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
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
      get_product_groups_v2_with_details: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_product_groups_with_details: {
        Args: { p_product_id: string }
        Returns: {
          display_order: number
          enrollment_id: string
          gamer_date_of_birth: string
          gamer_first_name: string
          gamer_gender: Database["public"]["Enums"]["gender_type"]
          gamer_id: string
          gedu_email: string
          gedu_first_name: string
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
          image_path: string
          is_remote: boolean
          is_visible: boolean | null
          location_id: string | null
          max_age: number
          min_age: number
          name: string
          padlet_url: string | null
          spoken_language_code: string
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
      join_waitlist_v2: {
        Args: {
          p_customer_id: string
          p_gamer_id: string
          p_product_id: string
        }
        Returns: Json
      }
      participation_state_v2: {
        Args: {
          p_group_id: string
          p_status: Database["public"]["Enums"]["participation_status_v2"]
        }
        Returns: string
      }
      process_session_credits_v2: { Args: never; Returns: Json }
      product_has_session_v2: {
        Args: { p_product_id: string; p_session_date: string }
        Returns: boolean
      }
      promote_from_waitlist_v2: {
        Args: { p_product_id: string }
        Returns: Json
      }
      refresh_product_seat_counts_v2: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      submit_feedback: {
        Args: { p_message: string; p_user_id: string }
        Returns: boolean
      }
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
      update_product_v2: {
        Args: {
          p_billing_mode: Database["public"]["Enums"]["billing_mode_v2"]
          p_end_date?: string
          p_holiday_calendar_ids?: string[]
          p_id: string
          p_image_path?: string
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_max_age: number
          p_min_age: number
          p_padlet_url?: string
          p_prices?: Json
          p_refund_policy_days?: number
          p_registration_opens_at: string
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: string
          p_start_date?: string
          p_tag_ids?: string[]
          p_timezone: string
          p_topic_id: string
          p_translations: Json
          p_waitlist_enabled?: boolean
        }
        Returns: string
      }
    }
    Enums: {
      billing_mode_v2: "paid" | "free" | "external_contract"
      effective_product_status_v2:
        | "draft"
        | "pending"
        | "running"
        | "completed"
        | "cancelled"
        | "expired"
      gender_type: "boy" | "girl" | "non_binary"
      location_type: "country" | "region" | "municipality" | "district" | "site"
      participation_status_v2:
        | "reserving"
        | "active"
        | "waitlisted"
        | "completed"
      payment_purpose_v2:
        | "bundle"
        | "subscription_invoice"
        | "single_payment"
        | "reservation_duplicate"
      product_status_v2:
        | "draft"
        | "pending"
        | "running"
        | "completed"
        | "cancelled"
      product_type_v2: "consumer_club" | "municipality_club" | "camp" | "event"
      refund_reason_v2:
        | "session_cancelled_in_window"
        | "admin_refund"
        | "product_cancelled"
        | "subscription_item_removed"
        | "subscription_period_proration"
        | "duplicate_payment"
      subscription_frequency_v2: "monthly" | "quarterly" | "yearly"
      token_transaction_type:
        | "purchase"
        | "subscription"
        | "admin_adjustment"
        | "enrollment"
        | "enrollment_refund"
      topic_kind_v2: "game" | "subject"
      user_role: "admin" | "customer" | "gamer" | "gedu"
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
      billing_mode_v2: ["paid", "free", "external_contract"],
      effective_product_status_v2: [
        "draft",
        "pending",
        "running",
        "completed",
        "cancelled",
        "expired",
      ],
      gender_type: ["boy", "girl", "non_binary"],
      location_type: ["country", "region", "municipality", "district", "site"],
      participation_status_v2: [
        "reserving",
        "active",
        "waitlisted",
        "completed",
      ],
      payment_purpose_v2: [
        "bundle",
        "subscription_invoice",
        "single_payment",
        "reservation_duplicate",
      ],
      product_status_v2: [
        "draft",
        "pending",
        "running",
        "completed",
        "cancelled",
      ],
      product_type_v2: ["consumer_club", "municipality_club", "camp", "event"],
      refund_reason_v2: [
        "session_cancelled_in_window",
        "admin_refund",
        "product_cancelled",
        "subscription_item_removed",
        "subscription_period_proration",
        "duplicate_payment",
      ],
      subscription_frequency_v2: ["monthly", "quarterly", "yearly"],
      token_transaction_type: [
        "purchase",
        "subscription",
        "admin_adjustment",
        "enrollment",
        "enrollment_refund",
      ],
      topic_kind_v2: ["game", "subject"],
      user_role: ["admin", "customer", "gamer", "gedu"],
    },
  },
} as const

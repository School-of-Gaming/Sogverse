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
      calendar_holidays: {
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
            foreignKeyName: "calendar_holidays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          pin_hash: string | null
          stripe_customer_id: string | null
          user_id: string
        }
        Insert: {
          pin_hash?: string | null
          stripe_customer_id?: string | null
          user_id: string
        }
        Update: {
          pin_hash?: string | null
          stripe_customer_id?: string | null
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
      family_subscriptions: {
        Row: {
          created_at: string
          currency: string
          current_period_end: string | null
          customer_id: string
          id: string
          participation_id: string
          status: string
          stripe_customer_id: string
          stripe_price_id: string | null
          stripe_subscription_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          current_period_end?: string | null
          customer_id: string
          id?: string
          participation_id: string
          status: string
          stripe_customer_id: string
          stripe_price_id?: string | null
          stripe_subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          current_period_end?: string | null
          customer_id?: string
          id?: string
          participation_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_subscriptions_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: true
            referencedRelation: "participations"
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
      gedu_group_assignments: {
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
            foreignKeyName: "gedu_group_assignments_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_group_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_group_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      gedu_profiles: {
        Row: {
          user_id: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          user_id: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          user_id?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gedu_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          gedu_note: string | null
          group_id: string
          id: string
          report: string | null
          session_date: string
          starts_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          gedu_note?: string | null
          group_id: string
          id?: string
          report?: string | null
          session_date: string
          starts_at: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          gedu_note?: string | null
          group_id?: string
          id?: string
          report?: string | null
          session_date?: string
          starts_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_calendars: {
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
          depth: number
          external_code: string | null
          geonames_id: number | null
          id: string
          name: string
          name_i18n: Json | null
          parent_id: string | null
          retired_at: string | null
          search_blob: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          depth?: number
          external_code?: string | null
          geonames_id?: number | null
          id?: string
          name: string
          name_i18n?: Json | null
          parent_id?: string | null
          retired_at?: string | null
          search_blob?: string | null
          type: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          depth?: number
          external_code?: string | null
          geonames_id?: number | null
          id?: string
          name?: string
          name_i18n?: Json | null
          parent_id?: string | null
          retired_at?: string | null
          search_blob?: string | null
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
      participations: {
        Row: {
          created_at: string
          customer_id: string
          gamer_id: string
          group_id: string | null
          id: string
          product_id: string
          signed_up_at: string
          status: Database["public"]["Enums"]["participation_status"]
          stripe_checkout_session_id: string | null
          updated_at: string
          waitlisted_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          gamer_id: string
          group_id?: string | null
          id?: string
          product_id: string
          signed_up_at?: string
          status: Database["public"]["Enums"]["participation_status"]
          stripe_checkout_session_id?: string | null
          updated_at?: string
          waitlisted_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          gamer_id?: string
          group_id?: string | null
          id?: string
          product_id?: string
          signed_up_at?: string
          status?: Database["public"]["Enums"]["participation_status"]
          stripe_checkout_session_id?: string | null
          updated_at?: string
          waitlisted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          customer_id: string
          id: string
          metadata: Json
          purpose: Database["public"]["Enums"]["payment_purpose"]
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
          purpose: Database["public"]["Enums"]["payment_purpose"]
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
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          stripe_event_id?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
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
          gedu_note: string | null
          id: string
          name: string
          product_id: string
          public_note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gedu_note?: string | null
          id?: string
          name: string
          product_id: string
          public_note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gedu_note?: string | null
          id?: string
          name?: string
          product_id?: string
          public_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_holiday_calendars: {
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
            foreignKeyName: "product_holiday_calendars_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "holiday_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_holiday_calendars_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          currency: string
          price_cents: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          price_cents: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          price_cents?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_seat_counts: {
        Row: {
          active_count: number
          product_id: string
          updated_at: string
          waitlist_count: number
        }
        Insert: {
          active_count?: number
          product_id: string
          updated_at?: string
          waitlist_count?: number
        }
        Update: {
          active_count?: number
          product_id?: string
          updated_at?: string
          waitlist_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_seat_counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_staff_details: {
        Row: {
          created_at: string
          material_url: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          material_url?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          material_url?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_staff_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_subscription_prices: {
        Row: {
          created_at: string
          currency: string
          product_id: string
          stripe_price_id: string
          unit_amount_cents: number
        }
        Insert: {
          created_at?: string
          currency: string
          product_id: string
          stripe_price_id: string
          unit_amount_cents: number
        }
        Update: {
          created_at?: string
          currency?: string
          product_id?: string
          stripe_price_id?: string
          unit_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_subscription_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations: {
        Row: {
          created_at: string
          locale: string
          long_description: Json | null
          name: string
          product_id: string
          short_description: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          locale: string
          long_description?: Json | null
          name: string
          product_id: string
          short_description: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          locale?: string
          long_description?: Json | null
          name?: string
          product_id?: string
          short_description?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_translations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          assistant_gedu_fee_cents: number | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
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
          municipality_fee_cents: number | null
          primary_gedu_fee_cents: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          registration_opens_at: string
          seat_count: number | null
          signup_threshold: number | null
          spoken_language_code: string
          start_date: string | null
          status: Database["public"]["Enums"]["product_status"]
          timezone: string
          topic: Database["public"]["Enums"]["product_topic"]
          updated_at: string
          waitlist_enabled: boolean
        }
        Insert: {
          assistant_gedu_fee_cents?: number | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
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
          municipality_fee_cents?: number | null
          primary_gedu_fee_cents?: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          registration_opens_at: string
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          timezone: string
          topic: Database["public"]["Enums"]["product_topic"]
          updated_at?: string
          waitlist_enabled?: boolean
        }
        Update: {
          assistant_gedu_fee_cents?: number | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
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
          municipality_fee_cents?: number | null
          primary_gedu_fee_cents?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          registration_opens_at?: string
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          timezone?: string
          topic?: Database["public"]["Enums"]["product_topic"]
          updated_at?: string
          waitlist_enabled?: boolean
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
      profiles: {
        Row: {
          created_at: string
          currency: string | null
          email: string
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          email: string
          first_name: string
          home_location_id?: string | null
          id: string
          last_name?: string
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          email?: string
          first_name?: string
          home_location_id?: string | null
          id?: string
          last_name?: string
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_location_id_fkey"
            columns: ["home_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      roblox_accounts: {
        Row: {
          roblox_user_id: number | null
          roblox_username: string | null
          user_id: string
        }
        Insert: {
          roblox_user_id?: number | null
          roblox_username?: string | null
          user_id: string
        }
        Update: {
          roblox_user_id?: number | null
          roblox_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roblox_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
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
            foreignKeyName: "schedule_slots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          gamer_id: string
          id: string
          recorded_at: string
          recorded_by: string | null
          session_id: string
          status: string
        }
        Insert: {
          gamer_id: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          status: string
        }
        Update: {
          gamer_id?: string
          id?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "group_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      site_details: {
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
            foreignKeyName: "site_details_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_staff_details: {
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
            foreignKeyName: "site_staff_details_location_id_fkey"
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
      voice_private_zone_occupants: {
        Row: {
          created_at: string
          group_id: string
          id: string
          placed_by: string
          session_opens_at: string
          user_id: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          placed_by: string
          session_opens_at: string
          user_id: string
          zone_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          placed_by?: string
          session_opens_at?: string
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_private_zone_occupants_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_private_zone_occupants_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_private_zone_occupants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_private_zone_occupants_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "voice_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_zones: {
        Row: {
          color: string
          created_at: string
          created_by: string
          group_id: string
          icon: string
          id: string
          is_locked: boolean
          name: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          created_by: string
          group_id: string
          icon: string
          id?: string
          is_locked?: boolean
          name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          group_id?: string
          icon?: string
          id?: string
          is_locked?: boolean
          name?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_zones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_zones_group_id_fkey"
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
      _list_column_grants: {
        Args: { p_grantee: string }
        Returns: {
          column_name: string
          privilege_type: string
          table_name: string
        }[]
      }
      _list_cron_jobs: {
        Args: never
        Returns: {
          command: string
          jobname: string
          schedule: string
        }[]
      }
      _list_function_authorization_surface: {
        Args: never
        Returns: {
          anon_access: boolean
          argument_names: string[]
          authenticated_access: boolean
          body: string
          function_language: string
          function_name: string
          is_security_definer: boolean
          is_strict: boolean
        }[]
      }
      _list_security_definer_without_search_path: {
        Args: never
        Returns: {
          function_name: string
        }[]
      }
      _list_table_grants: {
        Args: { p_grantee: string }
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
      admin_enroll_gamer: {
        Args: { p_gamer_id: string; p_product_id: string }
        Returns: Json
      }
      admin_remove_participation: {
        Args: { p_participation_id: string; p_product_id: string }
        Returns: Json
      }
      apply_group_changes: {
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
      assert_admin: { Args: never; Returns: undefined }
      assert_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: undefined
      }
      assert_self: { Args: { p_user_id: string }; Returns: undefined }
      can_read_product: { Args: { p_product_id: string }; Returns: boolean }
      cancel_participation: {
        Args: { p_participation_id: string; p_reason: string }
        Returns: Json
      }
      confirm_paid_participation: {
        Args: {
          p_checkout_session_id: string
          p_customer_id: string
          p_gamer_id: string
          p_product_id: string
        }
        Returns: Json
      }
      count_active_seats: { Args: { p_product_id: string }; Returns: number }
      create_gamer: {
        Args: {
          p_date_of_birth: string
          p_first_name: string
          p_gamer_id: string
          p_gender?: Database["public"]["Enums"]["gender_type"]
          p_last_name: string
          p_minecraft_username?: string
          p_minecraft_uuid?: string
          p_parent_id: string
          p_roblox_user_id?: number
          p_roblox_username?: string
        }
        Returns: undefined
      }
      create_participation: {
        Args: {
          p_currency: string
          p_customer_id: string
          p_gamer_id: string
          p_product_id: string
          p_purchase_shape: string
        }
        Returns: Json
      }
      create_product: {
        Args: {
          p_assistant_gedu_fee_cents?: number
          p_billing_mode: Database["public"]["Enums"]["billing_mode"]
          p_end_date?: string
          p_holiday_calendar_ids?: string[]
          p_image_path?: string
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_material_url?: string
          p_max_age: number
          p_min_age: number
          p_municipality_fee_cents?: number
          p_prices?: Json
          p_primary_gedu_fee_cents?: number
          p_product_type: Database["public"]["Enums"]["product_type"]
          p_registration_opens_at: string
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: string
          p_start_date?: string
          p_status?: Database["public"]["Enums"]["product_status"]
          p_timezone: string
          p_topic: Database["public"]["Enums"]["product_topic"]
          p_translations: Json
          p_waitlist_enabled?: boolean
        }
        Returns: string
      }
      demote_to_waitlist: {
        Args: { p_participation_id: string }
        Returns: Json
      }
      derive_group_session_window: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: unknown
      }
      effective_status: {
        Args: { p_product_id: string }
        Returns: Database["public"]["Enums"]["effective_product_status"]
      }
      ensure_group_session: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: string
      }
      gedu_teaches_group: { Args: { p_group_id: string }; Returns: boolean }
      get_gedu_assigned_product: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_gedu_group_feed: { Args: { p_group_id: string }; Returns: Json }
      get_my_assigned_products: {
        Args: never
        Returns: {
          end_date: string
          gamer_count: number
          group_count: number
          group_id: string
          is_remote: boolean
          product_id: string
          product_translations: Json
          product_type: Database["public"]["Enums"]["product_type"]
          schedule_slots: Json
          start_date: string
          timezone: string
        }[]
      }
      get_my_family_product_feed: {
        Args: { p_participation_id: string }
        Returns: Json
      }
      get_my_gamers: {
        Args: never
        Returns: {
          created_at: string
          currency: string | null
          email: string
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_gedu_assignment_summaries: {
        Args: { p_epoch_date?: string }
        Returns: Json
      }
      get_my_parents: {
        Args: never
        Returns: {
          created_at: string
          currency: string | null
          email: string
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_participation_subscription_states: {
        Args: never
        Returns: {
          current_period_end: string
          participation_id: string
          status: string
        }[]
      }
      get_my_waitlist_positions: {
        Args: never
        Returns: {
          participation_id: string
          waitlist_position: number
        }[]
      }
      get_product_groups_with_details: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_waitlist_position: {
        Args: { p_participation_id: string }
        Returns: number
      }
      group_session_date_is_writable: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: boolean
      }
      has_active_participation_in_group: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      has_active_participation_on_product: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      immutable_unaccent: { Args: { p_value: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_parent_of: { Args: { gamer_uuid: string }; Returns: boolean }
      is_voice_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_voice_group_moderator: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      join_product_waitlist: {
        Args: { p_gamer_id: string; p_product_id: string }
        Returns: Json
      }
      join_waitlist: {
        Args: {
          p_customer_id: string
          p_gamer_id: string
          p_product_id: string
        }
        Returns: Json
      }
      leave_my_waitlist_spot: {
        Args: { p_participation_id: string }
        Returns: Json
      }
      location_search_blob: {
        Args: { p_external_code: string; p_name: string; p_name_i18n: Json }
        Returns: string
      }
      location_search_separator: { Args: never; Returns: string }
      participation_state: {
        Args: {
          p_group_id: string
          p_status: Database["public"]["Enums"]["participation_status"]
        }
        Returns: string
      }
      pin_is_set: { Args: never; Returns: boolean }
      product_has_session: {
        Args: { p_product_id: string; p_session_date: string }
        Returns: boolean
      }
      promote_from_waitlist: {
        Args: { p_group_id?: string; p_participation_id: string }
        Returns: Json
      }
      record_attendance: {
        Args: {
          p_gamer_id: string
          p_group_id: string
          p_session_date: string
          p_status: string
        }
        Returns: Json
      }
      refresh_product_seat_counts: {
        Args: { p_product_id: string }
        Returns: undefined
      }
      register_gedu: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_locale: string
          p_location_ids: string[]
          p_minecraft_username: string
          p_minecraft_uuid: string
          p_phone: string
          p_roblox_user_id: string
          p_roblox_username: string
          p_spoken_languages: string[]
          p_user_id: string
        }
        Returns: undefined
      }
      search_locations: {
        Args: {
          p_country?: string
          p_limit?: number
          p_query: string
          p_types?: Database["public"]["Enums"]["location_type"][]
        }
        Returns: Json
      }
      set_gedu_verified: {
        Args: { p_gedu_id: string; p_verified: boolean }
        Returns: undefined
      }
      set_group_member_minecraft: {
        Args: {
          p_gamer_id: string
          p_minecraft_username: string
          p_minecraft_uuid: string
        }
        Returns: Json
      }
      set_group_notes: {
        Args: { p_gedu_note: string; p_group_id: string; p_public_note: string }
        Returns: Json
      }
      set_group_session_notes: {
        Args: {
          p_gedu_note: string
          p_group_id: string
          p_report: string
          p_session_date: string
        }
        Returns: Json
      }
      set_my_pin: { Args: { p_pin: string }; Returns: undefined }
      set_pin_for_user: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      set_site_notes: {
        Args: {
          p_gedu_note: string
          p_location_id: string
          p_public_note: string
        }
        Returns: Json
      }
      submit_feedback: {
        Args: { p_message: string; p_user_id: string }
        Returns: boolean
      }
      submit_my_feedback: { Args: { p_message: string }; Returns: boolean }
      update_product: {
        Args: {
          p_assistant_gedu_fee_cents?: number
          p_billing_mode: Database["public"]["Enums"]["billing_mode"]
          p_end_date?: string
          p_holiday_calendar_ids?: string[]
          p_id: string
          p_image_path?: string
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_material_url?: string
          p_max_age: number
          p_min_age: number
          p_municipality_fee_cents?: number
          p_prices?: Json
          p_primary_gedu_fee_cents?: number
          p_registration_opens_at: string
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: string
          p_start_date?: string
          p_timezone: string
          p_topic: Database["public"]["Enums"]["product_topic"]
          p_translations: Json
          p_waitlist_enabled?: boolean
        }
        Returns: string
      }
      verify_my_pin: { Args: { p_pin: string }; Returns: boolean }
    }
    Enums: {
      billing_mode: "paid" | "free" | "external_contract"
      effective_product_status:
        | "draft"
        | "pending"
        | "running"
        | "completed"
        | "cancelled"
        | "expired"
      gender_type: "boy" | "girl" | "non_binary"
      location_type: "country" | "region" | "municipality" | "district" | "site"
      participation_status: "reserving" | "active" | "waitlisted" | "completed"
      payment_purpose:
        | "bundle"
        | "subscription_invoice"
        | "single_payment"
        | "reservation_duplicate"
      product_status:
        | "draft"
        | "pending"
        | "running"
        | "completed"
        | "cancelled"
      product_topic:
        | "minecraft_java"
        | "minecraft_education"
        | "minecraft_bedrock"
        | "fortnite"
        | "webinar"
        | "pokemon_go"
      product_type: "consumer_club" | "municipality_club" | "camp" | "event"
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
      billing_mode: ["paid", "free", "external_contract"],
      effective_product_status: [
        "draft",
        "pending",
        "running",
        "completed",
        "cancelled",
        "expired",
      ],
      gender_type: ["boy", "girl", "non_binary"],
      location_type: ["country", "region", "municipality", "district", "site"],
      participation_status: ["reserving", "active", "waitlisted", "completed"],
      payment_purpose: [
        "bundle",
        "subscription_invoice",
        "single_payment",
        "reservation_duplicate",
      ],
      product_status: ["draft", "pending", "running", "completed", "cancelled"],
      product_topic: [
        "minecraft_java",
        "minecraft_education",
        "minecraft_bedrock",
        "fortnite",
        "webinar",
        "pokemon_go",
      ],
      product_type: ["consumer_club", "municipality_club", "camp", "event"],
      user_role: ["admin", "customer", "gamer", "gedu"],
    },
  },
} as const

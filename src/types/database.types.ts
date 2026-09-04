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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_channel_locks: {
        Row: {
          channel_id: string
          locked_at: string | null
          locked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          locked_at?: string | null
          locked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_locks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_locks_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_locks_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          group_id: string
          id: string
          session_ends_at: string
          session_opens_at: string
          type: Database["public"]["Enums"]["chat_channel_type"]
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          session_ends_at: string
          session_opens_at: string
          type: Database["public"]["Enums"]["chat_channel_type"]
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          session_ends_at?: string
          session_opens_at?: string
          type?: Database["public"]["Enums"]["chat_channel_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          channel_id: string
          created_at: string
          edited_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          image_height: number | null
          image_stored_at: string | null
          image_width: number | null
          reply_to_message_id: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          channel_id: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id: string
          image_height?: number | null
          image_stored_at?: string | null
          image_width?: number | null
          reply_to_message_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          channel_id?: string
          created_at?: string
          edited_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          image_height?: number | null
          image_stored_at?: string | null
          image_width?: number | null
          reply_to_message_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          channel_id: string
          code: string
          created_at: string
          message_id: string
          sender_id: string
        }
        Insert: {
          channel_id: string
          code: string
          created_at?: string
          message_id: string
          sender_id: string
        }
        Update: {
          channel_id?: string
          code?: string
          created_at?: string
          message_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          customer_id: string
          document_slug: string
          document_version: string
          id: string
          participant_id: string
          product_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          customer_id: string
          document_slug: string
          document_version: string
          id?: string
          participant_id: string
          product_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          customer_id?: string
          document_slug?: string
          document_version?: string
          id?: string
          participant_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_acceptances_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_document_fkey"
            columns: ["document_slug", "document_version"]
            isOneToOne: false
            referencedRelation: "consent_document_versions"
            referencedColumns: ["document_slug", "version"]
          },
          {
            foreignKeyName: "consent_acceptances_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_acceptances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_document_versions: {
        Row: {
          created_at: string
          document_slug: string
          version: string
        }
        Insert: {
          created_at?: string
          document_slug: string
          version: string
        }
        Update: {
          created_at?: string
          document_slug?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_document_versions_document_slug_fkey"
            columns: ["document_slug"]
            isOneToOne: false
            referencedRelation: "consent_documents"
            referencedColumns: ["slug"]
          },
        ]
      }
      consent_documents: {
        Row: {
          created_at: string
          slug: string
        }
        Insert: {
          created_at?: string
          slug: string
        }
        Update: {
          created_at?: string
          slug?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "customer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_search_index"
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
            foreignKeyName: "family_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
          {
            foreignKeyName: "feedback_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      gamer_group_creations: {
        Row: {
          created_at: string
          creations: Json
          group_id: string
          participant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          creations: Json
          group_id: string
          participant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          creations?: Json
          group_id?: string
          participant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamer_group_creations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_creations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_creations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_creations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_creations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      gamer_group_notes: {
        Row: {
          created_at: string
          group_id: string
          note: string
          participant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          note: string
          participant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          note?: string
          participant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamer_group_notes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_notes_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_notes_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamer_group_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
          {
            foreignKeyName: "gamer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      gedu_contract_acceptances: {
        Row: {
          accepted_at: string
          contract_version: string
          gedu_id: string
          signed_name: string
        }
        Insert: {
          accepted_at?: string
          contract_version: string
          gedu_id: string
          signed_name: string
        }
        Update: {
          accepted_at?: string
          contract_version?: string
          gedu_id?: string
          signed_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "gedu_contract_acceptances_contract_version_fkey"
            columns: ["contract_version"]
            isOneToOne: false
            referencedRelation: "gedu_contract_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "gedu_contract_acceptances_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "gedu_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      gedu_contract_versions: {
        Row: {
          created_at: string
          version: string
        }
        Insert: {
          created_at?: string
          version: string
        }
        Update: {
          created_at?: string
          version?: string
        }
        Relationships: []
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
            foreignKeyName: "gedu_group_assignments_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "gedu_locations_gedu_id_fkey"
            columns: ["gedu_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
          certified: boolean
          certified_at: string | null
          certified_by: string | null
          criminal_record_check_at: string | null
          criminal_record_check_by: string | null
          criminal_record_check_passed: boolean
          user_id: string
        }
        Insert: {
          certified?: boolean
          certified_at?: string | null
          certified_by?: string | null
          criminal_record_check_at?: string | null
          criminal_record_check_by?: string | null
          criminal_record_check_passed?: boolean
          user_id: string
        }
        Update: {
          certified?: boolean
          certified_at?: string | null
          certified_by?: string | null
          criminal_record_check_at?: string | null
          criminal_record_check_by?: string | null
          criminal_record_check_passed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gedu_profiles_certified_by_fkey"
            columns: ["certified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_certified_by_fkey"
            columns: ["certified_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_criminal_record_check_by_fkey"
            columns: ["criminal_record_check_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_criminal_record_check_by_fkey"
            columns: ["criminal_record_check_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gedu_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      group_session_images: {
        Row: {
          created_at: string
          created_by: string | null
          height: number
          id: string
          session_id: string
          width: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          height: number
          id?: string
          session_id: string
          width: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          height?: number
          id?: string
          session_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_session_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_session_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_session_images_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "group_sessions"
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
          report_emailed_at: string | null
          report_emailed_by: string | null
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
          report_emailed_at?: string | null
          report_emailed_by?: string | null
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
          report_emailed_at?: string | null
          report_emailed_by?: string | null
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
            foreignKeyName: "group_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "group_sessions_report_emailed_by_fkey"
            columns: ["report_emailed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_report_emailed_by_fkey"
            columns: ["report_emailed_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_sessions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
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
      marketing_consent_events: {
        Row: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          created_at: string
          customer_id: string
          granted: boolean
          id: string
          source: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          created_at?: string
          customer_id: string
          granted: boolean
          id?: string
          source: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["marketing_consent_type"]
          created_at?: string
          customer_id?: string
          granted?: boolean
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consent_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_consent_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_consents: {
        Row: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          customer_id: string
          granted: boolean
          updated_at: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          customer_id: string
          granted: boolean
          updated_at?: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["marketing_consent_type"]
          customer_id?: string
          granted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
          {
            foreignKeyName: "minecraft_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_search_index"
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
            foreignKeyName: "parent_gamer_gamer_id_fkey"
            columns: ["gamer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_gamer_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_gamer_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      participations: {
        Row: {
          created_at: string
          customer_id: string
          group_id: string | null
          group_joined_at: string | null
          id: string
          participant_id: string
          product_id: string
          seat_offer_expiry_notified_at: string | null
          seat_offer_sent_at: string | null
          signed_up_at: string
          status: Database["public"]["Enums"]["participation_status"]
          stripe_checkout_session_id: string | null
          updated_at: string
          waitlisted_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          group_id?: string | null
          group_joined_at?: string | null
          id?: string
          participant_id: string
          product_id: string
          seat_offer_expiry_notified_at?: string | null
          seat_offer_sent_at?: string | null
          signed_up_at?: string
          status: Database["public"]["Enums"]["participation_status"]
          stripe_checkout_session_id?: string | null
          updated_at?: string
          waitlisted_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          group_id?: string | null
          group_joined_at?: string | null
          id?: string
          participant_id?: string
          product_id?: string
          seat_offer_expiry_notified_at?: string | null
          seat_offer_sent_at?: string | null
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
            foreignKeyName: "participations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "participations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
      }
      postal_codes: {
        Row: {
          country_code: string
          location_id: string
          postal_code: string
        }
        Insert: {
          country_code: string
          location_id: string
          postal_code: string
        }
        Update: {
          country_code?: string
          location_id?: string
          postal_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "postal_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
      product_images: {
        Row: {
          created_at: string
          id: string
          label: string
          path: string
          sha256: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          path: string
          sha256: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          path?: string
          sha256?: string
        }
        Relationships: []
      }
      product_marketing_consents: {
        Row: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          product_id: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          product_id: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["marketing_consent_type"]
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_marketing_consents_product_id_fkey"
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
      product_required_consents: {
        Row: {
          document_slug: string
          product_id: string
        }
        Insert: {
          document_slug: string
          product_id: string
        }
        Update: {
          document_slug?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_required_consents_document_slug_fkey"
            columns: ["document_slug"]
            isOneToOne: false
            referencedRelation: "consent_documents"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "product_required_consents_product_id_fkey"
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
          long_description: string | null
          name: string
          product_id: string
          short_description: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          locale: string
          long_description?: string | null
          name: string
          product_id: string
          short_description: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          locale?: string
          long_description?: string | null
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
          for_gamers: boolean
          for_parents: boolean
          id: string
          image_id: string | null
          image_path: string | null
          is_remote: boolean
          is_visible: boolean
          location_id: string | null
          max_age: number | null
          min_age: number | null
          municipality_fee_cents: number | null
          primary_gedu_fee_cents: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          region_lock_country: string | null
          registration_opens_at: string
          requires_gamer_creations: boolean
          seat_count: number | null
          signup_threshold: number | null
          spoken_language_code: Database["public"]["Enums"]["spoken_language"]
          start_date: string | null
          status: Database["public"]["Enums"]["product_status"]
          tag: Database["public"]["Enums"]["product_tag"] | null
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
          for_gamers?: boolean
          for_parents?: boolean
          id?: string
          image_id?: string | null
          image_path?: string | null
          is_remote: boolean
          is_visible?: boolean
          location_id?: string | null
          max_age?: number | null
          min_age?: number | null
          municipality_fee_cents?: number | null
          primary_gedu_fee_cents?: number | null
          product_type: Database["public"]["Enums"]["product_type"]
          region_lock_country?: string | null
          registration_opens_at: string
          requires_gamer_creations?: boolean
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code: Database["public"]["Enums"]["spoken_language"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          tag?: Database["public"]["Enums"]["product_tag"] | null
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
          for_gamers?: boolean
          for_parents?: boolean
          id?: string
          image_id?: string | null
          image_path?: string | null
          is_remote?: boolean
          is_visible?: boolean
          location_id?: string | null
          max_age?: number | null
          min_age?: number | null
          municipality_fee_cents?: number | null
          primary_gedu_fee_cents?: number | null
          product_type?: Database["public"]["Enums"]["product_type"]
          region_lock_country?: string | null
          registration_opens_at?: string
          requires_gamer_creations?: boolean
          seat_count?: number | null
          signup_threshold?: number | null
          spoken_language_code?: Database["public"]["Enums"]["spoken_language"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          tag?: Database["public"]["Enums"]["product_tag"] | null
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
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string | null
          email: string
          email_verified_at: string | null
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: Database["public"]["Enums"]["spoken_language"][]
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          email: string
          email_verified_at?: string | null
          first_name: string
          home_location_id?: string | null
          id: string
          last_name?: string
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: Database["public"]["Enums"]["spoken_language"][]
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          email?: string
          email_verified_at?: string | null
          first_name?: string
          home_location_id?: string | null
          id?: string
          last_name?: string
          locale?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          spoken_languages?: Database["public"]["Enums"]["spoken_language"][]
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
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
          {
            foreignKeyName: "roblox_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_search_index"
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
          id: string
          participant_id: string
          recorded_at: string
          recorded_by: string | null
          session_id: string
          status: string
        }
        Insert: {
          id?: string
          participant_id: string
          recorded_at?: string
          recorded_by?: string | null
          session_id: string
          status: string
        }
        Update: {
          id?: string
          participant_id?: string
          recorded_at?: string
          recorded_by?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "session_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
      verification_email_requests: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_email_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_email_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "voice_private_zone_occupants_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "voice_private_zone_occupants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
            foreignKeyName: "voice_zones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_search_index"
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
      user_search_index: {
        Row: {
          created_at: string | null
          currency: string | null
          email: string | null
          email_verified_at: string | null
          first_name: string | null
          home_location_id: string | null
          id: string | null
          last_name: string | null
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          search_blob: string | null
          spoken_languages:
            | Database["public"]["Enums"]["spoken_language"][]
            | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
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
      _list_replicated_tables: {
        Args: never
        Returns: {
          replica_identity: string
          table_name: string
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
      _list_views: {
        Args: never
        Returns: {
          anon_select: boolean
          authenticated_select: boolean
          kind: string
          security_invoker: boolean
          view_name: string
        }[]
      }
      accept_gedu_contract: { Args: { p_version: string }; Returns: string }
      add_group_session_image: {
        Args: {
          p_group_id: string
          p_height: number
          p_max_images: number
          p_session_date: string
          p_width: number
        }
        Returns: string
      }
      admin_enroll_participant: {
        Args: { p_participant_id: string; p_product_id: string }
        Returns: Json
      }
      admin_remove_participation: {
        Args: { p_participation_id: string; p_product_id: string }
        Returns: Json
      }
      admin_set_product_marketing_consents: {
        Args: {
          p_consent_types: Database["public"]["Enums"]["marketing_consent_type"][]
          p_product_id: string
        }
        Returns: undefined
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
      assert_can_delete_session_image: {
        Args: { p_image_id: string }
        Returns: string
      }
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
      chat_body_mentions_are_roster: {
        Args: { p_body: string; p_channel_id: string }
        Returns: boolean
      }
      chat_caller_is_locked: {
        Args: { p_channel_id: string }
        Returns: boolean
      }
      chat_channel_roster_ids: {
        Args: { p_channel_id: string }
        Returns: string[]
      }
      claim_expired_seat_offer_notifications: {
        Args: { p_participation_id?: string }
        Returns: Json
      }
      claim_group_session_report_email: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: Json
      }
      confirm_paid_participation: {
        Args: {
          p_checkout_session_id: string
          p_customer_id: string
          p_participant_id: string
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
          p_consented_documents?: string[]
          p_currency: string
          p_customer_id: string
          p_participant_id: string
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
          p_for_gamers: boolean
          p_for_parents: boolean
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_material_url?: string
          p_max_age?: number
          p_min_age?: number
          p_municipality_fee_cents?: number
          p_prices?: Json
          p_primary_gedu_fee_cents?: number
          p_product_type: Database["public"]["Enums"]["product_type"]
          p_region_lock_country?: string
          p_registration_opens_at: string
          p_required_consent_slugs?: string[]
          p_requires_gamer_creations?: boolean
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: Database["public"]["Enums"]["spoken_language"]
          p_start_date?: string
          p_status?: Database["public"]["Enums"]["product_status"]
          p_tag?: Database["public"]["Enums"]["product_tag"]
          p_timezone: string
          p_topic: Database["public"]["Enums"]["product_topic"]
          p_translations: Json
          p_waitlist_enabled?: boolean
        }
        Returns: string
      }
      delete_group_session_image: {
        Args: { p_image_id: string }
        Returns: undefined
      }
      demote_to_waitlist: {
        Args: { p_participation_id: string }
        Returns: Json
      }
      derive_group_session_window: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: unknown
      }
      edit_chat_message: {
        Args: { p_body: string; p_id: string }
        Returns: string
      }
      effective_status: {
        Args: { p_product_id: string }
        Returns: Database["public"]["Enums"]["effective_product_status"]
      }
      ensure_chat_channel: {
        Args: { p_group_id: string }
        Returns: {
          created_at: string
          group_id: string
          id: string
          session_ends_at: string
          session_opens_at: string
          type: Database["public"]["Enums"]["chat_channel_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_channels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_group_session: {
        Args: { p_group_id: string; p_session_date: string }
        Returns: string
      }
      gedu_teaches_group: { Args: { p_group_id: string }; Returns: boolean }
      gedu_teaches_group_product: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      get_admin_dashboard: { Args: never; Returns: Json }
      get_admin_product_sessions: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_chat_channel_roster: {
        Args: { p_channel_id: string }
        Returns: {
          first_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_gedu_assigned_product: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_gedu_group_feed: { Args: { p_group_id: string }; Returns: Json }
      get_group_staff_overlay: { Args: { p_group_id: string }; Returns: Json }
      get_my_assigned_products: {
        Args: never
        Returns: {
          end_date: string
          group_count: number
          group_id: string
          is_remote: boolean
          participant_count: number
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
          email_verified_at: string | null
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: Database["public"]["Enums"]["spoken_language"][]
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
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
          email_verified_at: string | null
          first_name: string
          home_location_id: string | null
          id: string
          last_name: string
          locale: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          spoken_languages: Database["public"]["Enums"]["spoken_language"][]
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
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
      hide_chat_message: { Args: { p_id: string }; Returns: string }
      immutable_unaccent: { Args: { p_value: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_chat_channel_member: {
        Args: { p_channel_id: string }
        Returns: boolean
      }
      is_chat_channel_moderator: {
        Args: { p_channel_id: string }
        Returns: boolean
      }
      is_no_charge: {
        Args: { p_mode: Database["public"]["Enums"]["billing_mode"] }
        Returns: boolean
      }
      is_parent_of: { Args: { gamer_uuid: string }; Returns: boolean }
      is_voice_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_voice_group_moderator: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      join_product_waitlist: {
        Args: {
          p_consented_documents?: string[]
          p_participant_id: string
          p_product_id: string
        }
        Returns: Json
      }
      join_waitlist: {
        Args: {
          p_consented_documents?: string[]
          p_customer_id: string
          p_participant_id: string
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
      mark_chat_image_stored: { Args: { p_id: string }; Returns: string }
      participation_state: {
        Args: {
          p_group_id: string
          p_status: Database["public"]["Enums"]["participation_status"]
        }
        Returns: string
      }
      pin_is_set: { Args: never; Returns: boolean }
      promote_from_waitlist: {
        Args: { p_group_id?: string; p_participation_id: string }
        Returns: Json
      }
      record_attendance: {
        Args: {
          p_group_id: string
          p_participant_id: string
          p_session_date: string
          p_status: string
        }
        Returns: Json
      }
      record_registration_marketing_consent: {
        Args: { p_customer_id: string; p_granted: boolean }
        Returns: undefined
      }
      record_required_consents: {
        Args: {
          p_accepted_by: string
          p_consented_documents: string[]
          p_customer_id: string
          p_participant_id: string
          p_product_id: string
        }
        Returns: undefined
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
          p_spoken_languages: Database["public"]["Enums"]["spoken_language"][]
          p_user_id: string
        }
        Returns: undefined
      }
      request_my_verification_email: { Args: never; Returns: boolean }
      respond_seat_offer: {
        Args: {
          p_accept: boolean
          p_offer_sent_at: string
          p_participation_id: string
        }
        Returns: Json
      }
      restore_chat_message: { Args: { p_id: string }; Returns: undefined }
      search_locations: {
        Args: {
          p_country?: string
          p_limit?: number
          p_query: string
          p_types?: Database["public"]["Enums"]["location_type"][]
        }
        Returns: Json
      }
      send_chat_image_message: {
        Args: {
          p_channel_id: string
          p_height: number
          p_id: string
          p_reply_to_message_id?: string
          p_width: number
        }
        Returns: string
      }
      send_chat_message: {
        Args: {
          p_body: string
          p_channel_id: string
          p_id: string
          p_reply_to_message_id?: string
        }
        Returns: string
      }
      send_seat_offer: { Args: { p_participation_id: string }; Returns: Json }
      set_chat_lock: {
        Args: { p_channel_id: string; p_locked: boolean; p_user_id: string }
        Returns: undefined
      }
      set_gamer_group_creations: {
        Args: {
          p_creations: Json
          p_group_id: string
          p_participant_id: string
        }
        Returns: Json
      }
      set_gamer_group_note: {
        Args: { p_group_id: string; p_note: string; p_participant_id: string }
        Returns: Json
      }
      set_gedu_certified: {
        Args: { p_certified: boolean; p_gedu_id: string }
        Returns: undefined
      }
      set_gedu_criminal_record_check: {
        Args: { p_gedu_id: string; p_passed: boolean }
        Returns: undefined
      }
      set_group_member_minecraft: {
        Args: {
          p_minecraft_username: string
          p_minecraft_uuid: string
          p_participant_id: string
        }
        Returns: Json
      }
      set_group_member_roblox: {
        Args: {
          p_participant_id: string
          p_roblox_user_id?: number
          p_roblox_username: string
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
      set_marketing_consent: {
        Args: {
          p_consent_type: Database["public"]["Enums"]["marketing_consent_type"]
          p_granted: boolean
          p_source: string
        }
        Returns: undefined
      }
      set_my_pin: { Args: { p_pin: string }; Returns: undefined }
      set_pin_for_user: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      set_product_required_consents: {
        Args: { p_product_id: string; p_slugs: string[] }
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
      toggle_chat_reaction: {
        Args: { p_code: string; p_message_id: string }
        Returns: boolean
      }
      update_product: {
        Args: {
          p_assistant_gedu_fee_cents?: number
          p_billing_mode: Database["public"]["Enums"]["billing_mode"]
          p_end_date?: string
          p_for_gamers: boolean
          p_for_parents: boolean
          p_id: string
          p_is_remote: boolean
          p_is_visible?: boolean
          p_location_id?: string
          p_material_url?: string
          p_max_age?: number
          p_min_age?: number
          p_municipality_fee_cents?: number
          p_prices?: Json
          p_primary_gedu_fee_cents?: number
          p_region_lock_country?: string
          p_registration_opens_at: string
          p_required_consent_slugs?: string[]
          p_requires_gamer_creations?: boolean
          p_schedule_slots?: Json
          p_seat_count?: number
          p_signup_threshold?: number
          p_spoken_language_code: Database["public"]["Enums"]["spoken_language"]
          p_start_date?: string
          p_tag?: Database["public"]["Enums"]["product_tag"]
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
      chat_channel_type: "group_session"
      effective_product_status:
        | "pending"
        | "running"
        | "completed"
        | "cancelled"
        | "expired"
      gender_type: "boy" | "girl" | "non_binary"
      location_type: "country" | "region" | "municipality" | "district" | "site"
      marketing_consent_type: "school_of_gaming" | "lynx_educate"
      participation_status: "reserving" | "active" | "waitlisted" | "completed"
      payment_purpose:
        | "bundle"
        | "subscription_invoice"
        | "single_payment"
        | "reservation_duplicate"
      product_status: "pending" | "running" | "completed" | "cancelled"
      product_tag: "neuroinclusive" | "beginner" | "advanced"
      product_topic:
        | "minecraft_java"
        | "minecraft_education"
        | "minecraft_bedrock"
        | "fortnite"
        | "roblox_studio"
        | "pokemon_go"
        | "rocket_league"
        | "creator_studio"
        | "programming"
        | "ai"
        | "esports"
        | "game_studio"
      product_type: "consumer_club" | "municipality_club" | "camp" | "event"
      spoken_language: "fi" | "sv" | "en" | "fr"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      chat_channel_type: ["group_session"],
      effective_product_status: [
        "pending",
        "running",
        "completed",
        "cancelled",
        "expired",
      ],
      gender_type: ["boy", "girl", "non_binary"],
      location_type: ["country", "region", "municipality", "district", "site"],
      marketing_consent_type: ["school_of_gaming", "lynx_educate"],
      participation_status: ["reserving", "active", "waitlisted", "completed"],
      payment_purpose: [
        "bundle",
        "subscription_invoice",
        "single_payment",
        "reservation_duplicate",
      ],
      product_status: ["pending", "running", "completed", "cancelled"],
      product_tag: ["neuroinclusive", "beginner", "advanced"],
      product_topic: [
        "minecraft_java",
        "minecraft_education",
        "minecraft_bedrock",
        "fortnite",
        "roblox_studio",
        "pokemon_go",
        "rocket_league",
        "creator_studio",
        "programming",
        "ai",
        "esports",
        "game_studio",
      ],
      product_type: ["consumer_club", "municipality_club", "camp", "event"],
      spoken_language: ["fi", "sv", "en", "fr"],
      user_role: ["admin", "customer", "gamer", "gedu"],
    },
  },
} as const

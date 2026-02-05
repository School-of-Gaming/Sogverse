export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "customer" | "gamer" | "gedu";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          username: string | null;
          role: UserRole;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          username?: string | null;
          role?: UserRole;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          username?: string | null;
          role?: UserRole;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      parent_gamer: {
        Row: {
          id: string;
          parent_id: string;
          gamer_id: string;
          relationship: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          gamer_id: string;
          relationship?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          gamer_id?: string;
          relationship?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "parent_gamer_parent_id_fkey";
            columns: ["parent_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_gamer_gamer_id_fkey";
            columns: ["gamer_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          currency: string;
          image_url: string | null;
          stripe_product_id: string | null;
          stripe_price_id: string | null;
          is_active: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price: number;
          currency?: string;
          image_url?: string | null;
          stripe_product_id?: string | null;
          stripe_price_id?: string | null;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          currency?: string;
          image_url?: string | null;
          stripe_product_id?: string | null;
          stripe_price_id?: string | null;
          is_active?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_parent_of: {
        Args: { gamer_uuid: string };
        Returns: boolean;
      };
      get_my_gamers: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["profiles"]["Row"][];
      };
      get_my_parents: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["profiles"]["Row"][];
      };
      get_active_products: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Tables"]["products"]["Row"][];
      };
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Convenience type aliases
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type ParentGamer = Database["public"]["Tables"]["parent_gamer"]["Row"];
export type ParentGamerInsert = Database["public"]["Tables"]["parent_gamer"]["Insert"];

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

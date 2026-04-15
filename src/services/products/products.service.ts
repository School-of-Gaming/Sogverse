import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductInsert, ProductUpdate, Database } from "@/types";

export type ProductWithGame = Product & { games: { name: string } | null };

// Self-hosted images transition (PR 2 of 3): the generated Row type has
// image_path: string | null, but every row has a populated path after the
// PR 1 populate step and the Product alias re-asserts it as non-null.
// PR 3 drops image_url and these casts collapse to a no-op. See
// src/types/index.ts "products" override.
function assertProductShape<T>(row: unknown): T {
  return row as T;
}

export class ProductsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getVisibleProducts(): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return assertProductShape<ProductWithGame[]>(data);
  }

  async getAllProducts(): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return assertProductShape<ProductWithGame[]>(data);
  }

  async getProduct(id: string): Promise<ProductWithGame> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return assertProductShape<ProductWithGame>(data);
  }

  async createProduct(product: Omit<ProductInsert, "created_by">): Promise<Product> {
    const response = await fetch("/api/admin/create-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create product");
    }

    const { product: created } = await response.json();
    return created;
  }

  async updateProduct(id: string, updates: ProductUpdate): Promise<Product> {
    // When image_path changes, delete the previous object from storage so we
    // don't accumulate orphans. Admin role has DELETE on storage.objects for
    // product-images (migration 00027), so this runs on the injected client.
    let previousImagePath: string | null = null;
    if (updates.image_path) {
      const { data: existing } = await this.supabase
        .from("products")
        .select("image_path")
        .eq("id", id)
        .single();
      previousImagePath = existing?.image_path ?? null;
    }

    const { data, error } = await this.supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (
      previousImagePath &&
      updates.image_path &&
      previousImagePath !== updates.image_path
    ) {
      await this.supabase.storage
        .from("product-images")
        .remove([previousImagePath]);
    }

    return assertProductShape<Product>(data);
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async toggleProductVisibility(id: string, isVisible: boolean): Promise<Product> {
    return this.updateProduct(id, { is_visible: isVisible });
  }

}

import type { Product, ProductInsert, ProductUpdate } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export type ProductWithGame = Product & { games: { name: string } | null };

export class ProductsService {
  constructor(private supabase: SupabaseClientType) {}

  async getActiveProducts(): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getAllProducts(): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getProduct(id: string): Promise<ProductWithGame> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
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
    const { data, error } = await this.supabase
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async toggleProductStatus(id: string, isActive: boolean): Promise<Product> {
    return this.updateProduct(id, { is_active: isActive });
  }

  async searchProducts(query: string): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }
}

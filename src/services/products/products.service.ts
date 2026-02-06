import type { Product, ProductInsert, ProductUpdate } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class ProductsService {
  constructor(private supabase: SupabaseClientType) {}

  async getActiveProducts(): Promise<Product[]> {
    const { data, error } = await this.supabase.rpc("get_active_products");
    if (error) throw error;
    return data || [];
  }

  async getAllProducts(): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getProduct(id: string): Promise<Product> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  async createProduct(product: ProductInsert): Promise<Product> {
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

  async searchProducts(query: string): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .contains("metadata", { category })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }
}

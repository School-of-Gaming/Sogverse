import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductInsert, ProductUpdate, Database } from "@/types";

export type ProductWithGame = Product & { games: { name: string } | null };

// Shape sent to /api/admin/create-product. The image is a File (required);
// the server uploads it inside the same request that inserts the row so a
// failed insert never leaves an orphan in the bucket.
export type CreateProductInput = Omit<
  ProductInsert,
  "created_by" | "image_path"
> & {
  image: File;
};

// Shape sent to /api/admin/update-product. The image is optional — undefined
// or null means "don't change the current image", a File means "replace".
export type UpdateProductInput = Omit<
  ProductUpdate,
  "image_path"
> & {
  image?: File | null;
};

export class ProductsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getVisibleProducts(): Promise<ProductWithGame[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, games(name)")
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
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

  async createProduct(input: CreateProductInput): Promise<Product> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("file", image);
    formData.append("data", JSON.stringify(metadata));

    const response = await fetch("/api/admin/create-product", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to create product");
    }

    const { product } = (await response.json()) as { product: unknown };
    return product as Product;
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("id", id);
    formData.append("data", JSON.stringify(metadata));
    if (image instanceof File) {
      formData.append("file", image);
    }

    const response = await fetch("/api/admin/update-product", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update product");
    }

    const { product } = (await response.json()) as { product: unknown };
    return product as Product;
  }

  async deleteProduct(id: string): Promise<void> {
    // Fetch image_path before deleting so we can clean up the bucket object.
    // If the storage remove later fails, the DB row is already gone — one
    // orphan is better than blocking the delete, and delete cannot
    // *introduce* orphans the way create/update can.
    const { data: existing } = await this.supabase
      .from("products")
      .select("image_path")
      .eq("id", id)
      .single();

    const { error } = await this.supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) throw error;

    if (existing?.image_path) {
      await this.supabase.storage
        .from("product-images")
        .remove([existing.image_path]);
    }
  }

  async toggleProductVisibility(id: string, isVisible: boolean): Promise<Product> {
    return this.updateProduct(id, { is_visible: isVisible });
  }

}

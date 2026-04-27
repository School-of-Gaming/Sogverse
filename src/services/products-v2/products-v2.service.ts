import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ProductV2,
  ProductTypeV2,
  BillingModeV2,
  ProductStatusV2,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

export type ProductV2WithTopic = ProductV2 & {
  topics_v2: { name: string; slug: string } | null;
};

export type ScheduleSlotInput = {
  weekday: number;
  start_time: string;
  duration_minutes: number;
};

export type PriceInput = {
  currency: SupportedCurrency;
  price_per_session: number;
  price_per_month: number;
};

// Shape accepted by /api/admin/products-v2/create.
// Mirrors create_product_v2() RPC args, minus the image (uploaded separately
// as the last step so a failed insert never leaves an orphan in the bucket —
// see docs/products-redesign.md and docs/email-architecture.md for the
// image-last pattern).
export type CreateProductV2Input = {
  product_type: ProductTypeV2;
  billing_mode: BillingModeV2;
  name: string;
  description: string;
  topic_id: string;
  min_age: number;
  max_age: number;
  spoken_language_code: string;
  padlet_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  status: ProductStatusV2;
  signup_threshold: number | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string | null;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  tag_ids: string[];
  prices: PriceInput[];
  holiday_calendar_ids: string[];
  image: File | null;
};

export class ProductsV2Service {
  constructor(private supabase: SupabaseClient<Database>) {}

  async listByType(type: ProductTypeV2): Promise<ProductV2WithTopic[]> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select("*, topics_v2(name, slug)")
      .eq("product_type", type)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async createProduct(input: CreateProductV2Input): Promise<string> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("data", JSON.stringify(metadata));
    if (image) {
      formData.append("file", image);
    }

    const response = await fetch("/api/admin/products-v2/create", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to create product");
    }

    const { product_id } = (await response.json()) as { product_id: string };
    return product_id;
  }
}

import type { AppSupabaseClient, GamerPhotoConsentType } from "@/types";

/**
 * Which photo consents **one product asks for** — the other half of the
 * feature, and a different question from what any child has answered.
 *
 * It is a read of `product_gamer_photo_consents`, whose rows are written only
 * by an admin RPC and are readable through the product's own read predicate. A
 * product with no rows asks nothing, and on such a product every staff surface
 * this answer feeds renders exactly as it did before the consent existed.
 *
 * **A service of its own rather than a method on the consents service**, and
 * the split is the subject: that one is about a *gamer's* stored answer, this
 * is about a *product's* question. They are read by different surfaces at
 * different moments — a page asks this once, and asks the other for a whole
 * roster — and keeping the two apart is what stops a caller with a product id
 * being handed a class whose other methods want a child's.
 *
 * The staff surfaces that use this could equally read the ask set off the
 * product document their page already has; they do not, because that document
 * belongs to a different feature's contracts and this is a small, indexed,
 * bounded read that no page's first paint waits on.
 */
export class ProductGamerPhotoConsentsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The consent types this product asks for, in whatever order the table
   * answers in — an empty array on a product that asks nothing, which is every
   * product but the Roblox Programme's.
   *
   * Order is not meaningful here: the registry owns the order these are ever
   * *offered* in, and every consumer of this list either asks a set membership
   * question of it or intersects it with that registry.
   */
  async getForProduct(productId: string): Promise<GamerPhotoConsentType[]> {
    const { data, error } = await this.supabase
      .from("product_gamer_photo_consents")
      .select("consent_type")
      .eq("product_id", productId);

    if (error) throw error;
    return data.map((row) => row.consent_type);
  }
}

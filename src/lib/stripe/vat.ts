// VAT treatment per product type: the Stripe tax code a product is sold under,
// and the Finnish rate that code resolves to today.
//
// Nothing is persisted — the treatment is a pure function of `product_type`,
// derived wherever it is needed, so this table is the only place a code or a
// rate is written down.
//
// **Deliberately not `server-only`.** It holds no secrets, and three callers
// need the same table: the Stripe product helper (server), the admin product
// form (browser), and the re-runnable backfill under `scripts/`, which cannot
// import a `server-only` module at all and must not duplicate the mapping.

import type { ProductType } from "@/types";

export type VatTreatment = "standard" | "reduced";

export interface VatRule {
  treatment: VatTreatment;
  /**
   * The Stripe tax code the product is sold under. This is the money-critical
   * field: Stripe computes the rate actually charged from this code, the
   * customer's location and the date of sale.
   */
  taxCode: string;
  /**
   * Finland's rate for this treatment **today**, as a fraction for
   * `Intl.NumberFormat`'s percent style.
   *
   * **Display only.** Nothing computes with it — Stripe resolves the real rate
   * from `taxCode` and the sale date, which is why no percentage is stored
   * anywhere else. It therefore goes stale the next time Finland moves a band
   * (the reduced rate fell from 14% to 13.5% on 1 January 2026), and that is
   * accepted: a stale number here misinforms an admin reading the product form,
   * it cannot mischarge a customer.
   */
  displayRate: number;
}

/**
 * Camps qualify for Finland's reduced rate, and `txcd_35010001` is the category
 * they are sold under — a finance ruling by the company's CFO, recorded here
 * rather than inferred. Paid events are standard-rated by the same authority.
 * Revisiting either is a finance decision, not an implementation one, and this
 * table is the single place it lands.
 *
 * `municipality_club` is present defensively: those products are invoiced
 * off-platform and never reach Stripe, so nothing consumes that row.
 */
export const VAT_BY_PRODUCT_TYPE: Record<ProductType, VatRule> = {
  camp: {
    treatment: "reduced",
    taxCode: "txcd_35010001",
    displayRate: 0.135,
  },
  consumer_club: {
    treatment: "standard",
    taxCode: "txcd_10000000",
    displayRate: 0.255,
  },
  event: {
    treatment: "standard",
    taxCode: "txcd_10000000",
    displayRate: 0.255,
  },
  municipality_club: {
    treatment: "standard",
    taxCode: "txcd_10000000",
    displayRate: 0.255,
  },
};

/** The VAT rule a product of this type is sold under. */
export function vatForProductType(productType: ProductType): VatRule {
  return VAT_BY_PRODUCT_TYPE[productType];
}

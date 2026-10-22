import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import type { LandingSection } from "@/lib/landing-pages/sections";
import { effectiveStatus, type LifecycleInputs } from "@/lib/products/effective-status";
import type { ProductListingFactsRow } from "@/services/products/products.service";

/*
 * **Which of a page's picked products readers are shown, and why the others
 * are not** — what the admin's status page and the MCP read tools report per
 * products section, so a pick that has gone stale over a term is found and
 * swapped rather than silently missing from the page.
 *
 * Pure: the service reads the listing of every product type
 * (`LANDING_PRODUCT_TYPES`) and the picks' facts, and this decides. Whether a
 * pick is shown is the listing's answer, the same one the public page draws
 * by; the reasons are read off the facts only to explain an absence, never to
 * decide one.
 */

/**
 * Why a pick is not on the listing, in the order they are checked.
 *
 * - `gone` — no product has the id. Saving a structure refuses an id no
 *   product has, and Sogverse has no way to delete a product, so this is
 *   reached only if one is removed by hand.
 * - `notListed` — the admin has unlisted it.
 * - `ended` — its term is over, in its own timezone.
 */
export const LANDING_PICK_REASONS = ["gone", "notListed", "ended"] as const;
export type LandingPickReason = (typeof LANDING_PICK_REASONS)[number];

/** One picked product as the status read reports it. */
export interface LandingProductPick {
  productId: string;
  /** Its name in each language written, in `SUPPORTED_LOCALES` order; empty when gone. */
  names: { locale: SupportedLocale; name: string }[];
  /** Whether readers are shown its card now. */
  shown: boolean;
  /**
   * Why it is not shown, every reason that holds; empty when shown. A pick
   * the listing leaves out with no reason here — a change landing between the
   * two reads — reports `notListed`.
   */
  reasons: LandingPickReason[];
}

/** One products section's picks, in the admin's order. */
export interface LandingProductsSectionPicks {
  sectionId: string;
  /** The section's position in the structure, from one. */
  sectionNumber: number;
  picks: LandingProductPick[];
  /** How many picks are shown; at none the section is not drawn at all. */
  shownCount: number;
}

/**
 * Why a product the listing does not hold is left out of it, every reason
 * that holds — for an existing product, read off its row; the listing's own
 * answer decides whether it is left out at all. Shared by the status read and
 * the MCP product list, so the two explain an absence alike.
 */
export function listingAbsenceReasons(
  product: LifecycleInputs & { is_visible: boolean },
  now: Date,
): Exclude<LandingPickReason, "gone">[] {
  const reasons: Exclude<LandingPickReason, "gone">[] = [];
  if (!product.is_visible) reasons.push("notListed");
  if (effectiveStatus(product, now) === "completed") reasons.push("ended");
  return reasons;
}

/**
 * Every products section of `sections`, each pick with whether it is shown
 * and why not. `listedIds` is the listing's answer for the picks; `facts` the
 * picks' rows, any product absent from them having no row at all.
 */
export function landingProductPicks(
  sections: readonly LandingSection[],
  listedIds: ReadonlySet<string>,
  facts: readonly ProductListingFactsRow[],
  now: Date,
): LandingProductsSectionPicks[] {
  const byId = new Map(facts.map((row) => [row.id, row]));
  return sections.flatMap((section, index) => {
    if (section.type !== "products") return [];
    const picks = section.productIds.map((productId): LandingProductPick => {
      const row = byId.get(productId);
      const shown = listedIds.has(productId);
      const reasons: LandingPickReason[] =
        shown ? [] : row === undefined ? ["gone"] : listingAbsenceReasons(row, now);
      return {
        productId,
        names: row === undefined ? [] : inLocaleOrder(row.product_translations),
        shown,
        reasons: shown || reasons.length > 0 ? reasons : ["notListed"],
      };
    });
    return [
      {
        sectionId: section.id,
        sectionNumber: index + 1,
        picks,
        shownCount: picks.filter((pick) => pick.shown).length,
      },
    ];
  });
}

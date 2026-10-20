import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import type { LandingSection } from "@/lib/landing-pages/sections";
import { effectiveStatus } from "@/lib/products/effective-status";
import type { ProductListingFactsRow } from "@/services/products/products.service";

/*
 * **Which of a page's picked products readers are shown, and why the others
 * are not** — what the admin's status page and the MCP read tools report per
 * products section, so a pick that has gone stale over a term is found and
 * swapped rather than silently missing from the page.
 *
 * Pure: the service reads the shop's listing and the picks' facts, and this
 * decides. Whether a pick is shown is the listing's answer, the same one the
 * public page draws by; the reasons are read off the facts only to explain an
 * absence, never to decide one.
 */

/**
 * Why a pick is not on the shop's listing, in the order they are checked.
 *
 * - `gone` — no product has the id. Saving a structure refuses an id no
 *   product has, and Sogverse has no way to delete a product, so this is
 *   reached only if one is removed by hand.
 * - `notInShop` — a type the shop does not sell: a municipality club, which
 *   families find from its municipality's page instead.
 * - `notListed` — the admin has taken it off the shop's listing.
 * - `ended` — its term is over, in its own timezone.
 */
export const LANDING_PICK_REASONS = ["gone", "notInShop", "notListed", "ended"] as const;
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

const SHOP_TYPES: ReadonlySet<string> = new Set(SHOP_PRODUCT_TYPES);

function reasonsFor(facts: ProductListingFactsRow | undefined, now: Date): LandingPickReason[] {
  if (facts === undefined) return ["gone"];
  const reasons: LandingPickReason[] = [];
  if (!SHOP_TYPES.has(facts.product_type)) reasons.push("notInShop");
  if (!facts.is_visible) reasons.push("notListed");
  if (effectiveStatus(facts, now) === "completed") reasons.push("ended");
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
      const reasons = shown ? [] : reasonsFor(row, now);
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

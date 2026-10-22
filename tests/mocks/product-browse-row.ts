import type { ParticipationCounts } from "@/services/participations/participations.service";
import type { ProductBrowseRow } from "@/types";

/**
 * A shop listing row as the browse read returns it — an online, free Roblox
 * Studio club open now, which is the Roblox programme's rail slice — with any
 * field overridden. For the surfaces fed by the shop's listing: the product
 * rails and their structured data.
 */
export function browseRow(
  id: string,
  overrides: Partial<ProductBrowseRow> & { name?: string } = {},
): ProductBrowseRow {
  const { name = `Product ${id.slice(-4)}`, ...rest } = overrides;
  return {
    id,
    product_type: "consumer_club",
    billing_mode: "free",
    topic: "roblox_studio",
    tag: null,
    min_age: 8,
    max_age: 12,
    for_gamers: true,
    for_parents: false,
    spoken_language_code: "en",
    image_path: null,
    is_remote: true,
    seat_count: 10,
    waitlist_enabled: true,
    registration_opens_at: "2026-01-01T00:00:00Z",
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    product_translations: [{ locale: "en", name, short_description: "" }],
    product_prices: [],
    schedule_slots: [],
    locations: null,
    ...rest,
  };
}

/** Seat counts for a product, nobody seated. */
export function emptyCounts(productId: string): ParticipationCounts {
  return { productId, activeCount: 0, waitlistCount: 0, myGamerStates: {} };
}

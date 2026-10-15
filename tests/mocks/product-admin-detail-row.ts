import type { ProductAdminDetailRow } from "@/services/products";

/** Synthetic admin-detail row covering every field the form touches. */
export function syntheticConsumerProduct(): ProductAdminDetailRow {
  return {
    id: "00000000-0000-0000-0000-0000000005a1",
    product_type: "consumer_club",
    billing_mode: "paid",
    topic: "minecraft_java",
    for_gamers: true,
    for_parents: false,
    min_age: 7,
    max_age: 12,
    tag: null,
    region_lock_country: null,
    requires_gamer_creations: false,
    spoken_language_code: "en",
    // The link is the id; `image_path` is the column the trigger derives from
    // it, and the embed is what the form's image card paints from.
    image_id: "3d9e4a2f-9c1b-4f6e-8a70-5b2c1d0e7f43",
    image_path: "abc.png",
    catalogue_images: { label: "Creeper art", path: "abc.png" },
    // Staff-only, so it arrives on its own embedded row rather than as a column
    // on the product. `null` is the ordinary case: no row means no lesson link.
    product_staff_details: null,
    location_id: null,
    is_remote: true,
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    seat_count: 10,
    waitlist_enabled: true,
    // Already past — reverse transform should pick `immediately`.
    registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    invoice_customer_id: null,
    invoice_customer: null,
    is_visible: true,
    created_by: "admin-1",
    creator: { id: "admin-1", first_name: "Aino", last_name: "Admin" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    product_translations: [
      {
        product_id: "00000000-0000-0000-0000-0000000005a1",
        locale: "en",
        name: "Build Club",
        short_description: "Build castles together.",
        long_description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    product_prices: [
      { currency: "eur", price_cents: 4500 },
      { currency: "gbp", price_cents: 3900 },
      { currency: "usd", price_cents: 5100 },
    ],
    schedule_slots: [
      { weekday: 1, start_time: "16:00", duration_minutes: 90 },
    ],
    locations: null,
    product_required_consents: [{ document_slug: "roblox-programme-terms" }],
    // The optional ask set, stored on its own join table beside the required
    // one. Populated here rather than left empty because the seeding of the
    // *optional* picker is the half with a filter in it — see the tests below.
    product_marketing_consents: [{ consent_type: "lynx_educate" }],
    // The other optional ask set, populated for the same reason: its seeding
    // filters the same way the marketing one's does.
    product_gamer_photo_consents: [{ consent_type: "lynx_educate" }],
    product_holiday_calendars: [
      {
        holiday_calendars: {
          id: "6b1d5c2e-3f4a-4b8c-9d0e-1f2a3b4c5d6e",
          name: "Helsinki schools",
        },
      },
    ],
  };
}

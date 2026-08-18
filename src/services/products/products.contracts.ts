import { z } from "zod";
import { Constants } from "@/types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import { isSeededCountry } from "@/lib/constants/location-hierarchies";

/**
 * Contracts for the admin product create/update routes.
 *
 * The `data` form field is JSON matching CreateProductInput /
 * UpdateProductInput (minus `image`, which travels as a separate form
 * field) — see products.service.ts. Validation here is structural only
 * (types and enums); semantic rules (age ranges, date ordering, the
 * at-least-one-en-or-fi-translation rule) stay in the RPCs' CHECKs and
 * RAISEs, same as before.
 */

const productTranslationInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string(),
  short_description: z.string(),
  // The marketing blurb as authored markdown; null = this locale has none, and
  // the RPC stores SQL NULL. The form folds a blank editor to null rather than
  // sending "", which the column's CHECK refuses.
  long_description: z.string().nullable(),
});

const scheduleSlotInput = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

const priceInput = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES),
  price_cents: z.number(),
});

/** Fields shared by create and update. */
const productDataBase = z.object({
  billing_mode: z.enum(Constants.public.Enums.billing_mode),
  translations: z.array(productTranslationInput),
  topic: z.enum(Constants.public.Enums.product_topic),
  // Who may occupy a seat. Mutually inclusive, and the DB CHECKs are what
  // enforce the two rules that matter: at least one must be true, and the age
  // range is present exactly when `for_gamers` is. Both are required on the
  // wire because both RPC parameters are non-defaulted — an omitting caller
  // must fail loudly rather than silently reset a product's audience.
  for_gamers: z.boolean(),
  for_parents: z.boolean(),
  // Null when the product has no gamer audience: age is a property of the
  // children a product serves and of nothing else, so an adults-only product
  // carries no range rather than a sentinel one.
  min_age: z.number().nullable(),
  max_age: z.number().nullable(),
  // Who the product was *designed* for — a different question from the audience
  // above, which says who may hold a seat. One tag or none: null is untagged,
  // the ordinary state, and it renders nothing anywhere.
  //
  // Required-nullable, on create and update alike, and the update half is the
  // load-bearing one. The RPC parameter is `DEFAULT NULL` (it has to be: null is
  // a legal tag, no CHECK backstops it, and codegen cannot express an explicit
  // null for a non-defaulted argument), so an omitted field would reach a
  // function that assigns every editable column and clear the tag without
  // anybody asking. Demanding the field on the wire is what makes clearing a
  // deliberate `null` rather than an accident of omission — the route then maps
  // null → undefined → DEFAULT NULL → cleared.
  tag: z.enum(Constants.public.Enums.product_tag).nullable(),
  // The one country whose families may enrol, or null for no lock — a third
  // dimension again, independent of both the audience above and the spoken
  // language below (a club delivered in English is not a club for one country).
  //
  // Required-nullable for exactly the reason `tag` is, and the update half is
  // again the load-bearing one: the RPC parameter is `DEFAULT NULL` because
  // codegen cannot express an explicit null for a non-defaulted argument, so an
  // omitted field would reach a function that assigns every editable column and
  // silently unlock the product. Demanding the field is what makes unlocking a
  // deliberate `null`; the route then maps null → undefined → DEFAULT NULL.
  //
  // Constrained to the SEEDED countries rather than to the CHECK's alpha-2
  // shape, because this is the boundary that can see the location config. A lock
  // pointing at a country whose municipalities were never seeded is one no
  // family's stored location could satisfy — an unpassable gate that looks from
  // the admin form exactly like a working one. The database deliberately holds
  // only the shape invariant: which countries are seeded changes as rows land,
  // so an enum or FK there would need a migration per country and would turn an
  // already-stored lock into a violation the day one is un-seeded.
  //
  // `refine` rather than `z.enum` because `CountryConfig.code` is typed
  // `string`, so a tuple built from it narrows to nothing a literal union could
  // be made of — the enum would buy an error message and no type at all.
  region_lock_country: z
    .string()
    .refine(isSeededCountry, {
      message: "Not a country products can be locked to",
    })
    .nullable(),
  spoken_language_code: z.string(),
  // Gedu/admin-only lesson-material link. It is a field of the product *form*
  // but not a column on `products` — the RPC files it under
  // `product_staff_details`, whose read grant no parent or anonymous visitor
  // holds. Null (or blank) means no row.
  material_url: z.string().nullable(),
  location_id: z.string().nullable(),
  is_remote: z.boolean(),
  signup_threshold: z.number().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  timezone: z.string(),
  seat_count: z.number().nullable(),
  waitlist_enabled: z.boolean(),
  registration_opens_at: z.string(),
  is_visible: z.boolean(),
  schedule_slots: z.array(scheduleSlotInput),
  prices: z.array(priceInput),
  holiday_calendar_ids: z.array(z.string()),
  // Per-session operating fees, a single EUR amount in integer cents. State is
  // derived from the value (the form enforces it): null = unknown/none,
  // 0 = volunteer (free), > 0 = a real fee. Gedu fees are int >= 0 here; the
  // municipality fee's `> 0` and muni-only rules are cross-checked by the DB
  // CHECK constraints on `products`, so we only assert int at the boundary.
  primary_gedu_fee_cents: z.number().int().nonnegative().nullable(),
  assistant_gedu_fee_cents: z.number().int().nonnegative().nullable(),
  municipality_fee_cents: z.number().int().nullable(),
});

/** The `data` field of POST /api/admin/products/create. */
export const createProductData = productDataBase.extend({
  product_type: z.enum(Constants.public.Enums.product_type),
  // Optional: the RPC defaults it (p_status?) and the old route tolerated
  // absence, though the admin form always sends it.
  status: z.enum(Constants.public.Enums.product_status).optional(),
});

/** The `data` field of POST /api/admin/products/[id]/update. */
export const updateProductData = productDataBase;

/** Response of the admin product create/update routes. */
export const productIdResponse = z.object({
  product_id: z.string(),
});

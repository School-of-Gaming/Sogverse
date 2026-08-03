import { z } from "zod";
import { Constants } from "@/types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";

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
  // null = no long description for this locale (the RPC stores SQL NULL).
  long_description: z
    .array(
      z.object({
        type: z.enum(["heading", "paragraph"]),
        text: z.string(),
      })
    )
    .nullable(),
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

/**
 * Fields shared by create and update. `refund_policy_days` is accepted for
 * non-UI callers (the RPCs support it) but the admin form never sends it.
 */
const productDataBase = z.object({
  billing_mode: z.enum(Constants.public.Enums.billing_mode),
  translations: z.array(productTranslationInput),
  topic: z.enum(Constants.public.Enums.product_topic),
  min_age: z.number(),
  max_age: z.number(),
  spoken_language_code: z.string(),
  padlet_url: z.string().nullable(),
  // Gedu/admin-only lesson-material link. Deliberately NOT a rename of
  // padlet_url and never backfilled from it: the Padlet held family-facing
  // session notes, while this is lesson content families must never see.
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
  refund_policy_days: z.number().nullable().optional(),
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

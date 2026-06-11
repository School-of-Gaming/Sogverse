import { z } from "zod";
import { Constants } from "@/types";

/**
 * Runtime contracts for the gedu assignment RPCs. The generated types can't
 * see inside these functions — `get_my_assigned_products` is RETURNS TABLE
 * (every column non-nullable from the column type alone, jsonb degraded to
 * `Json`) and `get_gedu_assigned_product` is a JSONB document (`Json`) — so
 * these schemas are the source of the structure, written from the RPC bodies
 * in supabase/schema.sql. The db tests parse real RPC output through the
 * same schemas, so CI verifies they stay true to Postgres.
 */

const productTranslationSummary = z.object({
  locale: z.string(),
  name: z.string(),
  description: z.string(),
});

const scheduleSlotSummary = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

/** Rows of `get_my_assigned_products` (nullability per the products schema). */
export const myAssignedProductRows = z.array(
  z.object({
    product_id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    timezone: z.string(),
    is_remote: z.boolean(),
    padlet_url: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    group_id: z.string(),
    group_count: z.number(),
    gamer_count: z.number(),
    product_translations: z.array(productTranslationSummary),
    schedule_slots: z.array(scheduleSlotSummary),
  })
);

/** The `get_gedu_assigned_product` JSONB document (types/index.ts interfaces). */
export const geduAssignedProduct = z.object({
  product: z.object({
    id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    padlet_url: z.string().nullable(),
    timezone: z.string(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    is_remote: z.boolean(),
    translations: z.array(productTranslationSummary),
    schedule_slots: z.array(scheduleSlotSummary),
  }),
  my_group_id: z.string(),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      created_at: z.string(),
      is_my_group: z.boolean(),
      gamer_count: z.number(),
      gedus: z.array(z.object({ id: z.string(), first_name: z.string() })),
      // Populated only on the caller's own group; null on sister groups.
      roster: z
        .array(
          z.object({
            gamer_id: z.string(),
            first_name: z.string(),
            date_of_birth: z.string().nullable(),
            minecraft_username: z.string().nullable(),
            minecraft_uuid: z.string().nullable(),
            gender: z.enum(Constants.public.Enums.gender_type).nullable(),
            parent_email: z.string().nullable(),
          })
        )
        .nullable(),
    })
  ),
});

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
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    group_id: z.string(),
    group_count: z.number(),
    participant_count: z.number(),
    product_translations: z.array(productTranslationSummary),
    schedule_slots: z.array(scheduleSlotSummary),
  })
);

/** The `get_gedu_assigned_product` JSONB document (types/index.ts interfaces). */
export const geduAssignedProduct = z.object({
  product: z.object({
    id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    /**
     * What the product is about — and therefore which game identity, if any,
     * its surfaces show. Non-nullable because the column is (every product has
     * a topic); the topic → platform mapping lives in `src/lib/products/topics`
     * rather than in the RPC, so a topic changing sides is a code decision
     * rather than a migration.
     */
    topic: z.enum(Constants.public.Enums.product_topic),
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
      participant_count: z.number(),
      gedus: z.array(z.object({ id: z.string(), first_name: z.string() })),
      // Populated only on the caller's own group; null on sister groups.
      roster: z
        .array(
          z.object({
            participant_id: z.string(),
            first_name: z.string(),
            date_of_birth: z.string().nullable(),
            minecraft_username: z.string().nullable(),
            minecraft_uuid: z.string().nullable(),
            /**
             * The Roblox pair (00195), independent of the Minecraft one: a
             * child may have given one, both or neither. The account id is a
             * number because Roblox's key is an int64 `bigint`, and its
             * presence is the whole of "verified".
             */
            roblox_username: z.string().nullable(),
            roblox_user_id: z.number().nullable(),
            gender: z.enum(Constants.public.Enums.gender_type).nullable(),
            parent_email: z.string().nullable(),
            /**
             * The seat-holder's own address, for an adult participant; null on
             * a child row, where `parent_email` is the contact. Present here
             * for parity with the gedu feed's roster, which is the copy every
             * rendered roster actually comes from — one roster shape with two
             * definitions is how the two drift.
             */
            participant_email: z.string().nullable(),
            /**
             * The staff-only flair (00203), emitted for every roster row — note
             * or no note, stamp or no stamp.
             *
             * `group_joined_at` is when this seat entered **this group**, as
             * against the product-wide signup date: a move between two groups of
             * one product resets it. It is emitted unconditionally because a
             * timestamp is a *fact* and the clubs-only newcomer rule is a
             * *presentation* rule the client applies through
             * `showsNewcomerBadge`; null here means the seat predates the column
             * (there was deliberately no backfill), never "not a club".
             *
             * `note` is the (group, member) staff note, null when no row exists
             * — the absence of a row is what "no note" means everywhere.
             * `note_updated_by_first_name` is null alongside a note only when
             * the editor's account is gone, and the surface then shows the note
             * with no editor line.
             *
             * Kept in parity with the gedu feed's roster entry, which is the
             * copy every rendered roster actually comes from.
             */
            group_joined_at: z.string().nullable(),
            note: z.string().nullable(),
            note_updated_by_first_name: z.string().nullable(),
          })
        )
        .nullable(),
    })
  ),
});

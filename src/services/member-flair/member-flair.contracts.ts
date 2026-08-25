import { z } from "zod";
import { Constants } from "@/types";

/**
 * Wire contracts for the two member-flair RPCs (00203).
 *
 * Both return a JSONB document, which the type generator can only see as
 * `Json`, so these schemas — written from the function bodies in the migration
 * that defines them — are the structure. The db tests parse real RPC output
 * through the same schemas in CI, so Postgres and TypeScript cannot drift apart
 * quietly: a changed key fails the parse loudly instead of arriving as
 * `undefined` three components later.
 *
 * The three fields below are the *same three* the three roster documents gained
 * in the same migration, spelled identically on purpose. A surface reading
 * either shape is reading one fact about one (group, member) pair.
 */

/**
 * One member's staff-only marks, as `get_group_staff_overlay` keys them by
 * participant id.
 *
 * Every field is nullable and each null means something different. A null
 * `group_joined_at` is a seat that predates the column (there was deliberately
 * no backfill) — never "not a club", because the join stamp is a **fact** and
 * the clubs-only newcomer rule is a presentation rule the client applies. A
 * null `note` is the absence of a row, which is what "no note" means
 * everywhere. A null `note_updated_by_first_name` alongside a note is an editor
 * whose account is gone (`updated_by` is ON DELETE SET NULL), and the surface
 * then shows the note with no editor line.
 */
export const groupStaffOverlayMember = z.object({
  group_joined_at: z.string().nullable(),
  note: z.string().nullable(),
  note_updated_by_first_name: z.string().nullable(),
});

/**
 * The `get_group_staff_overlay` document: one group's staff-only marks.
 *
 * `product_type` travels because the voice room has **no other route to it** —
 * `/voice/group/[id]` is passed a group id and a back link, and the Daily token
 * deliberately carries nothing staff-shaped. It is nullable because an unknown
 * group id returns a null-shaped document to an admin rather than raising, so a
 * caller applying the clubs-only rule has to treat "no product type" as "no
 * badge" rather than assume a value is there.
 *
 * `members` covers every **active** participation of the group, note or no note,
 * stamp or no stamp — so the map's own keys are the seat-holder set a note may
 * be written about. Do not derive a separate ids list beside it; a second list
 * of the same people is a second thing that has to stay true. A participant id
 * absent from the map (a visiting admin, the gedu themselves, a stale peer)
 * simply gets no flair.
 */
export const groupStaffOverlay = z.object({
  product_type: z.enum(Constants.public.Enums.product_type).nullable(),
  members: z.record(z.string(), groupStaffOverlayMember),
});

/**
 * What `set_gamer_group_note` hands back — the (group, member) note as it now
 * stands.
 *
 * A trimmed-empty save **deletes** the row and returns this same shape with
 * `note`, `note_updated_by_first_name` and `updated_at` all null, so a caller
 * merges the same keys whichever way the write went. That is why the three are
 * nullable here and why the delete is not a separate result shape.
 */
export const gamerGroupNoteResult = z.object({
  group_id: z.string(),
  participant_id: z.string(),
  note: z.string().nullable(),
  note_updated_by_first_name: z.string().nullable(),
  updated_at: z.string().nullable(),
});

/**
 * The compile-time shapes, derived from the schemas above so the wire contract
 * and the type cannot drift. Re-exported through `@/types` (see
 * `src/types/index.ts`) so consumers keep a single import surface.
 */
export type GroupStaffOverlayMember = z.infer<typeof groupStaffOverlayMember>;
export type GroupStaffOverlay = z.infer<typeof groupStaffOverlay>;
export type GamerGroupNoteResult = z.infer<typeof gamerGroupNoteResult>;

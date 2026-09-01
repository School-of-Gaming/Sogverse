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
 * The staff-flair fields below are the *same fields* the roster documents
 * gained in the same migrations — the three of 00203 and `creations` since
 * 00227 — spelled identically on purpose. A surface reading either shape is
 * reading one fact about one (group, member) pair.
 *
 * This file is also the home of the **creation entry** shape itself, because
 * this is the service that owns the write. Four documents carry that list (the
 * two staff rosters, this overlay and the family product feed) and all four
 * import the one definition, since its rules are a single CHECK constraint in
 * the database rather than a per-document choice.
 */

// ---------------------------------------------------------------------------
// Gamer creations (00227) — the list, and the one place its shape is written
// ---------------------------------------------------------------------------

/**
 * The caps, and the code-side twin of `chk_gamer_group_creations_shape`.
 *
 * Twenty entries is a sanity bound rather than a product limit — almost every
 * member has zero or one — and 2000 is the practical ceiling for a URL anyone
 * will paste. They live here because the editor needs the same numbers the
 * CHECK enforces: the dialog is built never to hit that constraint, so the
 * constraint stays a loud backstop rather than a routine error path, and that
 * only holds while the two agree. Changing one means changing the other, in the
 * same commit.
 */
export const GAMER_CREATION_MAX_ENTRIES = 20;

/** @see GAMER_CREATION_MAX_ENTRIES */
export const GAMER_CREATION_TITLE_MAX_LENGTH = 200;

/** @see GAMER_CREATION_MAX_ENTRIES */
export const GAMER_CREATION_URL_MAX_LENGTH = 2000;

/**
 * A staff-authored string that is capped and may not be blank — the two rules
 * the CHECK states for both of a creation's fields.
 *
 * **Validated, never transformed.** The write RPC stores the value verbatim (no
 * trimming, no key filtering), because rebuilding each element would quietly
 * discard the extra keys the CHECK exists to refuse — so a schema that trimmed
 * would describe a value the database does not hold, and would keep reporting a
 * different string on the way back out than the one that went in. The blankness
 * rule is therefore a refinement over the raw value rather than a `.trim()`.
 *
 * The one place this is looser than Postgres: `String.length` counts UTF-16
 * code units and the CHECK's `like_regex` counts characters, so a title of 200
 * astral-plane characters passes here and is refused there. Accepted — the
 * caps are sanity bounds, the CHECK is the authority, and the disagreement is
 * unreachable through the editor. Blankness diverges the other way and is
 * therefore harmless: JS `trim()` strips every Unicode space separator, a
 * non-breaking space included, where the CHECK's POSIX `[[:space:]]` need not
 * — so a title of one NBSP is refused here and would be accepted there. The
 * strict end is the client, and the client is the only writer.
 */
function cappedNonBlank(max: number, field: string) {
  return z
    .string()
    .max(max, `${field} must be at most ${max} characters`)
    .refine((value) => value.trim().length > 0, `${field} must not be blank`);
}

/**
 * One thing a member made during a group's run: a short title and a URL, both
 * required, both plain staff-authored text.
 *
 * **`.strict()`, because the CHECK is.** An element carries EXACTLY the keys
 * `title` and `url` — the constraint refuses any other — so a document arriving
 * with a third key means Postgres and this file have parted company, and the
 * parse should say so rather than silently drop it.
 *
 * The URL is **not validated as a URL**, deliberately: staff are trusted, the
 * value is stored as raw text, and the safety lives on the render side, where a
 * value that does not parse as http(s) degrades to its title in plain text
 * rather than becoming an anchor. That is why the title is required — it is the
 * label the degrade path needs.
 *
 * **This shape is a vocabulary, not a document shape**, which is what makes it
 * the one copy every reader imports: its rules are a single CHECK constraint in
 * the database, so a second definition beside another document's schema would
 * be a second source of truth for one fact and could only ever drift into being
 * wrong. (The distinction, and the reason the *documents* around it are not
 * shared, is stated in the family feed's contracts file.)
 */
export const gamerCreation = z
  .object({
    title: cappedNonBlank(GAMER_CREATION_TITLE_MAX_LENGTH, "title"),
    url: cappedNonBlank(GAMER_CREATION_URL_MAX_LENGTH, "url"),
  })
  .strict();

/**
 * A member's creations in one group, in the order staff arranged them.
 *
 * Array order **is** display order — there is no position column and no reorder
 * affordance — and the array is always present: every reader emits `[]` rather
 * than null when there is no row, so nobody downstream has to decide what a
 * null list means. An empty list is also how "no creations" is written on the
 * way *in*: the write RPC deletes the row rather than storing `[]`, and the
 * CHECK refuses an empty array, so the two states cannot both exist.
 */
export const gamerCreationList = z
  .array(gamerCreation)
  .max(
    GAMER_CREATION_MAX_ENTRIES,
    `at most ${GAMER_CREATION_MAX_ENTRIES} creations`,
  );

/**
 * One member's staff-only marks, as `get_group_staff_overlay` keys them by
 * participant id.
 *
 * The three nullable fields are nullable for three different reasons. A null
 * `group_joined_at` is a seat that predates the column (there was deliberately
 * no backfill) — never "not a club", because the join stamp is a **fact** and
 * the clubs-only newcomer rule is a presentation rule the client applies. A
 * null `note` is the absence of a row, which is what "no note" means
 * everywhere. A null `note_updated_by_first_name` alongside a note is an editor
 * whose account is gone (`updated_by` is ON DELETE SET NULL), and the surface
 * then shows the note with no editor line.
 *
 * `creations` (00227) is the exception and is never null: a list has a real
 * empty value where a note does not, so the RPC emits `[]` and no reader has to
 * decide what an absent list means. It is also the one entry here that is **not
 * staff-only** — the member's own family reads the same list on their product
 * page — and it rides this staff document anyway, because the per-gamer dialog
 * is identical in every mount, the voice room included.
 */
export const groupStaffOverlayMember = z.object({
  group_joined_at: z.string().nullable(),
  note: z.string().nullable(),
  note_updated_by_first_name: z.string().nullable(),
  creations: gamerCreationList,
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
 * What a caller sends `set_gamer_group_creations` — the whole list, replacing
 * whatever is stored.
 *
 * `set`-shaped rather than per-row add/update/delete: nothing reads or
 * references a single creation, and a small list edited in a dialog is replaced
 * whole. An **empty list deletes the row**, because absence of a row is what "no
 * creations" means on every surface.
 *
 * Parsed on the way out rather than only on the way back: the caps here are the
 * CHECK's, so a malformed list is refused before it costs a round trip, and the
 * constraint stays the loud backstop it is meant to be.
 */
export const setGamerGroupCreationsBody = z.object({
  groupId: z.string().uuid(),
  participantId: z.string().uuid(),
  creations: gamerCreationList,
});

/**
 * What `set_gamer_group_creations` hands back — the (group, member) list as it
 * now stands.
 *
 * An empty save **deletes** the row and returns this same shape with an empty
 * `creations` and a null `updated_at`, so a caller merges the same keys
 * whichever way the write went. That is why `updated_at` is nullable here and
 * why the delete is not a separate result shape.
 */
export const gamerGroupCreationsResult = z.object({
  group_id: z.string(),
  participant_id: z.string(),
  creations: gamerCreationList,
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
export type GamerCreation = z.infer<typeof gamerCreation>;
export type GamerCreationList = z.infer<typeof gamerCreationList>;
export type SetGamerGroupCreationsBody = z.infer<
  typeof setGamerGroupCreationsBody
>;
export type GamerGroupCreationsResult = z.infer<
  typeof gamerGroupCreationsResult
>;

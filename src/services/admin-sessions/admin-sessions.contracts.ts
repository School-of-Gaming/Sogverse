import { z } from "zod";
import {
  geduFeedSession,
  geduFeedSite,
  scheduleSlotSummary,
} from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * Wire contract for the admin product's session document.
 *
 * `get_admin_product_sessions` returns one JSONB blob the type generator can
 * only see as `Json`, so this schema — written from the function body in the
 * migration that defines it — is the structure, and the db tests parse real RPC
 * output through it in CI.
 *
 * **The session and site shapes are imported, never restated.** The admin
 * surface renders the *gedu's own* feed component over the *same* session rows,
 * and its site panel is the gedu's site panel; a second copy of either schema
 * would be a second place for the database's shape to be described, and the two
 * would drift the first time a column was added to one and not the other. What
 * this file owns is only the part that is genuinely new: a product-keyed
 * envelope carrying every group at once.
 */

/**
 * One person on a group's register.
 *
 * Deliberately *not* the gedu feed's roster entry, which carries dates of
 * birth, game identities and contact addresses. The only thing this surface
 * does with a roster is take the attendance register, so it asks for the id to
 * key a mark by and the name to print beside the checkbox — and the groups
 * panel on the same page already answers "who are these people" through its own
 * admin read.
 */
export const adminSessionRosterEntry = z.object({
  participant_id: z.string(),
  first_name: z.string(),
});

/** One group on the product: its standing notes, its register, its history. */
export const adminSessionGroup = z.object({
  id: z.string(),
  name: z.string(),
  /** Sort key, and the one the groups panel on the same page orders by. */
  created_at: z.string(),
  public_note: z.string().nullable(),
  gedu_note: z.string().nullable(),
  roster: z.array(adminSessionRosterEntry),
  sessions: z.array(geduFeedSession),
});

/**
 * Everything the admin product page's Sessions panel renders, for every group
 * on the product, in one read.
 *
 * There is no derived occurrence list in here, for the same reason the gedu
 * feed has none: the RPC returns rows and schedule parameters, and the calendar
 * merge that lays stored rows over projected occurrences happens once, on the
 * client, in the module both surfaces call.
 */
export const adminProductSessions = z.object({
  product: z.object({
    id: z.string(),
    timezone: z.string(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    /** Decides whether there is a building — and so a site panel — at all. */
    is_remote: z.boolean(),
    schedule_slots: z.array(scheduleSlotSummary),
  }),
  /** The venue, on in-person products. `null` on anything remote. */
  site: geduFeedSite.nullable(),
  groups: z.array(adminSessionGroup),
});

export type AdminProductSessions = z.infer<typeof adminProductSessions>;
export type AdminSessionGroup = z.infer<typeof adminSessionGroup>;
export type AdminSessionRosterEntry = z.infer<typeof adminSessionRosterEntry>;

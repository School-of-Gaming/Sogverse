import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createSandboxFeedToken } from "@/lib/calendar-feed/token";
import {
  defaultSandboxDefinition,
  sandboxDefinitionSchema,
  type SandboxDefinition,
} from "@/lib/calendar-feed/sandbox";
import {
  sandboxInvitationsSchema,
  type SandboxInvitations,
} from "@/lib/calendar-invitations/bookkeeping";
import {
  calendarFeedSandboxActionBody,
  calendarFeedSandboxResponse,
  calendarFeedSandboxSaveBody,
  type CalendarFeedSandboxResponse,
} from "@/services/calendar-feed/calendar-feed.contracts";
import type { AppSupabaseClient } from "@/types";

/**
 * The admin's own sandbox family: read it, save it, reset it.
 *
 * Everything here runs on the **admin's own session client**. The table's one
 * policy answers to `is_admin() AND owner_id = auth.uid()`, so the database
 * makes the same decision this route's role gate does and then a second one the
 * gate cannot make — that this row is *theirs*. The service-role client has no
 * business in a request that has a caller; the feed route is the opposite case
 * and reaches for it, because a calendar app polling a sandbox URL has no
 * session at all.
 *
 * **`GET` creates on first read.** An admin opening the testing card has a
 * sandbox, always — there is no empty state to design, no "create one" button,
 * and no moment where the feed URL on screen points at nothing. The seeded
 * family is the same one Reset restores.
 *
 * The document's shape is owned by the sandbox schema rather than by the
 * column, which guarantees only that it holds an object. This route parses on
 * the way in (so a malformed or over-large document is a 400 the admin can see
 * rather than a broken feed they cannot) and the feed route parses on the way
 * out.
 *
 * **The document has two writers, and each preserves the other's half.** This
 * route writes the family — the parent, the gamers, the products, the seats —
 * and the calendar-invitation route writes `invitations`, the per-seat iTIP
 * bookkeeping that rides in the same row for want of a table of its own.
 * Neither may overwrite the other: a save carries the stored `invitations`
 * forward untouched, and the invitation route merges its record onto a document
 * it has just re-read. Without that, the workflow the tools exist for — send an
 * invitation, edit the family, save, send the update — loses the `UID` and
 * `SEQUENCE` the update needs, and does so silently.
 */

/** The row shape every handler here returns, read back after the write. */
const SELECT = "id, definition, updated_at";

interface SandboxRow {
  id: string;
  definition: unknown;
  updated_at: string;
}

/** The row as the card wants it: the parsed document plus its feed token. */
async function toResponse(row: SandboxRow): Promise<CalendarFeedSandboxResponse> {
  const parsed = sandboxDefinitionSchema.safeParse(row.definition);
  if (!parsed.success) {
    // A stored document written under an older shape of the schema. The admin
    // can fix it in one press, so the message names the press — which only
    // reaches them because `GET` discloses its own error messages. The write
    // handlers cannot produce this: they read back a document the schema just
    // parsed, so a 409 there would be unreachable.
    throw new ApiError(
      "This sandbox was stored in an older shape — reset it to the default to continue.",
      409,
    );
  }
  return {
    definition: parsed.data,
    token: await createSandboxFeedToken(row.id),
    updatedAt: row.updated_at,
  };
}

/** Write the caller's document, creating the row if this is their first save. */
async function save(
  supabase: AppSupabaseClient,
  ownerId: string,
  definition: SandboxDefinition,
): Promise<CalendarFeedSandboxResponse> {
  const { data, error } = await supabase
    .from("calendar_feed_sandboxes")
    .upsert(
      { owner_id: ownerId, definition },
      // `owner_id` is UNIQUE and is what "the caller's sandbox" means, so the
      // conflict target is the identity rather than the primary key — a save
      // must not need to know the id of a row it may be about to create.
      { onConflict: "owner_id" },
    )
    .select(SELECT)
    .single();

  if (error) throw error;
  return toResponse(data);
}

/**
 * The stored document's `invitations` half, read on its own.
 *
 * Deliberately not the whole-document schema: a row stored under an older shape
 * of the *family* still holds bookkeeping that is perfectly readable, and the
 * save about to happen is what fixes that row anyway. A `z.object` ignores every
 * other key, so this parses exactly the one field and nothing else — and when
 * that field is absent, malformed, or there is no row yet, there is nothing to
 * carry forward and the answer is `undefined`.
 */
const storedInvitations = z.object({
  invitations: sandboxInvitationsSchema.optional(),
});

async function readInvitations(
  supabase: AppSupabaseClient,
  ownerId: string,
): Promise<SandboxInvitations | undefined> {
  const { data, error } = await supabase
    .from("calendar_feed_sandboxes")
    .select("definition")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return undefined;

  const parsed = storedInvitations.safeParse(data.definition);
  return parsed.success ? parsed.data.invitations : undefined;
}

/** The caller's family, wearing the bookkeeping the row already holds. */
function withStoredInvitations(
  definition: SandboxDefinition,
  invitations: SandboxInvitations | undefined,
): SandboxDefinition {
  // Whatever the body said about `invitations` is dropped here rather than
  // merged: the editor has no business writing that half, and a draft it seeded
  // when the card opened is exactly the stale copy this rule exists to refuse.
  const { invitations: _fromBody, ...family } = definition;
  return invitations === undefined ? family : { ...family, invitations };
}

export const GET = defineRoute({
  posture: "role-gated",
  roles: "admin",
  // Admin-only developer tooling, and the only message it throws is its own
  // curated 409 telling the admin to press Reset. Generic status text would
  // leave them a conflict with no way out, which is the whole of what this
  // sentence is for.
  discloseErrorMessages:
    "the 409 is this route's own copy naming the one press that fixes a stale sandbox document, and it is useless as generic status text",
  response: calendarFeedSandboxResponse,
  async handler({ user, supabase }): Promise<CalendarFeedSandboxResponse> {
    const { data, error } = await supabase
      .from("calendar_feed_sandboxes")
      .select(SELECT)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (data !== null) return toResponse(data);

    return save(supabase, user.id, defaultSandboxDefinition());
  },
});

export const PUT = defineRoute({
  posture: "role-gated",
  roles: "admin",
  body: calendarFeedSandboxSaveBody,
  response: calendarFeedSandboxResponse,
  /**
   * Save the family, and carry the invitation bookkeeping across unread.
   *
   * The two halves of the document have two owners: the editor owns everything
   * except `invitations`, the calendar-invitation route owns `invitations` and
   * nothing else, and each write preserves the other's half. So this handler
   * reads the stored row's bookkeeping and writes it back verbatim, and any
   * `invitations` the body carried is discarded — the contract still accepts the
   * key, because a client sending back the document it was handed must keep
   * working, but accepting it is not the same as honouring it.
   */
  async handler({ body, user, supabase }): Promise<CalendarFeedSandboxResponse> {
    const invitations = await readInvitations(supabase, user.id);
    return save(
      supabase,
      user.id,
      withStoredInvitations(body.definition, invitations),
    );
  },
});

export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  body: calendarFeedSandboxActionBody,
  response: calendarFeedSandboxResponse,
  async handler({ user, supabase }): Promise<CalendarFeedSandboxResponse> {
    // The body's only value is `reset`; the schema is what refuses anything
    // else, so there is nothing left to branch on here.
    //
    // A reset is the one write that deliberately clears `invitations` too, and
    // the seeded document carrying none is the whole of that mechanism. Reset
    // is the "start over" press, and the seeded seat ids are fixtures: they come
    // back identical, so a surviving record would silently re-attach a `UID` and
    // `SEQUENCE` from the old family's conversation to a freshly seeded seat
    // whose sessions sit on different dates. Every other write preserves the
    // bookkeeping; this one is the deliberate exception.
    return save(supabase, user.id, defaultSandboxDefinition());
  },
});

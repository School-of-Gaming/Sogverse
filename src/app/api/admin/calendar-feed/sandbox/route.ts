import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createSandboxFeedToken } from "@/lib/calendar-feed/token";
import {
  defaultSandboxDefinition,
  sandboxDefinitionSchema,
  type SandboxDefinition,
} from "@/lib/calendar-feed/sandbox";
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
  async handler({ body, user, supabase }): Promise<CalendarFeedSandboxResponse> {
    return save(supabase, user.id, body.definition);
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
    return save(supabase, user.id, defaultSandboxDefinition());
  },
});

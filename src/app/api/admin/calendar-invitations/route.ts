import { ApiError } from "@/lib/api/api-error";
import { defineRoute } from "@/lib/api/define-route";
import { getCalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import {
  sandboxDefinitionSchema,
  sandboxToFeedSeats,
  type SandboxDefinition,
} from "@/lib/calendar-feed/sandbox";
import {
  applyInvitationAction,
  newInvitationUid,
  type InvitationRecord,
} from "@/lib/calendar-invitations/bookkeeping";
import { buildInvitationCalendar } from "@/lib/calendar-invitations/invitation";
import { buildInvitationMail } from "@/lib/calendar-invitations/mail";
import { methodFor } from "@/lib/calendar-invitations/options";
import {
  SmtpNotConfiguredError,
  sendCalendarInvitationMail,
} from "@/lib/calendar-invitations/transport.server";
import {
  calendarInvitationBody,
  calendarInvitationResponse,
  type CalendarInvitationBody,
  type CalendarInvitationResponse,
} from "@/services/calendar-invitations/calendar-invitations.contracts";
import type { AppSupabaseClient } from "@/types";

/**
 * The calendar-invitation tool: render one seat as an iTIP message, and mail it.
 *
 * The second of the two designs under comparison. Where the feed publishes a
 * document a client polls, this *sends* one — an invitation per product per
 * gamer, an update when the schedule moves, a cancellation when the seat ends —
 * and the whole question is what Apple, Google and Outlook do with the second
 * and third of those. That can only be answered by watching a real calendar
 * entry change, which is what this route makes possible from an admin's desk.
 *
 * **It reads and writes the admin's own sandbox family**, on their own session
 * client, exactly as the sandbox route does: the table's one policy answers to
 * `is_admin() AND owner_id = auth.uid()`, so the database makes the role
 * decision this gate makes and then the ownership decision the gate cannot. No
 * service-role client is involved, because there is a caller here.
 *
 * **Nothing real is ever mailed.** The seats come from the sandbox document, so
 * every name in the message is invented; the only real address is the one the
 * admin typed, which is where they are going to go and look at the result.
 */

/** The row shape read and written here. */
const SELECT = "id, definition";

interface SandboxRow {
  id: string;
  definition: unknown;
}

async function readSandbox(
  supabase: AppSupabaseClient,
  ownerId: string,
): Promise<SandboxDefinition> {
  const { data, error } = await supabase
    .from("calendar_feed_sandboxes")
    .select(SELECT)
    .eq("owner_id", ownerId)
    .maybeSingle<SandboxRow>();

  if (error) throw error;
  if (data === null) {
    throw new ApiError(
      "Open the calendar feed card first — it creates the sandbox family this tool sends invitations for.",
      404,
    );
  }

  const parsed = sandboxDefinitionSchema.safeParse(data.definition);
  if (!parsed.success) {
    throw new ApiError(
      "This sandbox was stored in an older shape — reset it on the calendar feed card to continue.",
      409,
    );
  }
  return parsed.data;
}

/**
 * The seat this message is about, mapped through the same adapter the feed uses.
 *
 * Going through `sandboxToFeedSeats` rather than reading the participation
 * directly is what keeps the two designs comparable: an invitation and a feed
 * describe the same sessions because they are handed the same seat, and the
 * adapter's own filters (a waitlisted seat is not a session anybody attends, a
 * seat naming a deleted gamer is not renderable) apply to both.
 */
function findSeat(definition: SandboxDefinition, participationId: string) {
  const seat = sandboxToFeedSeats(definition).find(
    (candidate) => candidate.participationId === participationId,
  );
  if (seat === undefined) {
    throw new ApiError(
      "That seat is not an active participation in the sandbox family.",
      404,
    );
  }
  return seat;
}

/** The record this action leaves behind, or a refusal explaining why it cannot. */
function nextRecord(
  definition: SandboxDefinition,
  body: CalendarInvitationBody,
  now: Date,
): InvitationRecord {
  const record = applyInvitationAction({
    existing: definition.invitations?.[body.participationId],
    action: body.action,
    method: body.method,
    recipient: body.to,
    now,
    freshUid: newInvitationUid(),
  });
  if (record === null) {
    throw new ApiError(
      "There is no open invitation for that seat to revise — send one first.",
      409,
    );
  }
  return record;
}

/** Merge one seat's record back into the stored document, leaving the rest alone. */
async function storeRecord(
  supabase: AppSupabaseClient,
  ownerId: string,
  definition: SandboxDefinition,
  participationId: string,
  record: InvitationRecord,
): Promise<void> {
  const { error } = await supabase
    .from("calendar_feed_sandboxes")
    .update({
      definition: {
        ...definition,
        invitations: {
          ...definition.invitations,
          [participationId]: record,
        },
      },
    })
    .eq("owner_id", ownerId);

  if (error) throw error;
}

export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  body: calendarInvitationBody,
  response: calendarInvitationResponse,
  // Admin-only developer tooling, and every message it raises is one the admin
  // has to act on: which env var is missing, which seat has no open invitation,
  // what the relay said when it refused the login. A generic "Invalid request"
  // here would leave them with a form and no idea which part of it was wrong.
  discloseErrorMessages:
    "admin-only testing tool; the underlying message names the setup step or the relay failure the admin has to fix",
  async handler({ body, user, supabase }): Promise<CalendarInvitationResponse> {
    const now = new Date();

    const definition = await readSandbox(supabase, user.id);
    const seat = findSeat(definition, body.participationId);
    const record = nextRecord(definition, body, now);

    const gamer = definition.gamers.find(
      (candidate) => candidate.id === seat.participantId,
    );

    const method = body.action === "cancel" ? "CANCEL" : methodFor(body.method);
    const locale = definition.parent.locale;

    const ical = buildInvitationCalendar({
      seat,
      baseUid: record.uid,
      sequence: record.sequence,
      method,
      shape: body.shape,
      reminder: body.reminder,
      attendee: { name: definition.parent.firstName, email: body.to },
      translate: await getCalendarFeedTranslator(locale),
      locale,
      now,
    });

    const mail = await buildInvitationMail({
      action: body.action,
      locale,
      parentName: definition.parent.firstName,
      // The adapter already dropped any seat whose gamer is missing, so the
      // lookup above cannot fail; the fallback is what makes that legible to
      // the compiler rather than an assertion.
      gamerName: gamer?.firstName ?? seat.gamerName,
      productName: seat.productName,
    });

    if (body.preview === true) {
      return {
        subject: mail.subject,
        html: mail.html,
        ical,
        messageId: null,
        bookkeeping: null,
      };
    }

    let messageId: string;
    try {
      ({ messageId } = await sendCalendarInvitationMail({
        to: body.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ical: { method, content: ical },
      }));
    } catch (error) {
      if (error instanceof SmtpNotConfiguredError) {
        throw new ApiError(error.message, 503);
      }
      throw error;
    }

    // Written after the send, and deliberately in that order: a bookkeeping row
    // for a message that never left would offer the admin an "update" that no
    // client has anything to apply. The reverse failure — a mail that went out
    // and a write that did not — leaves the next send repeating sequence 0,
    // which a client ignores as a message it already has. Of the two, being
    // ignored is the one that does not corrupt anything.
    await storeRecord(
      supabase,
      user.id,
      definition,
      body.participationId,
      record,
    );

    return {
      subject: mail.subject,
      html: mail.html,
      ical,
      messageId,
      bookkeeping: record,
    };
  },
});

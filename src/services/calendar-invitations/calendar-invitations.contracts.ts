import { z } from "zod";
import { invitationRecordSchema } from "@/lib/calendar-invitations/bookkeeping";
import {
  INVITATION_ACTIONS,
  INVITATION_METHOD_OPTIONS,
  INVITATION_REMINDERS,
  INVITATION_SHAPES,
} from "@/lib/calendar-invitations/options";

/**
 * The wire shape of the calendar-invitation tool — one route, one call.
 *
 * Every enum is derived from the option lists rather than restated, so the
 * card's selects and the route's parse cannot come to offer and accept
 * different sets.
 */

export const calendarInvitationBody = z.object({
  action: z.enum(INVITATION_ACTIONS),
  /** A seat in the caller's own sandbox family. */
  participationId: z.string().uuid(),
  to: z.string().trim().email(),
  shape: z.enum(INVITATION_SHAPES),
  reminder: z.enum(INVITATION_REMINDERS),
  method: z.enum(INVITATION_METHOD_OPTIONS),
  /**
   * Render everything and send nothing.
   *
   * Deliberately the same request as a send, one flag apart, rather than a
   * second endpoint: a preview built by a different code path than the send is
   * a picture of a mail nobody receives, which is the one thing a preview must
   * never be. It also writes no bookkeeping — previewing an update must not
   * consume the sequence number the update is going to need.
   */
  preview: z.boolean().optional(),
});

export type CalendarInvitationBody = z.infer<typeof calendarInvitationBody>;

/**
 * What came back.
 *
 * One shape for both a preview and a send rather than a union, because the card
 * shows the same three panels either way — the subject, the rendered mail and
 * the raw calendar part — and only two fields distinguish them. `messageId` is
 * the discriminator: non-null exactly when something was actually sent.
 */
export const calendarInvitationResponse = z.object({
  subject: z.string(),
  /** The rendered mail, for the preview frame. */
  html: z.string(),
  /** The calendar part verbatim — the same bytes the recipient receives. */
  ical: z.string(),
  /**
   * Whether the schedule needed `RDATE;VALUE=PERIOD` entries to state at all.
   *
   * On the wire rather than derived from the document by the card, because it
   * is a fact the builder established while writing: sessions of differing
   * lengths have no plainer notation. Client support for period entries is
   * weak, so the card says so rather than letting the admin discover it from a
   * calendar that silently dropped half the dates.
   */
  usesPeriodRdates: z.boolean(),
  /** The relay's id for the sent message, or `null` for a preview. */
  messageId: z.string().nullable(),
  /** The seat's record after this action, or `null` for a preview. */
  bookkeeping: invitationRecordSchema.nullable(),
});

export type CalendarInvitationResponse = z.infer<
  typeof calendarInvitationResponse
>;

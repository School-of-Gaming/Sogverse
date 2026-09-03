import "server-only";
import nodemailer from "nodemailer";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import type { InvitationMethod } from "./options";

/**
 * The one thing in this exploration that could not go through the house mail
 * wrapper.
 *
 * Brevo's REST send API takes attachments as name-and-content pairs and types
 * them by their file extension. There is no field for a MIME type, and none for
 * the `method` parameter that turns `text/calendar` into an iTIP message — so an
 * `.ics` sent that way arrives as `application/ics`, and Gmail answers it with
 * an "Add to calendar" link that creates a *copy* of the event. A copy is
 * exactly what this design has to avoid: nothing we send afterwards can find it
 * again, so the schedule change that arrives next week lands on nothing.
 *
 * Brevo's **SMTP relay** has no such limit, because there the message is ours to
 * compose. Nodemailer's `icalEvent` writes the calendar as a
 * `text/calendar; charset=UTF-8; method=REQUEST` alternative part rather than an
 * attachment, which is the shape a client reads as an invitation.
 *
 * So this module exists beside `src/lib/brevo.ts` rather than inside it: the
 * REST wrapper is still the single entry point for every ordinary mail the app
 * sends, and nothing about its behaviour changes. This is one exploration's
 * second transport, kept separate so it can be deleted whole if the design is
 * not the one we build.
 */

/**
 * Thrown when the relay's credentials are absent.
 *
 * A named class rather than a bare `Error` because the route has to tell this
 * apart from a send that genuinely failed: an unconfigured relay is a setup step
 * nobody has taken yet, which is a 503 and a sentence naming the two variables,
 * while a refused login or a bounced address is a real failure the admin needs
 * the underlying message for.
 */
export class SmtpNotConfiguredError extends Error {
  constructor() {
    super(
      "Calendar invitations need BREVO_SMTP_LOGIN and BREVO_SMTP_KEY to be set.",
    );
    this.name = "SmtpNotConfiguredError";
  }
}

/** Brevo's relay. STARTTLS on 587 — `secure: false` is the upgrade, not plaintext. */
const SMTP_HOST = "smtp-relay.brevo.com";
const SMTP_PORT = 587;

export interface CalendarInvitationMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  ical: {
    /** Must equal the `METHOD` the calendar document itself states. */
    method: InvitationMethod;
    content: string;
  };
  replyTo?: string;
}

/**
 * Send one invitation over the relay.
 *
 * The transport is built per call rather than kept as a module singleton. This
 * is an admin tool used a handful of times in a sitting, so a pooled connection
 * buys nothing measurable — and a singleton would capture the credentials at
 * first import, which on a long-lived server means an admin who sets the
 * variables has to restart before the tool notices.
 */
export async function sendCalendarInvitationMail(
  mail: CalendarInvitationMail,
): Promise<{ messageId: string }> {
  const user = process.env.BREVO_SMTP_LOGIN;
  const pass = process.env.BREVO_SMTP_KEY;
  if (!user || !pass) throw new SmtpNotConfiguredError();

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from: { name: SENDER_NAME, address: SENDER_EMAIL },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
    icalEvent: {
      // The filename matters to the clients that fall back to treating the part
      // as an attachment; the method is what stops the rest of them doing so.
      filename: "invite.ics",
      method: mail.ical.method,
      content: mail.ical.content,
    },
  });

  return { messageId: info.messageId };
}

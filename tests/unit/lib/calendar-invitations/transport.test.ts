import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The second transport, and the three things it exists to get right.
 *
 * The relay itself is mocked whole: a real `createTransport` would open a
 * socket to Brevo from CI, which is not a thing a test may do — and everything
 * worth pinning here is an *argument* rather than an outcome. The connection is
 * the one Brevo's relay wants, the calendar travels as a typed part rather than
 * an attachment, and a reply goes somewhere a person reads.
 */

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn((_options: unknown) => ({
  sendMail: mockSendMail,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => mockCreateTransport(options),
  },
}));

import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import {
  SmtpNotConfiguredError,
  sendCalendarInvitationMail,
} from "@/lib/calendar-invitations/transport.server";

const CALENDAR = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n";

function mail(overrides: Record<string, unknown> = {}) {
  return {
    to: "parent@example.test",
    subject: "Calendar invitation",
    html: "<p>Hello</p>",
    text: "Hello",
    ical: { method: "REQUEST" as const, content: CALENDAR },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: "<relay-id@brevo>" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credentials", () => {
  /**
   * An unconfigured relay is a setup step nobody has taken, which the route
   * turns into a 503 naming both variables — so it has to be told apart from a
   * send that genuinely failed, and a named class is what makes that possible.
   */
  it("throws before connecting when either variable is missing", async () => {
    for (const [login, key] of [
      ["", "secret"],
      ["login", ""],
      ["", ""],
    ]) {
      vi.stubEnv("BREVO_SMTP_LOGIN", login);
      vi.stubEnv("BREVO_SMTP_KEY", key);

      await expect(sendCalendarInvitationMail(mail())).rejects.toBeInstanceOf(
        SmtpNotConfiguredError,
      );
      expect(mockCreateTransport).not.toHaveBeenCalled();
    }
  });
});

describe("the send", () => {
  beforeEach(() => {
    vi.stubEnv("BREVO_SMTP_LOGIN", "login@sog.gg");
    vi.stubEnv("BREVO_SMTP_KEY", "smtp-key");
  });

  /** STARTTLS on 587: `secure: false` is the upgrade, not plaintext. */
  it("connects to Brevo's relay on the STARTTLS port", async () => {
    await sendCalendarInvitationMail(mail());

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: { user: "login@sog.gg", pass: "smtp-key" },
    });
  });

  /**
   * The whole reason this module exists beside the REST wrapper: `icalEvent`
   * emits the calendar as a typed alternative part, and the `method` is what
   * stops a client treating the message as an attachment-bearing mail.
   */
  it("hands the calendar over as a typed part, with the method it states", async () => {
    const { messageId } = await sendCalendarInvitationMail(mail());

    const sent = mockSendMail.mock.calls[0][0];
    expect(sent.icalEvent).toMatchObject({
      method: "REQUEST",
      content: CALENDAR,
    });
    expect(sent.from).toEqual({ name: SENDER_NAME, address: SENDER_EMAIL });
    expect(sent.to).toBe("parent@example.test");
    expect(messageId).toBe("<relay-id@brevo>");
  });

  it("carries a cancellation's method through unchanged", async () => {
    await sendCalendarInvitationMail(
      mail({ ical: { method: "CANCEL", content: CALENDAR } }),
    );

    expect(mockSendMail.mock.calls[0][0].icalEvent.method).toBe("CANCEL");
  });

  /**
   * A reply to a mail about a child's sessions has to reach a person. The
   * sending address's inbox is not read, so the caller states where replies go
   * and the transport passes it through.
   */
  it("passes the reply-to the caller states", async () => {
    await sendCalendarInvitationMail(mail({ replyTo: SUPPORT_EMAIL }));

    expect(mockSendMail.mock.calls[0][0].replyTo).toBe(SUPPORT_EMAIL);
  });

  /** Omitted rather than sent empty, so nodemailer's own default stands. */
  it("sets no reply-to when the caller states none", async () => {
    await sendCalendarInvitationMail(mail());

    expect("replyTo" in mockSendMail.mock.calls[0][0]).toBe(false);
  });
});

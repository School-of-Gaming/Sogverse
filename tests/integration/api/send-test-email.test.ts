import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/send-test-email/route";
import { NextResponse } from "next/server";
// The calendar invitation refuses a run with nothing left ahead of it, so its
// fixture dates come from the template's own form placeholders — the next
// Monday and four weeks after it — rather than from literals that would rot.
import { calendarInvitationStartDate } from "@/lib/email-templates/calendar-invitation";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));


// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedWithRole(role: string) {
  if (role !== "admin") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can send test emails" },
        { status: 403 }
      )
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/send-test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  mode: "custom",
  provider: "brevo",
  toEmail: "test@example.com",
  subject: "Test Subject",
  body: "Hello world",
};

// --- Tests ---

describe("POST /api/admin/send-test-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for customer role", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can send test emails");
  });

  it("should return 403 for gamer role", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(403);
  });

  it("should return 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 for invalid provider", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, provider: "mailgun" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("provider");
  });

  it("ignores a caller-supplied sender identity rather than honouring it", async () => {
    // Sender identity is a constant, so these keys are not part of the wire
    // shape. The assertion that matters is not the 200 — it is that the mail
    // still goes out under our own name, i.e. the harness cannot be talked into
    // sending as someone else.
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({
        ...validBody,
        fromEmail: "attacker@evil.example",
        fromName: "Your Bank",
      })
    );

    expect(response.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: "sogverse@sog.gg",
        fromName: "School of Gaming",
      })
    );
  });

  it("should return 400 for missing toEmail", async () => {
    mockAuthenticatedWithRole("admin");

    const { toEmail: _, ...withoutTo } = validBody;
    const response = await POST(createRequest(withoutTo));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("toEmail");
  });

  it("should return 400 for empty subject", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, subject: "" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("subject");
  });

  it("should return 400 for empty body", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, body: "" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("body");
  });

  it("should return 400 for invalid replyToEmail", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, replyToEmail: "not-an-email" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("replyToEmail");
  });

  // -- Happy path --

  it("should send email and return messageId", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("msg-123");
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith({
      fromEmail: "sogverse@sog.gg",
      fromName: "School of Gaming",
      toEmail: ["test@example.com"],
      subject: "Test Subject",
      htmlContent: "Hello world",
      replyToEmail: undefined,
    });
  });

  it("should convert newlines to <br/> in body", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, body: "Line 1\nLine 2\nLine 3" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: "Line 1<br/>Line 2<br/>Line 3",
      })
    );
  });

  it("should escape HTML entities in body", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, body: "<script>alert('xss')</script>" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
      })
    );
  });

  it("should pass replyToEmail when provided", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, replyToEmail: "reply@example.com" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToEmail: "reply@example.com",
      })
    );
  });

  // -- Error handling --

  it("should return a generic 500 when the email provider fails", async () => {
    // The provider's own message used to be returned to the client. It is now
    // logged and answered generically — this route never opted into disclosure.
    mockAuthenticatedWithRole("admin");
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo API error: 500 Internal Server Error"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });

  // -- Template mode --

  const validTemplateBody = {
    mode: "template",
    toEmail: "test@example.com",
    template: "feedback",
    params: {
      userName: "Jane Doe",
      userRole: "customer",
      userEmail: "jane@example.com",
      message: "Great product!",
    },
  };

  it("should send a template email and return messageId", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(validTemplateBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("msg-123");
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: ["test@example.com"],
        subject: expect.stringContaining("Jane Doe"),
      }),
    );
  });

  /**
   * The two halves of the reply-to policy, asserted through the harness because
   * the harness is where they are easiest to get wrong: a test send that always
   * defaulted to support would show an admin the wrong thing about the one
   * template that replies to a person.
   */
  it("replies to the submitter for the feedback template", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(createRequest(validTemplateBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ replyToEmail: "jane@example.com" }),
    );
  });

  it("replies to support for a family-facing template", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(createRequest({
      mode: "template",
      toEmail: "test@example.com",
      template: "passwordReset",
      params: { resetLink: "https://sogverse.sog.gg/reset-password?token_hash=abc" },
    }));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ replyToEmail: "help@sog.gg" }),
    );
  });

  it("should return 400 for unknown template", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validTemplateBody, template: "nonexistent" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Unknown template");
  });

  it("should return 400 for invalid template params", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validTemplateBody, params: { userName: "" } }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("params");
  });

  /**
   * The wire schema and the registry's own param schema are declared in two
   * places, and the wire one has to admit every non-string a real test send
   * can carry — both of which the testing page produces client-side, before
   * the POST, by running the template's own `resolveParams`: the boolean the
   * seat select expands into, and the null the price becomes on the modes
   * that state no amount. A wire schema typed `Record<string, string | null>`
   * rejects the first before the template ever sees it; one typed
   * `Record<string, string | boolean>` rejects the second. Both boolean
   * values are posted because `false` is the one a "truthy values only"
   * narrowing would still let through.
   */
  const confirmationTemplateBody = (params: Record<string, string | boolean | null>) => ({
    mode: "template",
    toEmail: "test@example.com",
    template: "productConfirmation",
    params: {
      participantName: "Marja",
      productName: "Parents' Minecraft Evening",
      productType: "consumer_club",
      mode: "subscription",
      priceAmount: "€40.00",
      dashboardUrl: "https://sogverse.sog.gg/parent",
      // The calendar half of the form, which the schema requires whole. No
      // slots, so these sends carry no invitation — what is checked here is the
      // route's param handling, and a schedule would drag a calendar document
      // into every assertion.
      participationId: "",
      attendeeName: "Marja Virtanen",
      attendeeEmail: "marja@example.com",
      topic: "minecraft_java",
      shortDescription: "",
      timezone: "Europe/Helsinki",
      startDate: "2027-01-04",
      endDate: "",
      slots: "",
      isRemote: "no",
      siteName: "",
      siteAddress: "",
      siteNote: "",
      ...params,
    },
  });

  it("should accept the boolean isSelfSeat param on the self seat", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(confirmationTemplateBody({ isSelfSeat: true })));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("msg-123");
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "You are enrolled in Parents' Minecraft Evening",
      }),
    );
  });

  it("should accept the boolean isSelfSeat param on a child's seat", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(confirmationTemplateBody({ isSelfSeat: false })));

    expect(response.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Marja is enrolled in Parents' Minecraft Evening",
      }),
    );
  });

  it("should accept a null param on a mode that states no price", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest(
        confirmationTemplateBody({ isSelfSeat: false, mode: "waitlist", priceAmount: null }),
      ),
    );

    expect(response.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Marja is on the waitlist for Parents' Minecraft Evening",
      }),
    );
  });

  /**
   * The session-report template carries a multi-line markdown param and a
   * sample id; the wire schema has to let both through, and the harness has
   * to render the sample when the markdown is left empty — which is what the
   * testing page posts for an untouched textarea.
   */
  it("should render the session-report template from a bundled sample", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({
      mode: "template",
      toEmail: "test@example.com",
      template: "sessionReport",
      params: {
        gamerName: "Aino",
        geduName: "Marianne",
        productName: "Minecraft: Cozy Adventures",
        groupName: "Usvalaakso: Kettukallio",
        copy: "family",
        photoCount: "0",
        sample: "en",
        viewerTimezone: "Europe/Helsinki",
        reportMarkdown: "",
        productUrl: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("msg-123");
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Minecraft: Cozy Adventures"),
        htmlContent: expect.stringContaining("Lanterns over the Harbour"),
        replyToEmail: "help@sog.gg",
      }),
    );
  });

  it("should render typed markdown over the sample in the session-report template", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(createRequest({
      mode: "template",
      toEmail: "test@example.com",
      template: "sessionReport",
      params: {
        gamerName: "Aino",
        geduName: "Marianne",
        productName: "Minecraft: Cozy Adventures",
        groupName: "Usvalaakso: Kettukallio",
        copy: "family",
        photoCount: "0",
        sample: "en",
        viewerTimezone: "Europe/Helsinki",
        reportMarkdown: "# Typed title\n\nWith a [link](https://evil.example).",
        productUrl: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
      },
    }));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.stringContaining("Typed title"),
      }),
    );
    const [{ htmlContent }] = mockSendTransactionalEmail.mock.calls[0];
    expect(htmlContent).not.toContain("Lanterns over the Harbour");
    expect(htmlContent).not.toContain("evil.example");
  });

  /**
   * The one template that carries a file, asserted at the boundary the file has
   * to cross. What makes a calendar arrive as an invitation rather than as
   * something to download is the *name* — the provider infers the media type
   * from the extension — so the name reaching the provider unchanged is the
   * property worth pinning, alongside the content being base64 of the document
   * the template composed.
   */
  /** The calendar explorer's baseline params — every field as its form posts it. */
  function calendarInvitationParams() {
    return {
      subject: "Calendar invite explorer",
      body: "The invitation is the file attached to this message.",
      uid: "",
      sequence: "0",
      method: "request",
      status: "confirmed",
      timezone: "Europe/Helsinki",
      startDate: calendarInvitationStartDate(),
      startTime: "16:00",
      durationMinutes: "120",
      timeForm: "tzid",
      allDay: "no",
      recurrence: "none",
      weekdays: "mon",
      until: "",
      count: "",
      interval: "1",
      excludedDates: "",
      overrides: "",
      organizerName: "School of Gaming",
      organizerEmail: "sogverse@sog.gg",
      attendeeName: "Attendee",
      attendeeEmail: "attendee@example.com",
      rsvp: "yes",
      attendeeRole: "REQ-PARTICIPANT",
      partstat: "NEEDS-ACTION",
      includeAttendee: "yes",
      summary: "Calendar invite explorer",
      description: "",
      location: "Helsinki, Finland",
      url: "",
      alert1Offset: "15",
      alert1Action: "display",
      alert1RelativeTo: "start",
      alert2Offset: "1440",
      alert2Action: "display",
      alert2RelativeTo: "start",
      alert3Offset: "none",
      alert3Action: "display",
      alert3RelativeTo: "start",
      showAs: "free",
    };
  }

  function sendCalendarInvitation(overrides: Record<string, string | null> = {}) {
    return POST(createRequest({
      mode: "template",
      toEmail: "test@example.com",
      template: "calendarInvitation",
      params: { ...calendarInvitationParams(), ...overrides },
    }));
  }

  it("passes a template's attachment through to the provider", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await sendCalendarInvitation();

    expect(response.status).toBe(200);
    const [{ attachments }] = mockSendTransactionalEmail.mock.calls[0];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].name).toBe("invite.ics");
    expect(Buffer.from(attachments[0].contentBase64, "base64").toString("utf8"))
      .toContain("BEGIN:VCALENDAR");
  });

  /**
   * The document is read back to the admin, and that is the only way the
   * identifier a send used ever becomes visible: a preview mints its own, so
   * what it showed was never what went out — and without the identifier there
   * is no second message about the same entry.
   */
  it("answers with the text of what it sent", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await sendCalendarInvitation();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.attachments).toHaveLength(1);
    expect(data.attachments[0].name).toBe("invite.ics");
    expect(data.attachments[0].text).toContain("BEGIN:VCALENDAR");
    // The bytes that went to the provider, not a second render of them.
    const [{ attachments }] = mockSendTransactionalEmail.mock.calls[0];
    expect(Buffer.from(attachments[0].contentBase64, "base64").toString("utf8"))
      .toBe(data.attachments[0].text);
  });

  /**
   * A mail carrying a calendar part states a plain-text body, because a
   * Microsoft mailbox fills the calendar entry's notes from the message body
   * and flattens the HTML into them when there is nothing else to read.
   */
  it("sends the plain-text body a template states, and none for one that states none", async () => {
    mockAuthenticatedWithRole("admin");

    await sendCalendarInvitation();
    const [{ textContent }] = mockSendTransactionalEmail.mock.calls[0];
    expect(textContent).toBe("The invitation is the file attached to this message.");
    expect(textContent).not.toMatch(/<[a-z/][^>]*>/i);

    mockSendTransactionalEmail.mockClear();
    await POST(createRequest(validTemplateBody));
    expect(mockSendTransactionalEmail.mock.calls[0][0].textContent).toBeUndefined();
  });

  /**
   * A builder may refuse the params it was handed — an object whose every
   * occurrence is on the excluded list is the case — and that refusal is an
   * answer about the request, so it comes back as a 400 carrying the message
   * the builder wrote for the admin to read, exactly as the schema's own
   * refusal does. Answered any other way it is a 500, and the admin is told
   * nothing about what they got wrong.
   */
  it("returns 400 with the builder's own message when a render refuses", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await sendCalendarInvitation({
      excludedDates: calendarInvitationStartDate(),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("states no occurrence at all");
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  /**
   * The same shape one layer up: a field the resolver cannot parse is the
   * admin's typo, not our fault, so it earns the sentence naming the field
   * rather than a 500 that tells them nothing.
   */
  it("returns 400 naming the field when one is malformed", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await sendCalendarInvitation({ startTime: "16.00" });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Start time");
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  /** Every other template carries none, and says so by carrying nothing. */
  it("sends no attachments for a template that has none", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(createRequest(validTemplateBody));

    const [{ attachments }] = mockSendTransactionalEmail.mock.calls[0];
    expect(attachments).toBeUndefined();
  });

  it("should return 400 for missing mode field", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ toEmail: "test@example.com", template: "feedback", params: {} }),
    );

    expect(response.status).toBe(400);
  });
});

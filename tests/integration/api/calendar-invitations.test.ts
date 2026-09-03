import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

/**
 * The relay is mocked whole rather than stubbed with env vars.
 *
 * Two reasons. A real `createTransport` would open a socket to Brevo from CI,
 * which is not a thing a test may do; and the property most worth asserting is
 * the one thing this transport exists for — that the calendar part is typed
 * with the right `method` — which is an argument, not an outcome.
 */
const mockSend = vi.fn();
// The error class is declared *inside* the factory: `vi.mock` is hoisted above
// every top-level binding in this file, so a class declared out here would not
// exist yet when the factory runs. The route compares with `instanceof`, so the
// test has to construct the very class the route imports — which is what the
// static import below hands back, since it resolves to this mock.
vi.mock("@/lib/calendar-invitations/transport.server", () => {
  class SmtpNotConfiguredError extends Error {
    constructor() {
      super(
        "Calendar invitations need BREVO_SMTP_LOGIN and BREVO_SMTP_KEY to be set.",
      );
      this.name = "SmtpNotConfiguredError";
    }
  }
  return {
    sendCalendarInvitationMail: (...args: unknown[]) => mockSend(...args),
    SmtpNotConfiguredError,
  };
});

import { POST } from "@/app/api/admin/calendar-invitations/route";
import { SmtpNotConfiguredError } from "@/lib/calendar-invitations/transport.server";
import {
  defaultSandboxDefinition,
  type SandboxDefinition,
} from "@/lib/calendar-feed/sandbox";

// --- Fixtures ---

const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const SANDBOX_ID = "88888888-8888-4888-8888-888888888888";

/** The seeded family, whose first seat is Aino's club place. */
function definition(): SandboxDefinition {
  return defaultSandboxDefinition(new Date("2026-03-02T09:00:00Z"));
}

function firstSeatId(document: SandboxDefinition): string {
  return document.participations[0].id;
}

/**
 * The sandbox row as this route uses it: reads by owner, and one update that
 * replaces the whole document.
 *
 * `edit` stands in for the *other* writer of this row — the feed card's family
 * editor — so a test can land a save partway through a request the way a second
 * request would.
 */
function mockCaller(stored: SandboxDefinition | null) {
  let current = stored;
  const writes: SandboxDefinition[] = [];

  const from = () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data:
              current === null
                ? null
                : { id: SANDBOX_ID, definition: current },
            error: null,
          }),
      }),
    }),
    update: (values: { definition: SandboxDefinition }) => {
      writes.push(values.definition);
      current = values.definition;
      return { eq: () => Promise.resolve({ error: null }) };
    },
  });

  mockRequireRole.mockResolvedValue({
    user: { id: ADMIN_ID },
    profile: { role: "admin", locale: "en" },
    supabase: { from },
  });

  return {
    writes,
    edit: (next: SandboxDefinition) => {
      current = next;
    },
  };
}

interface RequestBody {
  action: "send" | "update" | "cancel";
  participationId: string;
  to?: string;
  shape?: "series" | "occurrences";
  reminder?: "none" | "15" | "60" | "1440";
  method?: "request" | "publish";
  preview?: boolean;
}

function invitationRequest(body: RequestBody): Request {
  return new Request(
    "https://test.sogverse.local/api/admin/calendar-invitations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "admin@example.test",
        shape: "series",
        reminder: "none",
        method: "request",
        ...body,
      }),
    },
  );
}

describe("POST /api/admin/calendar-invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({ messageId: "<relay-id@brevo>" });
  });

  // --- Authorization ---

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(
      invitationRequest({ action: "send", participationId: SANDBOX_ID }),
    );

    expect(response.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(
      invitationRequest({ action: "send", participationId: SANDBOX_ID }),
    );

    expect(response.status).toBe(401);
  });

  // --- Preview ---

  /**
   * A preview is the same code path one flag apart, so what it renders is what
   * a send would deliver — and it must reach neither the relay nor the row,
   * because previewing an update cannot be allowed to consume the sequence
   * number the update is going to need.
   */
  it("renders without sending or writing anything", async () => {
    const document = definition();
    const { writes } = mockCaller(document);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
        preview: true,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.subject).toContain("Aino");
    expect(data.html).toContain("<!DOCTYPE html>");
    expect(data.ical).toContain("METHOD:REQUEST");
    expect(data.messageId).toBeNull();
    expect(data.bookkeeping).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  // --- Sending ---

  it("types the calendar part as a REQUEST and writes the bookkeeping", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    const { writes } = mockCaller(document);

    const response = await POST(
      invitationRequest({ action: "send", participationId: seatId }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const sent = mockSend.mock.calls[0][0];
    expect(sent.to).toBe("admin@example.test");
    // The whole reason this transport exists: the part is typed, not attached.
    expect(sent.ical.method).toBe("REQUEST");
    expect(sent.ical.content).toContain("METHOD:REQUEST");
    expect(sent.text.length).toBeGreaterThan(0);
    // Aino's seat is on the two-session club, and it travels as one calendar
    // object: RFC 5546 gives a message one to describe, and a client handed
    // several reads the first and ignores the rest.
    expect(sent.ical.content.match(/BEGIN:VEVENT/g)).toHaveLength(1);

    expect(data.messageId).toBe("<relay-id@brevo>");
    expect(data.bookkeeping.sequence).toBe(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].invitations?.[seatId].sequence).toBe(0);
    // The rest of the document is carried through untouched.
    expect(writes[0].gamers).toEqual(document.gamers);
  });

  /**
   * The row has two writers, and this one owns `invitations` alone. The mail
   * send sits between the read and the write — a relay round trip, the slowest
   * thing in the handler — so the record has to be merged onto the document as
   * it stands at the moment of writing, not onto the copy this request read
   * before the send. Otherwise a family edit saved in that window is silently
   * rolled back by a bookkeeping write.
   */
  it("writes the bookkeeping onto the freshly read document", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    const { writes, edit } = mockCaller(document);

    // The admin saves the family on the feed card while the relay still has
    // the mail — the only window this route leaves open.
    const edited = definition();
    edited.parent.firstName = "Riikka";
    mockSend.mockImplementation(() => {
      edit(edited);
      return Promise.resolve({ messageId: "<relay-id@brevo>" });
    });

    const response = await POST(
      invitationRequest({ action: "send", participationId: seatId }),
    );

    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].parent.firstName).toBe("Riikka");
    expect(writes[0].invitations?.[seatId].sequence).toBe(0);
  });

  it("raises the sequence on an update and keeps the uid", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    const { writes } = mockCaller(document);

    await POST(invitationRequest({ action: "send", participationId: seatId }));
    const response = await POST(
      invitationRequest({ action: "update", participationId: seatId }),
    );
    const data = await response.json();

    expect(data.bookkeeping.sequence).toBe(1);
    // The uid the first send stored, read back off the first write — the whole
    // mechanism is that the second message repeats it.
    expect(data.bookkeeping.uid).toBe(writes[0].invitations?.[seatId].uid);
    expect(data.ical).toContain("SEQUENCE:1");
  });

  it("sends a cancellation that cancels the event", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    mockCaller(document);

    await POST(invitationRequest({ action: "send", participationId: seatId }));
    const response = await POST(
      invitationRequest({ action: "cancel", participationId: seatId }),
    );
    const data = await response.json();

    expect(mockSend.mock.calls[1][0].ical.method).toBe("CANCEL");
    expect(data.ical).toContain("STATUS:CANCELLED");
    expect(data.bookkeeping.lastMethod).toBe("CANCEL");
  });

  /**
   * `PUBLISH` is a different message, not a different mail about the same one:
   * the calendar part is typed as one all the way to the relay, and the mail's
   * one instruction has to agree with it — a reader with no attendee line has
   * nothing to accept, so the words say to add it instead.
   */
  it("types a publish send as PUBLISH and says so in the body", async () => {
    const document = definition();
    mockCaller(document);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
        method: "publish",
        preview: true,
      }),
    );
    const data = await response.json();

    expect(data.ical).toContain("METHOD:PUBLISH");
    expect(data.html).toContain("Add it and they appear in your calendar");
    expect(data.html).not.toContain("Accept it and they appear");
    // The subject and the heading name the object too, so neither may call an
    // RSVP-less entry an invitation.
    expect(data.subject).toContain("Calendar entry:");
    expect(data.subject).not.toContain("Calendar invitation:");
    expect(data.html).toContain("Your calendar entry");
    expect(data.html).not.toContain("Your calendar invitation");

    // And the same message on the send path, where the part is typed for the
    // relay: the transport hands this value straight to nodemailer's
    // `icalEvent`, which is what makes it an invitation rather than a file.
    await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
        method: "publish",
      }),
    );
    expect(mockSend.mock.calls[0][0].ical.method).toBe("PUBLISH");
  });

  /**
   * The update mail's body is the one sentence that names which thing in the
   * mail replaces the entry the reader already has, so it follows the
   * experience too — "the calendar entry", never "the invitation".
   */
  it("calls a publish update a calendar entry, not an invitation", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    mockCaller(document);

    await POST(
      invitationRequest({
        action: "send",
        participationId: seatId,
        method: "publish",
      }),
    );
    const response = await POST(
      invitationRequest({
        action: "update",
        participationId: seatId,
        method: "publish",
        preview: true,
      }),
    );
    const data = await response.json();

    expect(data.html).toContain("The calendar entry in this mail replaces");
    expect(data.html).not.toContain("The invitation in this mail replaces");
  });

  /**
   * RFC 5546 withdraws a published object by re-stating it as a `PUBLISH`
   * carrying `STATUS:CANCELLED`. A `METHOD:CANCEL` names the `ATTENDEE` whose
   * invitation is being retracted, and this conversation never had one — so
   * the withdrawal is read against an invitation the client was never sent.
   * The experience comes off the record, which is why a cancellation does not
   * have to be told which kind of thread it is closing.
   */
  it("withdraws a published thread as a PUBLISH", async () => {
    const document = definition();
    const seatId = firstSeatId(document);
    mockCaller(document);

    await POST(
      invitationRequest({
        action: "send",
        participationId: seatId,
        method: "publish",
      }),
    );
    const response = await POST(
      invitationRequest({ action: "cancel", participationId: seatId }),
    );
    const data = await response.json();

    expect(mockSend.mock.calls[1][0].ical.method).toBe("PUBLISH");
    expect(data.ical).toContain("METHOD:PUBLISH");
    expect(data.ical).toContain("STATUS:CANCELLED");
    expect(data.ical).not.toContain("ATTENDEE");
    // The seat still reads as closed: that question is `lastMethod`'s, and the
    // experience is remembered beside it rather than inside it.
    expect(data.bookkeeping.lastMethod).toBe("CANCEL");
    expect(data.bookkeeping.experience).toBe("publish");
  });

  /** The request mail keeps the sentence a `REQUEST` earns. */
  it("tells a request recipient to accept the invitation", async () => {
    const document = definition();
    mockCaller(document);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
        preview: true,
      }),
    );
    const data = await response.json();

    expect(data.html).toContain("Accept it and they appear in your calendar");
  });

  /**
   * A human answering a mail about their child's sessions must reach a person,
   * and nobody reads the sending address's inbox.
   */
  it("points replies at the support inbox", async () => {
    const document = definition();
    mockCaller(document);

    await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
      }),
    );

    expect(mockSend.mock.calls[0][0].replyTo).toBe("help@sog.gg");
  });

  /**
   * A seat whose product has already finished expands to no sessions at all,
   * and an empty `VCALENDAR` is a message with nothing in it: the client shows
   * the recipient nothing, while the send would still open a conversation and
   * record a sequence for an entry that never appears anywhere.
   */
  it("refuses a seat with no sessions left, and sends nothing", async () => {
    const document = definition();
    const finished: SandboxDefinition = {
      ...document,
      products: document.products.map((product) => ({
        ...product,
        startDate: "2019-01-07",
        endDate: "2019-01-11",
      })),
    };
    const { writes } = mockCaller(finished);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(finished),
        shape: "occurrences",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("no sessions left");
    expect(mockSend).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  /**
   * A weekly rule carries one clock face, so a club whose two sessions start at
   * different times has no rule form at all. The card disables the option off
   * the same predicate the builder refuses with, so this is the request that
   * arrives when something other than the card built it — and it must not reach
   * the relay, because a message the admin did not ask for is worse than none.
   */
  it("refuses the rule shape for a schedule a rule cannot state", async () => {
    const document = definition();
    const differing: SandboxDefinition = {
      ...document,
      products: document.products.map((product) => ({
        ...product,
        slots: product.slots.map((slot, index) =>
          index === 1 ? { ...slot, startTime: "17:30" } : slot,
        ),
      })),
    };
    const { writes } = mockCaller(differing);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(differing),
        shape: "series",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("weekly rule cannot state");
    expect(mockSend).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);

    // The same seat as an explicit list is fine: that is what the message says
    // to do, and it is the half of the pair this schedule can have.
    const listed = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(differing),
        shape: "occurrences",
      }),
    );

    expect(listed.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("refuses an update with no open invitation", async () => {
    const document = definition();
    mockCaller(document);

    const response = await POST(
      invitationRequest({
        action: "update",
        participationId: firstSeatId(document),
      }),
    );

    expect(response.status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a seat that is not in the sandbox family", async () => {
    mockCaller(definition());

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: "12121212-1212-4121-8121-121212121212",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a body that is not a whole request", async () => {
    mockCaller(definition());

    const response = await POST(
      new Request("https://test.sogverse.local/api/admin/calendar-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  // --- Setup failures ---

  /**
   * An unconfigured relay is a setup step nobody has taken yet, not a failure
   * of the request — so it is a 503 carrying words the admin can act on, rather
   * than a 500 and a stack trace.
   */
  it("answers 503 when the SMTP relay has no credentials", async () => {
    const document = definition();
    const { writes } = mockCaller(document);
    mockSend.mockRejectedValue(new SmtpNotConfiguredError());

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: firstSeatId(document),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toContain("BREVO_SMTP_LOGIN");
    expect(data.error).toContain("BREVO_SMTP_KEY");
    // Nothing was said to any calendar, so nothing is remembered.
    expect(writes).toHaveLength(0);
  });

  it("tells the admin to open the feed card when no sandbox exists", async () => {
    mockCaller(null);

    const response = await POST(
      invitationRequest({
        action: "send",
        participationId: "12121212-1212-4121-8121-121212121212",
      }),
    );

    expect(response.status).toBe(404);
  });
});

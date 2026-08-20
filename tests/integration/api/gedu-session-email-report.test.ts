import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/gedu/sessions/email-report/route";
import {
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * POST /api/gedu/sessions/email-report — the fan-out that mails a session
 * report to a group's families.
 *
 * What this file is really guarding is the pairing of two things that must not
 * drift: the claim (one guarded write, which is both the authorization and the
 * at-most-once marker) and the mails that follow it. So every case here asks
 * both halves of the question — what went out, and what the row now says. The
 * three cases the email rules demand of any sending route are the spine: it
 * sends on the outcome it should, it sends *nothing* on a refusal or a replay,
 * and a send that throws does not quietly change the answer.
 */

// Links in these mails carry people to a page about their child, so the origin
// they are built from is the canonical one, never the browser's Host header —
// `getOrigin` falls back to this when the request carries no trusted host, which
// is exactly what a mock Request does.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// --- Mocks -----------------------------------------------------------------

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

interface SentMail {
  fromEmail: string;
  fromName: string;
  toEmail: string | string[];
  subject: string;
  htmlContent: string;
  replyToEmail?: string;
  cc?: string[];
  bcc?: string[];
}

// Typed rather than `vi.fn()`, so `mock.calls` hands back a `SentMail` and the
// assertions below read the wrapper's options without an assertion.
const mockSendTransactionalEmail =
  vi.fn<(options: SentMail) => Promise<{ messageId: string }>>();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (options: SentMail) =>
    mockSendTransactionalEmail(options),
}));

const mockRpc = vi.fn();

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

// --- Fixtures --------------------------------------------------------------

const GROUP_ID = "0f0b1d7c-6a2e-4f7b-9d3a-6c1f2b8e4a51";
const SESSION_ID = "6b1e4c90-7d2f-4a83-8b55-2c7d9e0f1a34";
const SESSION_DATE = "2026-08-20";
const CLAIMED_AT = "2026-08-20T18:05:00Z";
const PRODUCT_ID = "b2c3d4e5-f607-4819-a2b3-c4d5e6f70819";

const REPORT = "## We built a castle\n\nEveryone finished their tower.";

const ORIGIN = "https://test.sogverse.local";

/** Participation ids, so a link assertion can name the seat it belongs to. */
const SEATS = {
  aino: "1a2b3c4d-5e6f-4708-9a1b-2c3d4e5f6071",
  vaino: "2b3c4d5e-6f70-4819-8b2c-3d4e5f607182",
  adult: "3c4d5e6f-7081-492a-9c3d-4e5f60718293",
  noContact: "4d5e6f70-8192-4a3b-8d4e-5f6071829304",
} as const;

const PEOPLE = {
  aino: "5e6f7081-9203-4b4c-9e5f-607182930415",
  vaino: "6f708192-0314-4c5d-8f60-718293041526",
  adult: "70819203-1425-4d6e-9071-829304152637",
  noContact: "81920314-2536-4e7f-8182-930415263748",
  payingCustomer: "92031425-3647-4f80-9293-041526374859",
} as const;

const CLAIM = {
  id: SESSION_ID,
  group_id: GROUP_ID,
  session_date: SESSION_DATE,
  // 16:30 – 18:00 in Europe/Helsinki, which is what the mails must say.
  starts_at: "2026-08-20T13:30:00Z",
  ends_at: "2026-08-20T15:00:00Z",
  report: REPORT,
  report_emailed_at: CLAIMED_AT,
};

const GROUP_ROW = {
  name: "Kettukallio",
  product: {
    id: PRODUCT_ID,
    product_type: "consumer_club",
    timezone: "Europe/Helsinki",
    product_translations: [
      { locale: "en", name: "Minecraft Club" },
      { locale: "fi", name: "Minecraft-kerho" },
    ],
  },
};

const ADMINS = [{ email: "admin1@test.local" }, { email: "admin2@test.local" }];

/** One row of the participations read, exactly as the route's select shapes it. */
interface ParticipationFixture {
  id: string;
  participant_id: string;
  customer_id: string;
  participant: {
    first_name: string;
    email: string;
    role: string;
    locale: string | null;
  };
}

/** One parent link, with the parent profile the route embeds on it. */
interface ParentLinkFixture {
  id: string;
  gamer_id: string;
  created_at: string | null;
  parent: { email: string; locale: string | null };
}

/** Two children and an adult on their own seat — the three mailable shapes. */
const PARTICIPATIONS: ParticipationFixture[] = [
  {
    id: SEATS.aino,
    participant_id: PEOPLE.aino,
    customer_id: PEOPLE.payingCustomer,
    participant: {
      first_name: "Aino",
      email: "aino@gamer.sogverse.internal",
      role: "gamer",
      locale: null,
    },
  },
  {
    id: SEATS.vaino,
    participant_id: PEOPLE.vaino,
    customer_id: PEOPLE.payingCustomer,
    participant: {
      first_name: "Väinö",
      email: "vaino@gamer.sogverse.internal",
      role: "gamer",
      locale: null,
    },
  },
  {
    id: SEATS.adult,
    participant_id: PEOPLE.adult,
    customer_id: PEOPLE.adult,
    participant: {
      first_name: "Sylvie",
      email: "sylvie@test.local",
      role: "customer",
      locale: "en",
    },
  },
];

const PARENT_LINKS: ParentLinkFixture[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    gamer_id: PEOPLE.aino,
    created_at: "2026-01-05T09:00:00Z",
    parent: { email: "aino-parent@test.local", locale: "fi" },
  },
  // A second link on the same child, created later: the route must pick the
  // earlier one, exactly as the roster RPC's ORDER BY does.
  {
    id: "a0000000-0000-4000-8000-000000000002",
    gamer_id: PEOPLE.aino,
    created_at: "2026-03-05T09:00:00Z",
    parent: { email: "aino-second-parent@test.local", locale: "en" },
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    gamer_id: PEOPLE.vaino,
    created_at: "2026-02-05T09:00:00Z",
    // No locale on file, so this mail must come out in the default locale.
    parent: { email: "vaino-parent@test.local", locale: null },
  },
];

// --- Admin-client mock -----------------------------------------------------

interface AdminData {
  group?: typeof GROUP_ROW | null;
  groupError?: { code: string; message: string } | null;
  admins?: { email: string }[];
  participations?: ParticipationFixture[];
  parentLinks?: ParentLinkFixture[];
}

/** What the release UPDATE was handed, so a test can assert the guard on it. */
const release: {
  patch: Record<string, unknown> | null;
  filters: [string, unknown][];
} = { patch: null, filters: [] };

function setupAdminClient(data: AdminData = {}) {
  const {
    group = GROUP_ROW,
    groupError = null,
    admins = ADMINS,
    participations = PARTICIPATIONS,
    parentLinks = PARENT_LINKS,
  } = data;

  // The chains are spelled out to the exact depth the route calls them, so this
  // mock doubles as a statement of the query shapes it depends on.
  mockFrom.mockImplementation((table: string) => {
    if (table === "product_groups") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: groupError ? null : group, error: groupError }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: admins, error: null }),
        }),
      };
    }
    if (table === "participations") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: participations, error: null }),
          }),
        }),
      };
    }
    if (table === "parent_gamer") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: parentLinks, error: null }),
        }),
      };
    }
    if (table === "group_sessions") {
      return {
        update: (patch: Record<string, unknown>) => {
          release.patch = patch;
          return {
            eq: (columnA: string, valueA: unknown) => {
              release.filters.push([columnA, valueA]);
              return {
                eq: (columnB: string, valueB: unknown) => {
                  release.filters.push([columnB, valueB]);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    }
    throw new Error(`unexpected table read: ${table}`);
  });
}

// --- Helpers ---------------------------------------------------------------

function createRequest(
  body: Record<string, unknown> = { groupId: GROUP_ID, sessionDate: SESSION_DATE },
  headers?: Record<string, string>,
): Request {
  return new Request("http://localhost:3000/api/gedu/sessions/email-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockGedu(overrides?: Record<string, unknown>) {
  mockRequireRole.mockResolvedValue({
    user: { id: "gedu-1" },
    profile: {
      id: "gedu-1",
      role: "gedu",
      first_name: "Marianne",
      email: "gedu@test.local",
      locale: "en",
      ...overrides,
    },
    supabase: { rpc: mockRpc },
  });
}

function mockRefused() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );
}

function claimSucceeds() {
  mockRpc.mockResolvedValue({ data: CLAIM, error: null });
}

function claimFails(code: string) {
  mockRpc.mockResolvedValue({
    data: null,
    error: { code, message: `refused with ${code}` },
  });
}

function sentMails(): SentMail[] {
  return mockSendTransactionalEmail.mock.calls.map(([options]) => options);
}

/** The family mails: everything without a CC. The copy is the one with one. */
function familyMails(): SentMail[] {
  return sentMails().filter((mail) => mail.cc === undefined);
}

function staffCopies(): SentMail[] {
  return sentMails().filter((mail) => mail.cc !== undefined);
}

function mailTo(address: string): SentMail {
  const found = sentMails().find((mail) => mail.toEmail === address);
  if (!found) throw new Error(`no mail was sent to ${address}`);
  return found;
}

// --- Tests -----------------------------------------------------------------

describe("POST /api/gedu/sessions/email-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    release.patch = null;
    release.filters = [];
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
    mockGedu();
    claimSucceeds();
    setupAdminClient();
  });

  // -- Auth --

  it("refuses a caller the gate turns away, and claims nothing", async () => {
    mockRefused();

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    // The claim is a WRITE, so a refused caller must not reach it at all.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("gates on a certified educator", async () => {
    await POST(createRequest());

    expect(mockRequireRole).toHaveBeenCalledWith(
      ["gedu"],
      expect.objectContaining({ requireCertifiedGedu: true }),
    );
  });

  // -- The claim --

  it("claims the send on the user-bound client before mailing anyone", async () => {
    await POST(createRequest());

    // Named by (group, date) and by nothing else: the RPC re-derives the caller
    // from auth.uid(), so this handler cannot send as another educator.
    expect(mockRpc).toHaveBeenCalledWith("claim_group_session_report_email", {
      p_group_id: GROUP_ID,
      p_session_date: SESSION_DATE,
    });
  });

  it("answers 409 and sends nothing when the report was already emailed", async () => {
    claimFails(SESSION_REPORT_ALREADY_SENT_SQLSTATE);

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe(SESSION_REPORT_ALREADY_SENT_SQLSTATE);
    expect(data.error).toMatch(/already been emailed/i);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("answers 409 and sends nothing when the report is whitespace-only", async () => {
    // The RPC applies the trimmed emptiness test, so a report of spaces refuses
    // here with its own SQLSTATE rather than mailing a blank write-up.
    claimFails(SESSION_REPORT_NO_REPORT_SQLSTATE);

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe(SESSION_REPORT_NO_REPORT_SQLSTATE);
    expect(data.error).toMatch(/no saved report/i);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("tells the two refusals apart by message", async () => {
    claimFails(SESSION_REPORT_NO_REPORT_SQLSTATE);
    const noReport = await (await POST(createRequest())).json();

    claimFails(SESSION_REPORT_ALREADY_SENT_SQLSTATE);
    const alreadySent = await (await POST(createRequest())).json();

    expect(noReport.error).not.toBe(alreadySent.error);
  });

  it("answers 403 when the educator does not teach the group", async () => {
    claimFails("42501");

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // -- The family fan-out --

  it("sends one mail per active participation with a contact", async () => {
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(familyMails()).toHaveLength(3);
    expect(familyMails().map((mail) => mail.toEmail).sort()).toEqual([
      "aino-parent@test.local",
      "sylvie@test.local",
      "vaino-parent@test.local",
    ]);
  });

  it("keeps a family's mail to that family — reply-to support, no cc, no bcc", async () => {
    await POST(createRequest());

    for (const mail of familyMails()) {
      expect(mail.replyToEmail).toBe("help@sog.gg");
      expect(mail.cc).toBeUndefined();
      expect(mail.bcc).toBeUndefined();
      expect(mail.fromEmail).toBe("sogverse@sog.gg");
      expect(mail.fromName).toBe("School of Gaming");
    }
  });

  it("links each mail to that participation's own /parent page", async () => {
    await POST(createRequest());

    // Keyed by participation, not by product: two children in one group get two
    // different links, each landing on their own page.
    expect(mailTo("aino-parent@test.local").htmlContent).toContain(
      `${ORIGIN}/parent/clubs/${SEATS.aino}`,
    );
    expect(mailTo("vaino-parent@test.local").htmlContent).toContain(
      `${ORIGIN}/parent/clubs/${SEATS.vaino}`,
    );
  });

  it("ignores a spoofed Host when building the links", async () => {
    await POST(createRequest(undefined, { host: "evil.example" }));

    for (const mail of sentMails()) {
      expect(mail.htmlContent).toContain(ORIGIN);
      expect(mail.htmlContent).not.toContain("evil.example");
    }
  });

  it("mails an adult's own seat to the adult, on the /parent root", async () => {
    await POST(createRequest());

    const mail = mailTo("sylvie@test.local");
    expect(mail.htmlContent).toContain(`${ORIGIN}/parent/clubs/${SEATS.adult}`);
    expect(mail.htmlContent).toContain("Sylvie");
    // The synthetic gamer handle is not a mailbox and must never be a recipient.
    expect(
      sentMails().some((sent) => String(sent.toEmail).includes("sogverse.internal")),
    ).toBe(false);
  });

  it("takes the earliest-linked parent when a child has several", async () => {
    await POST(createRequest());

    expect(
      sentMails().map((mail) => mail.toEmail),
    ).not.toContain("aino-second-parent@test.local");
  });

  it("writes each recipient in their own locale", async () => {
    await POST(createRequest());

    // Finnish on file → the Finnish subject and the Finnish product name.
    const finnish = mailTo("aino-parent@test.local");
    expect(finnish.subject).toContain("Raportti kerrasta");
    expect(finnish.subject).toContain("Minecraft-kerho");

    // No locale on file → the default locale, not the sender's and not a blank.
    const fallback = mailTo("vaino-parent@test.local");
    expect(fallback.subject).toContain("Session report");
    expect(fallback.subject).toContain("Minecraft Club");
  });

  it("names the product's zone in the time range, in the reader's locale", async () => {
    await POST(createRequest());

    // A mail is rendered without the reader's own zone, so it says which one it
    // used — and the family page it links to labels the same session in the
    // viewer's zone, which only agrees if this one is named.
    // The thin spaces around the en dash are Intl's, not ours — spelled out so a
    // formatter change cannot pass this by producing a different separator.
    expect(mailTo("vaino-parent@test.local").htmlContent).toContain(
      "16:30\u2009\u2013\u200918:00 GMT+3",
    );
    expect(mailTo("aino-parent@test.local").htmlContent).toContain(
      "16.30\u201318.00 UTC+3",
    );
  });

  it("carries the report itself, and escapes what a person typed", async () => {
    setupAdminClient({
      participations: [
        {
          ...PARTICIPATIONS[2],
          participant: {
            ...PARTICIPATIONS[2].participant,
            first_name: "<script>alert(1)</script>",
          },
        },
      ],
      parentLinks: [],
    });

    await POST(createRequest());

    const mail = mailTo("sylvie@test.local");
    // The report arrives rendered, by the same parser and subset the app uses.
    expect(mail.htmlContent).toContain("We built a castle");
    expect(mail.htmlContent).toContain("Everyone finished their tower.");
    // And every user-typed value arrives as text, never as markup.
    expect(mail.htmlContent).toContain("&lt;script&gt;");
    expect(mail.htmlContent).not.toContain("<script>");
  });

  // -- Seats with nobody to mail --

  it("skips and counts a seat with neither a parent nor an address of its own", async () => {
    setupAdminClient({
      participations: [
        ...PARTICIPATIONS,
        {
          id: SEATS.noContact,
          participant_id: PEOPLE.noContact,
          customer_id: PEOPLE.payingCustomer,
          participant: {
            first_name: "Orvokki",
            email: "orvokki@gamer.sogverse.internal",
            role: "gamer",
            locale: null,
          },
        },
      ],
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 3, failed: 0, skipped: 1 });
    expect(familyMails()).toHaveLength(3);
  });

  it("still claims, still copies staff and still answers 200 when no seat is mailable", async () => {
    // Unreachable through the product, but the button is offered anyway (hiding
    // it would leave such a session owing attention forever), and this is how
    // staff find out the group has seats with no contact.
    setupAdminClient({
      participations: [PARTICIPATIONS[0], PARTICIPATIONS[1]],
      parentLinks: [],
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(familyMails()).toHaveLength(0);
    expect(staffCopies()).toHaveLength(1);
    expect(release.patch).toBeNull();
  });

  // -- The staff copy --

  it("sends exactly one staff copy, to the gedu with every admin in CC", async () => {
    await POST(createRequest());

    const copies = staffCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0].toEmail).toBe("gedu@test.local");
    expect(copies[0].cc).toEqual(["admin1@test.local", "admin2@test.local"]);
    expect(copies[0].bcc).toBeUndefined();
    expect(copies[0].replyToEmail).toBe("help@sog.gg");
  });

  it("links the staff copy to the gedu workspace's product page", async () => {
    await POST(createRequest());

    // The gedu routes are keyed by product, not group — the page resolves the
    // educator's own group itself.
    const copy = staffCopies()[0];
    expect(copy.htmlContent).toContain(`${ORIGIN}/gedu/clubs/${PRODUCT_ID}`);
    // The group's name stands in the child's slot, so the copy reads as a record
    // of what the group was sent rather than as one child's mail.
    expect(copy.htmlContent).toContain("Kettukallio");
  });

  it("answers 200 when only the staff copy throws", async () => {
    mockSendTransactionalEmail.mockImplementation(
      (options: SentMail) =>
        options.cc
          ? Promise.reject(new Error("Brevo said no"))
          : Promise.resolve({ messageId: "msg-1" }),
    );

    const response = await POST(createRequest());
    const data = await response.json();

    // The families are the outcome; the copy is the record. Its failure is
    // logged and changes nothing — least of all the claim.
    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(release.patch).toBeNull();
  });

  // -- Failure --

  it("releases the claim and answers 502 when every family send throws", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo is down"));

    const response = await POST(createRequest());

    expect(response.status).toBe(502);
    // Nobody received anything, so no record of a send may stand and no copy
    // may claim one happened.
    expect(staffCopies()).toHaveLength(0);
    expect(release.patch).toEqual({
      report_emailed_at: null,
      report_emailed_by: null,
    });
    // Guarded on the stamp the claim wrote: a release must not undo a different
    // send that landed in between.
    expect(release.filters).toEqual([
      ["id", SESSION_ID],
      ["report_emailed_at", CLAIMED_AT],
    ]);
  });

  it("keeps the claim, sends the copy and reports the counts when one send throws", async () => {
    mockSendTransactionalEmail.mockImplementation((options: SentMail) =>
      options.toEmail === "vaino-parent@test.local"
        ? Promise.reject(new Error("mailbox full"))
        : Promise.resolve({ messageId: "msg-1" }),
    );

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 2, failed: 1, skipped: 0 });
    // The families who did receive it must not receive it twice.
    expect(release.patch).toBeNull();
    expect(staffCopies()).toHaveLength(1);
  });

  it("does not stop the fan-out at the first rejection", async () => {
    mockSendTransactionalEmail.mockImplementation((options: SentMail) =>
      options.toEmail === "aino-parent@test.local"
        ? Promise.reject(new Error("mailbox full"))
        : Promise.resolve({ messageId: "msg-1" }),
    );

    await POST(createRequest());

    expect(familyMails()).toHaveLength(3);
    expect(staffCopies()).toHaveLength(1);
  });
});

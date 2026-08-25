import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/gedu/sessions/email-report/route";
import {
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { BRAND } from "@/lib/constants/colors";

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
  participationsError?: { code: string; message: string } | null;
  parentLinks?: ParentLinkFixture[];
}

/** What the release UPDATE was handed, so a test can assert the guard on it. */
const release: {
  patch: Record<string, unknown> | null;
  filters: [string, unknown][];
} = { patch: null, filters: [] };

/**
 * Every `(column, value)` the reads were filtered by, per table.
 *
 * Recorded rather than discarded because a filter is the whole meaning of these
 * reads: a participations query that forgets `status` mails the families of
 * seats that left the group, and a mock that swallowed the arguments would let
 * that ship green. The route's own filters are asserted against these, so
 * dropping one from the route fails a test rather than changing nothing.
 */
const reads: {
  productGroups: [string, unknown][];
  profiles: [string, unknown][];
  participations: [string, unknown][];
} = { productGroups: [], profiles: [], participations: [] };

/** Every parent-link lookup the route made, so "none at all" can be asserted. */
const parentLinkLookups: [string, string[]][] = [];

function setupAdminClient(data: AdminData = {}) {
  const {
    group = GROUP_ROW,
    groupError = null,
    admins = ADMINS,
    participations = PARTICIPATIONS,
    participationsError = null,
    parentLinks = PARENT_LINKS,
  } = data;

  // The chains are spelled out to the exact depth the route calls them, so this
  // mock doubles as a statement of the query shapes it depends on.
  mockFrom.mockImplementation((table: string) => {
    if (table === "product_groups") {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            reads.productGroups.push([column, value]);
            return {
              single: () =>
                Promise.resolve({ data: groupError ? null : group, error: groupError }),
            };
          },
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            reads.profiles.push([column, value]);
            return Promise.resolve({ data: admins, error: null });
          },
        }),
      };
    }
    if (table === "participations") {
      return {
        select: () => ({
          eq: (columnA: string, valueA: unknown) => {
            reads.participations.push([columnA, valueA]);
            return {
              eq: (columnB: string, valueB: unknown) => {
                reads.participations.push([columnB, valueB]);
                return Promise.resolve({
                  data: participationsError ? null : participations,
                  error: participationsError,
                });
              },
            };
          },
        }),
      };
    }
    if (table === "parent_gamer") {
      return {
        select: () => ({
          in: (column: string, values: string[]) => {
            parentLinkLookups.push([column, values]);
            return Promise.resolve({ data: parentLinks, error: null });
          },
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

/**
 * The same send, made by an admin from the product page (00200).
 *
 * Deliberately given an address that is ALSO in the admin list, because that is
 * the real shape: every admin is in the CC, so the sender is in it too unless
 * something takes them out.
 */
function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: {
      id: "admin-1",
      role: "admin",
      first_name: "Sylvia",
      email: "admin1@test.local",
      locale: "en",
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
    reads.productGroups = [];
    reads.profiles = [];
    reads.participations = [];
    parentLinkLookups.length = 0;
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

  it("gates on a certified educator, or an admin", async () => {
    await POST(createRequest());

    // Both roles reach the claim, which is the real authorization: it passes an
    // admin by role and a gedu only on the group they teach. The certification
    // test is applied by the gate to `gedu` callers alone, so naming admin here
    // widens who may press the button without relaxing anything for educators.
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["gedu", "admin"],
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

  // -- What the reads are filtered by --
  //
  // A filter is the whole meaning of each of these reads, so each one is named
  // here once. Drop one from the route and the matching case fails.

  it("reads only this group's active participations", async () => {
    await POST(createRequest());

    // Both filters, in the order the route applies them. A read that forgot
    // `status` would mail the families of children who have left the group.
    expect(reads.participations).toEqual([
      ["group_id", GROUP_ID],
      ["status", "active"],
    ]);
  });

  it("reads the group the claim named", async () => {
    await POST(createRequest());

    // The claim's own group id, not the body's: the claim is the authorization,
    // so everything downstream is keyed by what it returned.
    expect(reads.productGroups).toEqual([["id", CLAIM.group_id]]);
  });

  it("puts only admins in the staff copy's CC", async () => {
    await POST(createRequest());

    expect(reads.profiles).toEqual([["role", "admin"]]);
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

  it("asks for no parent links at all when the group has no active seats", async () => {
    setupAdminClient({ participations: [], parentLinks: [] });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 0, failed: 0, skipped: 0 });
    // An `IN ()` over an empty list is a round trip whose answer is already
    // known, so the empty roster makes no dependent read.
    expect(parentLinkLookups).toEqual([]);
    expect(familyMails()).toHaveLength(0);
    expect(staffCopies()).toHaveLength(1);
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

  /**
   * The copy names itself as one, and the family mails do not.
   *
   * This is the route's half of the variant — the builder can render the banner
   * and still never be asked to. What it prevents is the confusion the banner
   * was written for (staff reading their own To and CC as a leaked family mail)
   * and the far worse inverse: a parent told their report is a copy of what
   * went to the other families.
   */
  it("opens the staff copy with the banner and leaves it off every family mail", async () => {
    await POST(createRequest());

    const copy = staffCopies()[0];
    // The load-bearing check is the banner's own markup, not its words: these
    // mails are rendered in each reader's locale, so an English string proves
    // nothing about the Finnish parent's mail — it would be absent from that one
    // whether the banner rendered or not. The 3px brand rule is the banner's
    // alone in this template and is the same bytes in every locale. (The
    // twice-declared `DARK_THEME.bg` fill is not: the shell emits it too.)
    expect(copy.htmlContent).toContain(`border-left:3px solid ${BRAND.primary}`);
    // The English copy's words still earn their place — this sender reads in
    // `en`, and the marker cannot tell a banner from an empty one.
    expect(copy.htmlContent).toContain("Staff copy");
    expect(copy.htmlContent).toContain("Every family received their own separate email");

    for (const mail of familyMails()) {
      expect(mail.htmlContent).not.toContain(`border-left:3px solid ${BRAND.primary}`);
    }
  });

  // -- The staff copy when an ADMIN pressed the button (00200) --
  //
  // Three things follow the sender rather than the role, and each of them is
  // wrong in a way somebody would notice if it were left as the gedu case.

  it("does not put an admin sender in their own CC", async () => {
    mockAdmin();

    await POST(createRequest());

    const copies = staffCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0].toEmail).toBe("admin1@test.local");
    // The To address is dropped from the CC, or Brevo delivers the same copy
    // twice to the person who sent it. Every OTHER admin still gets it.
    expect(copies[0].cc).toEqual(["admin2@test.local"]);
  });

  it("links an admin's staff copy to the admin product page, not the gedu workspace", async () => {
    mockAdmin();

    await POST(createRequest());

    // `/gedu/...` is role-gated to educators, so mailing an admin that URL is
    // mailing them a link the proxy bounces.
    const copy = staffCopies()[0];
    expect(copy.htmlContent).toContain(
      `${ORIGIN}/admin/consumer-clubs/${PRODUCT_ID}`,
    );
    expect(copy.htmlContent).not.toContain(`${ORIGIN}/gedu/clubs/`);
  });

  it("signs an admin's family mails with the admin's own name", async () => {
    mockAdmin();

    await POST(createRequest());

    // The mail says who it is from. An admin sending on a gedu's behalf is
    // still the person who sent it, and naming the educator instead would be a
    // claim about a person rather than a cosmetic slip.
    expect(familyMails()[0].htmlContent).toContain("Sylvia");
    expect(familyMails()[0].htmlContent).not.toContain("Marianne");
  });

  it("mails the families exactly what a gedu's send would", async () => {
    mockAdmin();

    const response = await POST(createRequest());
    const data = await response.json();

    // The families are not told, and must not be told, that this went out from
    // the admin panel: it is their group's report either way.
    expect(response.status).toBe(200);
    expect(data).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(familyMails().map((mail) => mail.toEmail).sort()).toEqual([
      "aino-parent@test.local",
      "sylvie@test.local",
      "vaino-parent@test.local",
    ]);
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

  it("releases the claim and answers 500 when resolving the recipients fails", async () => {
    // The claim commits before anything is sent, so every throw in the window
    // between them would otherwise leave the session stamped as emailed with
    // nobody mailed — and the next press told it had already gone out.
    setupAdminClient({
      participationsError: {
        code: "57014",
        message: "canceling statement due to statement timeout",
      },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    expect(release.patch).toEqual({
      report_emailed_at: null,
      report_emailed_by: null,
    });
    // The same guard the every-send-failed path uses: a release must not undo a
    // different send that landed in between.
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

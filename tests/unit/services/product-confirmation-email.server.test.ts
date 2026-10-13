import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * The confirmation mail's product read, pinned at the one column the guide
 * depends on.
 *
 * **`topic` is the "Before the first session" guide's only input beyond
 * `is_remote`, and it states no row of its own** — no fact list mentions it and
 * no sentence names it — so a later tidy-up of this select has nothing in the
 * rendered mail to warn it that dropping the column deletes a whole section.
 * The sender's only handler for a failure is a `console.error`, so a read that
 * comes back without the column costs the family the entire mail rather than
 * the guide alone, and costs it silently. This is the test that fails first.
 *
 * The real Supabase client runs over a fake fetch transport, so the assertion
 * reads the select string the genuine query builder actually sent. Every
 * response is an error, which is all this test needs: the select is composed
 * before any answer comes back, and the sender swallows the failure by design.
 */

const { sendTransactionalEmail } = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail }));

// A static import, deliberately — it used to be an `await import()` inside the
// test body, which charged the transformation of the sender's whole
// import graph (every email template, the calendar invitation, the topic
// guide) to the test's five-second clock instead of to collection. Under
// CPU contention that alone took longer than the clock, and the test timed
// out on a machine running lint and type-check beside it. The mock above is
// hoisted over this import either way, so nothing else changes.
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";

describe("sendProductConfirmationEmail's product read", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(postgrestError("no rows for this fixture"));
  });

  it("asks for the topic the guide is resolved from", async () => {
    // The sender logs and swallows, so nothing here throws; what is asserted is
    // the request it made on the way.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendProductConfirmationEmail({
      client: createFetchStubbedClient(fetchMock),
      request: new Request("https://sogverse.example/api/checkout"),
      customerId: "11111111-1111-1111-1111-111111111111",
      participantId: "22222222-2222-2222-2222-222222222222",
      productId: "33333333-3333-3333-3333-333333333333",
      participationId: "44444444-4444-4444-4444-444444444444",
      mode: "free",
    });

    const selects = fetchMock.mock.calls
      .map((call) => requestedUrl(call[0]))
      .filter((url) => url.pathname === "/rest/v1/products")
      .map((url) => url.searchParams.get("select") ?? "");

    expect(selects.length).toBeGreaterThan(0);
    expect(selects.some((select) => /\btopic\b/.test(select))).toBe(true);
    // Its companion, and the other half of what the guide is resolved from.
    expect(selects.some((select) => select.includes("is_remote"))).toBe(true);

    errors.mockRestore();
  });
});

/**
 * The plan the invitation is composed from is read over the span the composer
 * walks its rule across — from today *in the product's zone* to the end date —
 * so an `EXDATE` can only ever name a day the plan had the chance to hold.
 */
describe("sendProductConfirmationEmail's plan read", () => {
  const PRODUCT = "33333333-3333-3333-3333-333333333333";
  const PARENT = "11111111-1111-1111-1111-111111111111";
  const CHILD = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function respondTo(
    planBodies: unknown[],
    {
      breakBodies = [],
      breaks = [],
      endDate = "2027-05-31",
    }: { breakBodies?: unknown[]; breaks?: unknown[]; endDate?: string | null } = {},
  ): FetchMock {
    return vi.fn<typeof fetch>(async (input, init) => {
      const url = requestedUrl(input);
      if (url.pathname === "/rest/v1/rpc/planned_session_dates") {
        planBodies.push(JSON.parse(String(init?.body)));
        return postgrestJson([]);
      }
      if (url.pathname === "/rest/v1/rpc/holiday_breaks_document") {
        breakBodies.push(JSON.parse(String(init?.body)));
        return postgrestJson(breaks);
      }
      if (url.pathname === "/rest/v1/profiles") {
        return postgrestJson([
          { id: PARENT, first_name: "Marja", last_name: "Virtanen", email: "marja@example.com", locale: "en", gamer_profiles: null },
          { id: CHILD, first_name: "Aino", last_name: "Virtanen", email: null, locale: "en", gamer_profiles: { sign_in: "parent" } },
        ]);
      }
      const select = url.searchParams.get("select") ?? "";
      if (select.startsWith("schedule_slots")) {
        return postgrestJson({
          schedule_slots: [{ weekday: 0, start_time: "16:00:00", duration_minutes: 60 }],
          locations: null,
        });
      }
      return postgrestJson({
        product_type: "municipality_club",
        billing_mode: "free",
        topic: "minecraft",
        timezone: "Europe/Helsinki",
        start_date: "2027-01-04",
        end_date: endDate,
        is_remote: true,
        min_age: 8,
        max_age: 12,
        for_gamers: true,
        for_parents: false,
        spoken_language_code: "fi",
        product_translations: [{ locale: "en", name: "Minecraft 101", short_description: null }],
      });
    });
  }

  it("asks for product-local today through the end date", async () => {
    // 23:30 UTC on 10 January is already the 11th in Helsinki.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-10T23:30:00Z"));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.example");
    const planBodies: unknown[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendProductConfirmationEmail({
      client: createFetchStubbedClient(respondTo(planBodies)),
      request: new Request("https://sogverse.example/api/checkout"),
      customerId: PARENT,
      participantId: CHILD,
      productId: PRODUCT,
      participationId: "44444444-4444-4444-4444-444444444444",
      mode: "free",
    });

    expect(planBodies).toEqual([
      { p_product_id: PRODUCT, p_from: "2027-01-11", p_to: "2027-05-31" },
    ]);
    expect(errors).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  /** One break as `holiday_breaks_document` emits it. */
  function breakRow(id: string, name: string, from: string, to: string, withdrew: boolean) {
    return {
      id,
      start_date: from,
      end_date: to,
      names: [{ locale: "en", name }],
      withdrawn_sessions: withdrew
        ? [{ session_date: from, starts_at: `${from}T14:00:00Z`, ends_at: `${from}T15:00:00Z` }]
        : [],
    };
  }

  async function send(fetchMock: FetchMock) {
    await sendProductConfirmationEmail({
      client: createFetchStubbedClient(fetchMock),
      request: new Request("https://sogverse.example/api/checkout"),
      customerId: PARENT,
      participantId: CHILD,
      productId: PRODUCT,
      participationId: "44444444-4444-4444-4444-444444444444",
      mode: "free",
    });
  }

  it("reads a dated club's holiday breaks from product-local today to its end and lists those that took a session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-10T23:30:00Z"));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.example");
    const breakBodies: unknown[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await send(
      respondTo([], {
        breakBodies,
        breaks: [
          breakRow("b1", "Winter break", "2027-02-22", "2027-02-26", true),
          breakRow("b2", "Teacher day", "2027-03-05", "2027-03-05", false),
          breakRow("b3", "Easter", "2027-03-26", "2027-03-29", true),
        ],
      }),
    );

    // Product-local today, not the term's first day: a break that is over is
    // never listed, so the past is not read.
    expect(breakBodies).toEqual([
      { p_product_id: PRODUCT, p_from: "2027-01-11", p_to: "2027-05-31" },
    ]);
    const { htmlContent } = sendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain("Holiday breaks");
    // In the compact form, without the year: 2027 is the current year here.
    expect(htmlContent).toMatch(/<strong[^>]*>Winter break<\/strong><br \/>Feb 22 – 26/);
    expect(htmlContent).toMatch(/<strong[^>]*>Easter<\/strong><br \/>Mar 26 – 29/);
    // A break that removed no session is not one this club takes.
    expect(htmlContent).not.toContain("Teacher day");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("reads no breaks for a dated club whose term has ended, and states no row for them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-10T23:30:00Z"));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.example");
    const breakBodies: unknown[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    // The 10th is yesterday in Helsinki.
    await send(respondTo([], { breakBodies, endDate: "2027-01-10" }));

    expect(breakBodies).toEqual([]);
    const { htmlContent } = sendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain("Holiday breaks");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("reads an open-ended club's breaks from product-local today a year and a day ahead", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-10T23:30:00Z"));
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sogverse.example");
    const breakBodies: unknown[] = [];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await send(respondTo([], { breakBodies, endDate: null }));

    expect(breakBodies).toEqual([
      { p_product_id: PRODUCT, p_from: "2027-01-11", p_to: "2028-01-12" },
    ]);
    // None came back, so the mail states no row for them.
    const { htmlContent } = sendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain("Holiday breaks");
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

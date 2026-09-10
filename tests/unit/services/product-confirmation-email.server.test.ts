import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFetchStubbedClient,
  postgrestError,
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
    const { sendProductConfirmationEmail } = await import(
      "@/services/participations/product-confirmation-email.server"
    );

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

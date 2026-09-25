import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ParticipantPickerSheet } from "@/components/admin/products/participant-picker-sheet";
import { GeduPickerSheet } from "@/components/admin/products/gedu-picker-sheet";
import {
  createFetchStubbedClient,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * **A picker sheet that nobody has opened reads nothing.**
 *
 * Both sheets are in the groups panel's tree from its first render, closed, and
 * that is deliberate: a sheet mounted already open plays neither its enter nor
 * its exit animation, so staying mounted is what lets them slide. What it must
 * not cost is a page of accounts on every admin product page view — which is
 * what it did cost, for two sheets at once, plus a walk of every parent↔gamer
 * link and every gedu's certification row.
 *
 * So these tests are about *requests*, not about hook arguments: the real hook
 * and the real service run over a fake fetch transport, and what is asserted is
 * whether anything was sent. An assertion on `enabled` would pass just as
 * happily against a hook that ignored it.
 *
 * The third case is the one the latch exists for. It never clears, so closing
 * the sheet keeps what was already fetched — a reopen is instant, and an admin
 * comping four seats in a row does not pay four times.
 */

// Declared here and filled per test, so the module factory below — which is
// hoisted above this file's own initialisation — reads the client at call time
// rather than capturing an uninitialised binding.
let fetchMock: FetchMock;
let client: SupabaseClient<Database>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => client,
  getClient: () => client,
}));

// Translations echo their keys, so nothing here depends on English wording.
// `useLocale` comes with them because the gedu picker names spoken languages.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/** A page of one family, with no second page behind it. */
function onePage(id: string, firstName: string, role: "customer" | "gedu") {
  return postgrestPage(
    [
      {
        id,
        email: `${firstName.toLowerCase()}@example.test`,
        email_verified_at: null,
        first_name: firstName,
        last_name: "Virtanen",
        role,
        phone: null,
        currency: null,
        home_location_id: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        registration_completed_at: "2026-01-01T00:00:00.000Z",
        locale: "fi",
        spoken_languages: [],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        certified: true,
        criminal_record_check_passed: false,
        linked_gamers: [],
      },
    ],
    { from: 0, total: 1 },
  );
}

/** Every people-list request this test's transport has seen. */
function listRequests(): URL[] {
  return fetchMock.mock.calls
    .map((call) => requestedUrl(call[0]))
    .filter((url) => url.pathname.includes("user_list_entries"));
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  client = createFetchStubbedClient(fetchMock);
});

afterEach(() => {
  cleanup();
});

describe("ParticipantPickerSheet — reads wait for the first open", () => {
  it("sends no request while it has never been opened", async () => {
    fetchMock.mockResolvedValue(onePage("parent-1", "Marja", "customer"));

    const { rerender } = render(
      <ParticipantPickerSheet
        open={false}
        onOpenChange={() => {}}
        audience="both"
        enrolledParticipantIds={new Set()}
        onAddParticipant={async () => {}}
      />,
      { wrapper: wrapper() },
    );

    // Two renders of the closed sheet, because a latch that fired on mount
    // rather than on the open edge would still look quiet after only one.
    rerender(
      <ParticipantPickerSheet
        open={false}
        onOpenChange={() => {}}
        audience="parents"
        enrolledParticipantIds={new Set()}
        onAddParticipant={async () => {}}
      />,
    );

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(listRequests()).toEqual([]);
  });

  it("asks for a page of families once it is opened, and keeps them when it closes", async () => {
    fetchMock.mockResolvedValue(onePage("parent-1", "Marja", "customer"));

    const props = {
      onOpenChange: () => {},
      audience: "both" as const,
      enrolledParticipantIds: new Set<string>(),
      onAddParticipant: async () => {},
    };

    const { rerender } = render(
      <ParticipantPickerSheet open={false} {...props} />,
      { wrapper: wrapper() },
    );
    expect(listRequests()).toEqual([]);

    rerender(<ParticipantPickerSheet open {...props} />);

    expect(await screen.findByText("Marja")).toBeTruthy();
    expect(listRequests()).toHaveLength(1);
    expect(listRequests()[0].searchParams.get("role")).toBe("eq.customer");

    // Closed again: the latch does not clear, so the families stay rendered
    // behind the exit animation and nothing is re-fetched.
    rerender(<ParticipantPickerSheet open={false} {...props} />);

    expect(screen.getByText("Marja")).toBeTruthy();
    expect(listRequests()).toHaveLength(1);
  });
});

describe("GeduPickerSheet — reads wait for the first open", () => {
  it("sends no request while it has never been opened", async () => {
    fetchMock.mockResolvedValue(onePage("gedu-1", "Anna", "gedu"));

    render(
      <GeduPickerSheet
        open={false}
        onOpenChange={() => {}}
        title="Staff this group"
        description="Pick an educator"
        onSelect={() => {}}
      />,
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(listRequests()).toEqual([]);
  });

  it("asks for educators once it is opened, and keeps them when it closes", async () => {
    fetchMock.mockResolvedValue(onePage("gedu-1", "Anna", "gedu"));

    const props = {
      onOpenChange: () => {},
      title: "Staff this group",
      description: "Pick an educator",
      onSelect: () => {},
    };

    const { rerender } = render(<GeduPickerSheet open={false} {...props} />, {
      wrapper: wrapper(),
    });
    expect(listRequests()).toEqual([]);

    rerender(<GeduPickerSheet open {...props} />);

    expect(await screen.findByText("Anna Virtanen")).toBeTruthy();
    // One request, not two: the filtered query and the unfiltered one behind
    // the count line are the same question while nothing is typed and no chip
    // is chosen, so they share a cache entry.
    expect(listRequests()).toHaveLength(1);
    expect(listRequests()[0].searchParams.get("role")).toBe("eq.gedu");

    rerender(<GeduPickerSheet open={false} {...props} />);

    expect(screen.getByText("Anna Virtanen")).toBeTruthy();
    expect(listRequests()).toHaveLength(1);
  });
});

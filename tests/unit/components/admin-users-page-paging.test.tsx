import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import AdminUsersPage from "@/app/[locale]/(dashboard)/admin/users/page";
import { ADMIN_PEOPLE_LIST_PAGE_SIZE } from "@/lib/constants/admin-people-lists";
import type { UserListEntry } from "@/services/users";
import {
  installFakeIntersectionObserver,
  latestIntersectionObserver,
} from "../../mocks/intersection-observer";

/**
 * **The users list grows by scrolling, and it asks for the next page exactly
 * when the reader reaches the bottom of this one.**
 *
 * The page renders the newest 25 accounts and nothing else; what makes that
 * sufficient rather than truncated is the sentinel below the last row. jsdom
 * works out no intersection of its own, so the stub reports on the test's
 * behalf and what is asserted here is the page's side of the arrangement:
 * whether the sentinel exists at all, and whether reaching it asks for more.
 *
 * The third case is this page's own decision rather than the hook's. Holding
 * the previous needle's rows while the next needle is in flight is what keeps
 * the list from emptying on every keystroke — and it means the cursor those
 * rows yield belongs to the *previous* question, so asking for more while they
 * are on screen would resume the new query from the old query's boundary.
 */

// Translations echo their keys, so nothing here depends on English wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// The one read behind the rows, and the only other thing the page asks for:
// contract acceptance, which lands after them and which these cases leave
// answered-and-empty so no warning mark is in question.
const fetchNextPage = vi.fn(() => Promise.resolve());
let listState: Record<string, unknown>;

vi.mock("@/services/users", () => ({
  useUserList: () => listState,
}));

vi.mock("@/services/gedu", () => ({
  useGeduContractAcceptanceMap: () => ({
    map: new Map(),
    isError: false,
    isPending: false,
  }),
}));

// Real UUIDs, hardcoded: every row draws an identicon from the id's hex bytes,
// and a readable stand-in renders a degenerate one.
const IDS = [
  "5c0f2b3e-1d47-4a8b-9f12-7c6e5a4b3d21",
  "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
] as const;

function entry(id: string, firstName: string): UserListEntry {
  return {
    id,
    email: `${firstName.toLowerCase()}@example.test`,
    email_verified_at: null,
    first_name: firstName,
    last_name: "Virtanen",
    role: "customer",
    phone: null,
    currency: null,
    home_location_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    locale: "fi",
    spoken_languages: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    certified: false,
    criminal_record_check_passed: false,
    linked_gamers: [],
  };
}

/** One full page of rows, so "there is more" is a plausible claim. */
const FULL_PAGE = Array.from({ length: ADMIN_PEOPLE_LIST_PAGE_SIZE }, (_, i) =>
  entry(i < IDS.length ? IDS[i] : `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `Person ${i}`),
);

function listWith(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ rows: FULL_PAGE, total: 312 }] },
    isPending: false,
    isPlaceholderData: false,
    hasNextPage: true,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage,
    ...overrides,
  };
}

/** Report the observed sentinel as in view, as a browser would. */
function reachTheBottom() {
  act(() => {
    latestIntersectionObserver()?.deliver();
  });
}

beforeEach(() => {
  fetchNextPage.mockClear();
  listState = listWith();
  installFakeIntersectionObserver();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the admin users list grows as it is scrolled", () => {
  it("asks for the next page when the reader reaches the bottom of this one", () => {
    render(<AdminUsersPage />);

    // A non-gamer row prints both names, so this is one row's whole label.
    expect(screen.getByText("Person 0 Virtanen")).toBeTruthy();

    reachTheBottom();

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("puts up no sentinel once there is nothing left to reach for", () => {
    listState = listWith({ hasNextPage: false });
    render(<AdminUsersPage />);

    expect(latestIntersectionObserver()).toBeUndefined();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  // The rows on screen answer the previous needle, so their cursor cannot be
  // used to resume the new one.
  it("does not ask for more while it is showing the previous query's rows", () => {
    listState = listWith({ isPlaceholderData: true });
    render(<AdminUsersPage />);

    reachTheBottom();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not ask again while a page is already in flight", () => {
    listState = listWith({ isFetching: true, isFetchingNextPage: true });
    render(<AdminUsersPage />);

    reachTheBottom();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  // Asking for the next page cancels a refresh in flight, so reaching the
  // bottom while an invalidation re-reads the loaded pages would discard that
  // refresh and leave the stale rows on screen marked fresh.
  it("does not ask for more while the loaded pages are being refreshed", () => {
    listState = listWith({ isFetching: true, isFetchingNextPage: false });
    render(<AdminUsersPage />);

    reachTheBottom();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  /**
   * The first page is a keyset page of 25 off an indexed view, so nothing
   * stands in for it — no skeleton, no spinner. What must not appear meanwhile
   * is the empty line, which would claim nobody exists before anyone has been
   * asked.
   */
  it("renders nothing at all while the first page is in flight", () => {
    listState = listWith({
      data: undefined,
      isPending: true,
      hasNextPage: false,
    });
    render(<AdminUsersPage />);

    expect(screen.queryByText("noUsers")).toBeNull();
    expect(screen.queryByText("noFilterResults")).toBeNull();
  });

  it("says so once the first page comes back empty", () => {
    listState = listWith({
      data: { pages: [{ rows: [], total: 0 }] },
      hasNextPage: false,
    });
    render(<AdminUsersPage />);

    expect(screen.getByText("noUsers")).toBeTruthy();
  });
});

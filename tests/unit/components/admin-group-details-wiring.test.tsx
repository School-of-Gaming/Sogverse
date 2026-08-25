import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { AdminGroupDetailsPage } from "@/components/admin/products/group-details/admin-group-details-page";
import type { AdminProductSessions } from "@/services/admin-sessions";
import type { GeduGroupFeed } from "@/services/gedu-sessions";
import type { ProductAdminDetailRow } from "@/services/products";
import type { ProductGroupsSnapshot, ProductType } from "@/types";

/**
 * ============================================================================
 * The admin group page is the gedu's page, fed from admin reads.
 * ============================================================================
 *
 * The body is shared and is tested where it lives; the marks themselves are
 * pure and covered in `member-flair-newcomer.test.ts`. What only this shell can
 * get wrong is the seam it owns — **four documents folded into the one shape
 * that body takes**:
 *
 *  1. **The roster and its flair come from the group *feed*, not from the admin
 *     session record.** The record's roster is deliberately thin (an id and a
 *     first name, enough to key an attendance mark by) and carries no marks at
 *     all, so a shell that built the rail from it would ship a page with no
 *     badge, no note and no error. Every fixture here therefore puts the marks
 *     on the feed and nothing on the record, which is the only arrangement that
 *     can tell the two apart.
 *  2. **Absence is how "none" is spelled** — a NULL from the RPC is left out of
 *     the map rather than written in as a null.
 *  3. **The clubs-only gate lives in the shell**, and gates the badge alone: a
 *     camp hands over an empty newcomers map while its notes go through
 *     untouched.
 *  4. **The note write is the shared mutation**, once, with the trimmed text —
 *     the same one the gedu page and the voice room call, which is what makes
 *     an edit here show up there.
 *  5. **The site section carries the admin-only address control**, which is the
 *     whole of what this surface adds to a section a gedu already edits.
 *
 * Every read and every mutation is stubbed at its hook: what is under test is
 * what the shell did with an answer, never how it asked.
 */

/** Real generated UUIDs: an id reaching an identicon must never be a stub. */
const IDS = {
  product: "3d0f2f1a-7a2c-4f6f-9a0a-1c9b0f0f5b21",
  group: "6a1c2b3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d",
  peerGroup: "9f8e7d6c-5b4a-4938-a271-6f5e4d3c2b1a",
  location: "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  /** Has a note and a fresh join stamp — the row wearing both marks. */
  siiri: "c4a9f0e2-8d31-4b7a-9f21-3e6d5c4b8a70",
  /** Neither mark: the ordinary row, and most of a real roster. */
  oskar: "2e7b6a54-3c1d-4f89-b0a2-7d8e9f0a1b2c",
  /** A join stamp and no note. */
  emil: "8c5d4e3f-2a1b-4c9d-8e7f-6a5b4c3d2e1f",
} as const;

const NOW = new Date("2026-03-16T12:00:00.000Z");
/** Ten days before `NOW` — comfortably inside the 30-day newcomer window. */
const JOINED_RECENTLY = "2026-03-06T12:00:00.000Z";

const STORED_NOTE =
  "Quiet in big groups — pair her rather than letting her pick a partner.";

// --------------------------------------------------------------------------
// The services, stubbed at their hooks. `vi.hoisted` because `vi.mock`
// factories are lifted above the imports and these have to exist by then.
// --------------------------------------------------------------------------
const reads = vi.hoisted(() => ({
  product: null as unknown,
  sessions: null as unknown,
  feed: null as unknown,
  snapshot: null as unknown,
}));

const setNote = vi.hoisted(() => vi.fn());

const noopMutation = vi.hoisted(() => () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("@/services/products", () => ({
  useProductAdmin: () => ({ data: reads.product, isPending: false }),
  // Read by the admin-only address control inside the site section.
  useUpdateSiteNotes: noopMutation,
}));

vi.mock("@/services/admin-sessions", () => ({
  useAdminProductSessions: () => ({ data: reads.sessions, isPending: false }),
  useAdminSetSessionNotes: noopMutation,
  useAdminRecordAttendance: noopMutation,
  useAdminEmailSessionReport: noopMutation,
  useAdminSetGroupNotes: noopMutation,
  useAdminSetSiteNotes: noopMutation,
}));

vi.mock("@/services/gedu-sessions", () => ({
  useGeduGroupFeed: () => ({ data: reads.feed, isPending: false }),
  // Read at module scope by the shared save module, so the stub has to carry
  // them even though nothing in this file sends a report.
  SESSION_REPORT_ALREADY_SENT_SQLSTATE: "P0001",
  SESSION_REPORT_NO_REPORT_SQLSTATE: "P0002",
}));

vi.mock("@/services/groups", () => ({
  useProductGroups: () => ({ data: reads.snapshot, isPending: false }),
}));

vi.mock("@/services/minecraft", () => ({
  useUpdateGroupMemberMinecraft: noopMutation,
}));

vi.mock("@/services/roblox", () => ({
  useUpdateGroupMemberRoblox: noopMutation,
  useRobloxRenders: () => ({ data: undefined }),
}));

vi.mock("@/services/member-flair", () => ({
  useSetGamerGroupNote: () => ({ mutateAsync: setNote, isPending: false }),
}));

// The calendar merge is a pure module with its own suite, and this page's
// sessions are not what is under test — an empty feed renders its empty line
// and leaves the rail, which is where the flair lives, untouched.
vi.mock("@/lib/gedu-session-feed", () => ({ buildGeduSessionFeed: () => [] }));

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

/**
 * The admin product row.
 *
 * This page reads exactly three fields off it — the id, the type the newcomer
 * gate keys on, and the topic that decides which game identity the roster draws
 * — but the row is spelled out in full rather than cast down to those three: a
 * narrowing assertion would compile against a shape the app never receives, and
 * would go on compiling if the shell started reading a fourth field that is not
 * here.
 */
function productRow(productType: ProductType): ProductAdminDetailRow {
  return {
    id: IDS.product,
    created_at: "2025-08-01T00:00:00.000Z",
    created_by: "admin-1",
    updated_at: "2025-08-01T00:00:00.000Z",
    product_type: productType,
    status: "running",
    billing_mode: "paid",
    is_visible: true,
    is_remote: false,
    location_id: IDS.location,
    // A topic that names no game platform, so the roster draws identities for
    // nobody and this file stays about the marks.
    topic: "programming",
    for_gamers: true,
    for_parents: false,
    min_age: 8,
    max_age: 12,
    tag: null,
    region_lock_country: null,
    spoken_language_code: "en",
    product_staff_details: null,
    image_id: null,
    image_path: null,
    product_images: null,
    start_date: "2025-09-01",
    end_date: null,
    signup_threshold: null,
    seat_count: 10,
    waitlist_enabled: false,
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    registration_opens_at: "2025-08-01T00:00:00.000Z",
    timezone: "Europe/Helsinki",
    product_translations: [
      {
        product_id: IDS.product,
        locale: "en",
        name: "Monday Club",
        short_description: "A great club",
        long_description: null,
        created_at: "2025-08-01T00:00:00.000Z",
        updated_at: "2025-08-01T00:00:00.000Z",
      },
    ],
    product_prices: [{ currency: "eur", price_cents: 3000 }],
    schedule_slots: [],
    locations: null,
    product_holiday_calendars: [],
  };
}

/** One feed roster row — the copy that carries the marks. */
function feedMember(
  participantId: string,
  firstName: string,
  flair: {
    group_joined_at?: string | null;
    note?: string | null;
    note_updated_by_first_name?: string | null;
  } = {},
): GeduGroupFeed["roster"][number] {
  return {
    participant_id: participantId,
    first_name: firstName,
    signed_up_at: "2025-09-01T00:00:00.000Z",
    date_of_birth: "2015-05-05",
    gender: "girl",
    minecraft_username: null,
    minecraft_uuid: null,
    roblox_username: null,
    roblox_user_id: null,
    parent_email: `${firstName.toLowerCase()}.parent@example.com`,
    participant_email: null,
    group_joined_at: flair.group_joined_at ?? null,
    note: flair.note ?? null,
    note_updated_by_first_name: flair.note_updated_by_first_name ?? null,
  };
}

/**
 * The admin session record.
 *
 * Its roster carries **no** marks and could not: the shape is an id and a first
 * name. That is what makes every assertion below a claim about the feed.
 */
function adminSessions(): AdminProductSessions {
  return {
    product: {
      id: IDS.product,
      timezone: "Europe/Helsinki",
      start_date: "2025-09-01",
      end_date: null,
      // In person, so the venue's section — and the address control on it —
      // renders.
      is_remote: false,
      schedule_slots: [],
    },
    site: {
      location_id: IDS.location,
      name: "Kallion kirjasto",
      address: "Viides linja 11, 00530 Helsinki",
      public_note: null,
      gedu_note: null,
    },
    groups: [
      {
        id: IDS.group,
        name: "Monday A",
        created_at: "2025-09-01T00:00:00.000Z",
        public_note: null,
        gedu_note: null,
        roster: [
          { participant_id: IDS.siiri, first_name: "Siiri" },
          { participant_id: IDS.oskar, first_name: "Oskar" },
          { participant_id: IDS.emil, first_name: "Emil" },
        ],
        sessions: [],
      },
      {
        id: IDS.peerGroup,
        name: "Monday B",
        created_at: "2025-09-02T00:00:00.000Z",
        public_note: null,
        gedu_note: null,
        roster: [],
        sessions: [],
      },
    ],
  };
}

function groupFeed(productType: ProductType): GeduGroupFeed {
  return {
    product: {
      id: IDS.product,
      product_type: productType,
      timezone: "Europe/Helsinki",
      start_date: "2025-09-01",
      end_date: null,
      is_remote: false,
      material_url: null,
      translations: [{ locale: "en", name: "Monday Club", description: "" }],
      schedule_slots: [],
    },
    group: {
      id: IDS.group,
      name: "Monday A",
      public_note: null,
      gedu_note: null,
    },
    site: null,
    roster: [
      feedMember(IDS.siiri, "Siiri", {
        group_joined_at: JOINED_RECENTLY,
        note: STORED_NOTE,
        note_updated_by_first_name: "Sanna",
      }),
      feedMember(IDS.oskar, "Oskar"),
      feedMember(IDS.emil, "Emil", { group_joined_at: JOINED_RECENTLY }),
    ],
    sessions: [],
  };
}

/** The groups snapshot, read for one thing only: who teaches each group. */
function groupsSnapshot(): ProductGroupsSnapshot {
  return {
    product_id: IDS.product,
    groups: [
      {
        id: IDS.group,
        name: "Monday A",
        created_at: "2025-09-01T00:00:00.000Z",
        gedus: [],
        participations: [],
      },
    ],
    unassigned: [],
    waitlist: [],
  };
}

function renderPage(productType: ProductType) {
  reads.product = productRow(productType);
  reads.sessions = adminSessions();
  reads.feed = groupFeed(productType);
  reads.snapshot = groupsSnapshot();

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <AdminGroupDetailsPage
            productType={productType === "camp" ? "camp" : "consumer_club"}
            productId={IDS.product}
            groupId={IDS.group}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** The note button on one member's row, found by its accessible name. */
function noteButton(firstName: string): HTMLElement {
  return screen.getByRole("button", { name: `Gedu note about ${firstName}` });
}

/**
 * Whether that button is **lit** — the whole of the "this member has a note"
 * marker. The button itself is on every row, because opening an empty note is
 * the add flow; what carries the mark is the icon's own colour.
 */
function isLit(button: HTMLElement): boolean {
  return button.querySelector("svg")?.classList.contains("text-info") === true;
}

/** Matches the note dialog's own title, whichever member it was opened for. */
const NOTE_DIALOG_TITLE = /^Note about /;

/**
 * The open note dialog, as its own query scope — the page around it carries
 * other editors with their own textboxes and Save buttons. The scope is taken
 * from the dialog's own title rather than from a role: the shared `Dialog`
 * portals a plain div and carries no `role="dialog"`.
 */
function noteDialog() {
  const title = screen.getByRole("heading", { name: NOTE_DIALOG_TITLE });
  const content = title.parentElement?.parentElement;
  if (content === null || content === undefined) {
    throw new Error("The note dialog's content element was not found.");
  }
  return within(content);
}

beforeEach(() => {
  setNote.mockReset();
  setNote.mockResolvedValue({
    group_id: IDS.group,
    participant_id: IDS.siiri,
    note: null,
    note_updated_by_first_name: null,
    updated_at: null,
  });
});

afterEach(cleanup);

describe("admin group details — the page an admin gets is the gedu's page", () => {
  it("renders the group's roster from the feed, with the note button on every row", () => {
    renderPage("consumer_club");

    expect(screen.getByText("Siiri")).toBeTruthy();
    expect(screen.getByText("Oskar")).toBeTruthy();
    expect(screen.getByText("Emil")).toBeTruthy();

    expect(isLit(noteButton("Siiri"))).toBe(true);
    // Present but unlit: the affordance is how the first note gets written, so
    // gating it on having one would leave no way in.
    expect(isLit(noteButton("Oskar"))).toBe(false);
    expect(isLit(noteButton("Emil"))).toBe(false);
  });

  it("heads the roster rail with the category word, not the gedu's possessive", () => {
    renderPage("consumer_club");

    // The body's default is "My Group", which is a claim only the gedu teaching
    // it can make. The card carries the group's own name either way.
    expect(screen.getByRole("heading", { name: "Group" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "My Group" })).toBeNull();
  });

  it("badges the members inside the newcomer window, and nobody else", () => {
    renderPage("consumer_club");

    // Two stamps in the fixture, one row without — so the count is the claim,
    // not merely that a badge rendered somewhere.
    expect(screen.getAllByText("New")).toHaveLength(2);
  });

  it("draws no badge on a camp, and still draws the note", () => {
    // The two marks are gated differently: the newcomers map goes over empty on
    // a non-club product while the notes go over untouched. Same roster, same
    // stamps, one product type apart.
    renderPage("camp");

    expect(screen.queryByText("New")).toBeNull();
    expect(isLit(noteButton("Siiri"))).toBe(true);
  });

  it("offers the admin-only address control inside the venue's section", () => {
    renderPage("consumer_club");

    // The address itself is read-only on both surfaces and shown by the shared
    // panel; what this page adds is the one control that may write it.
    expect(
      screen.getByText("Viides linja 11, 00530 Helsinki"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit address" }),
    ).toBeTruthy();
  });
});

describe("admin group details — writing a note", () => {
  it("opens the dialog seeded with what is stored, and names the last editor", () => {
    renderPage("consumer_club");
    fireEvent.click(noteButton("Siiri"));

    const dialog = noteDialog();
    expect(
      dialog.getByRole("heading", { name: "Note about Siiri" }),
    ).toBeTruthy();
    expect(dialog.getByRole("textbox")).toHaveProperty("value", STORED_NOTE);
    expect(dialog.getByText("Last edited by Sanna")).toBeTruthy();
  });

  it("saves through the shared mutation once, with the trimmed text", async () => {
    renderPage("consumer_club");
    fireEvent.click(noteButton("Siiri"));

    const dialog = noteDialog();
    fireEvent.change(dialog.getByRole("textbox"), {
      target: { value: "  Pair her with Emil this week.  " },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setNote).toHaveBeenCalledTimes(1));
    expect(setNote).toHaveBeenCalledWith({
      participantId: IDS.siiri,
      note: "Pair her with Emil this week.",
    });
  });

  it("keeps Save disabled from the click until the dialog closes", async () => {
    // The write is held open so the in-flight frame can be inspected at all.
    // A wiring that derived the disabled state from `isPending` would pass an
    // assertion here and still re-enable in the live app, because that flag
    // flips false a beat before the dialog closes — hence the second half,
    // which asserts the button is gone rather than merely still disabled.
    let settle = (): void => {};
    setNote.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    renderPage("consumer_club");
    fireEvent.click(noteButton("Siiri"));
    fireEvent.click(noteDialog().getByRole("button", { name: "Save" }));

    expect(noteDialog().getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    // A second press cannot get a second write out while it is disabled.
    fireEvent.click(noteDialog().getByRole("button", { name: "Save" }));
    expect(setNote).toHaveBeenCalledTimes(1);

    settle();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: NOTE_DIALOG_TITLE }),
      ).toBeNull(),
    );
  });
});

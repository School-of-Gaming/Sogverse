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
import { GeduProductPage } from "@/components/gedu/session-details/GeduProductPage";
// The real service, reached past the barrel this file mocks — the refusal test
// below drives it over a fake transport so the error the dialog meets is the one
// supabase-js actually builds.
import { MemberFlairService } from "@/services/member-flair/member-flair.service";
import type { GeduGroupFeed } from "@/services/gedu-sessions";
import type { GeduAssignedProduct, ProductType } from "@/types";
import {
  createFetchStubbedClient,
  postgrestJson,
} from "../../mocks/postgrest-fetch";

/**
 * ============================================================================
 * The staff flair reaches the roster, and the note write leaves it.
 * ============================================================================
 *
 * The marks themselves are settled and tested elsewhere: `newcomerDaysIn` and
 * `showsNewcomerBadge` are pure and exhaustively covered in
 * `member-flair-newcomer.test.ts`, and the badge and the dialog are components
 * with no wiring of their own. What no amount of that catches is the seam this
 * file is about — the **shell** turning a roster document into the one flair
 * object the page body takes:
 *
 *  1. **The maps are built from the feed's roster copy.** The shell reads two
 *     documents and substitutes the feed's roster into the assignment one, so a
 *     shell that folded flair out of the *assignment* copy would ship a page
 *     with no badge, no note and no error — the fields would be sitting on rows
 *     the shell throws away. Every fixture here therefore carries flair on the
 *     feed and null flair on the assignment document, which is the only
 *     arrangement that can tell the two apart.
 *  2. **Absence is how "none" is spelled.** A NULL from the RPC has to be left
 *     out of the map rather than written in as a null, because every consumer
 *     downstream reads a missing key as the answer.
 *  3. **The clubs-only gate lives in the shell.** A camp hands over an empty
 *     newcomers map while its notes go through untouched — the two marks are
 *     gated differently, and only a surface rendering both can show it.
 *  4. **The write is the mutation, once, with the trimmed text, and the Save
 *     button never re-enables between the click and the close.**
 *
 * The two reads and every mutation are stubbed at their hooks: what is under
 * test is what the shell did with an answer, never how it asked.
 */

/** Real generated UUIDs: an id reaching an identicon must never be a stub. */
const IDS = {
  product: "f8e7862d-d533-4eda-b94c-744c257635e5",
  group: "e25929cc-1b80-424e-bbe1-5fb484705404",
  /** Has a note and a fresh join stamp — the row wearing both marks. */
  siiri: "b178a049-5482-4f1a-a17b-444e634f2e2f",
  /** Neither mark: the ordinary row, and most of a real roster. */
  oskar: "e030b484-cbc1-4b39-ba30-0b164ecb409e",
  /** A join stamp and no note. */
  emil: "e293b898-5caa-4920-85a1-8336c282c3d7",
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
  feed: null as unknown,
}));

const setNote = vi.hoisted(() => vi.fn());

const noopMutation = vi.hoisted(() => () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("@/services/assignments", () => ({
  useGeduAssignedProduct: () => ({ data: reads.product, isPending: false }),
}));

vi.mock("@/services/gedu-sessions", () => ({
  useGeduGroupFeed: () => ({ data: reads.feed, isPending: false }),
  useSetSessionNotes: noopMutation,
  useEmailSessionReport: noopMutation,
  useRecordAttendance: noopMutation,
  useSetGroupNotes: noopMutation,
  useSetSiteNotes: noopMutation,
  // Read at module scope by the shared save module, so the stub has to carry
  // them even though nothing in this file sends a report.
  SESSION_REPORT_ALREADY_SENT_SQLSTATE: "P0001",
  SESSION_REPORT_NO_REPORT_SQLSTATE: "P0002",
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
 * One feed roster row.
 *
 * The flair defaults are the common case — no stamp, no note — so each test
 * spells out only the marks it is about.
 */
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
 * The assignment document, whose roster the shell throws away.
 *
 * Its rows carry **no** flair on purpose: every mark this file asserts on can
 * only have come from the feed, which is the claim.
 */
function assignedProduct(productType: ProductType): GeduAssignedProduct {
  return {
    product: {
      id: IDS.product,
      product_type: productType,
      topic: "programming",
      timezone: "Europe/Helsinki",
      start_date: "2025-09-01",
      end_date: null,
      // In person, so the rail draws no Join button and no room is involved.
      is_remote: false,
      translations: [{ locale: "en", name: "Monday A", description: "" }],
      schedule_slots: [],
    },
    my_group_id: IDS.group,
    groups: [
      {
        id: IDS.group,
        name: "Monday A",
        created_at: "2025-09-01T00:00:00.000Z",
        is_my_group: true,
        participant_count: 0,
        gedus: [],
        // Deliberately empty: the rail's rows come from the feed below.
        roster: [],
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
      translations: [{ locale: "en", name: "Monday A", description: "" }],
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

function renderPage(productType: ProductType) {
  reads.product = assignedProduct(productType);
  reads.feed = groupFeed(productType);

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <GeduProductPage productId={IDS.product} />
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
 * The open note dialog, as its own query scope.
 *
 * The page around it carries other editors with their own textboxes and their
 * own Save buttons — the group's standing notes most of all — so a bare
 * `screen.getByRole` would be asking the whole workspace a question about one
 * dialog.
 *
 * The scope is taken from the dialog's own title rather than from a role: the
 * shared `Dialog` portals a plain div and carries no `role="dialog"`, and the
 * title sits inside the header inside the content, which is the composition
 * every dialog in the app uses.
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

describe("gedu product page — the flair the shell builds from the feed", () => {
  it("lights the note button on the member who has one, and only them", () => {
    renderPage("consumer_club");

    expect(isLit(noteButton("Siiri"))).toBe(true);
    // Present but unlit: the affordance is how the first note gets written, so
    // gating it on having one would leave no way in.
    expect(isLit(noteButton("Oskar"))).toBe(false);
    expect(isLit(noteButton("Emil"))).toBe(false);
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
});

describe("gedu product page — writing a note", () => {
  it("opens the dialog seeded with what is stored, and names the last editor", () => {
    renderPage("consumer_club");
    fireEvent.click(noteButton("Siiri"));

    const dialog = noteDialog();
    expect(dialog.getByRole("heading", { name: "Note about Siiri" })).toBeTruthy();
    expect(dialog.getByRole("textbox")).toHaveProperty("value", STORED_NOTE);
    expect(dialog.getByText("Last edited by Sanna")).toBeTruthy();
  });

  it("saves through the mutation once, with the trimmed text", async () => {
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

    expect(
      noteDialog().getByRole("button", { name: "Save" }),
    ).toHaveProperty("disabled", true);
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

  it("shows the localized line when the database refuses the write, never its own words", async () => {
    // A real path, not a hypothetical: an admin moves a member out of the group
    // while a Gedu has this roster open, and the next save meets the write
    // RPC's target check. Postgres answers `42501` with the literal word
    // `Forbidden`, which is English, untranslated, and written for a log.
    //
    // The whole chain runs here — the real service over a fake transport, the
    // real dialog — because the mapping and the fallback live in two files and
    // only their meeting point is the claim.
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      postgrestJson(
        { message: "Forbidden", code: "42501", details: null, hint: null },
        403,
      ),
    );
    const service = new MemberFlairService(createFetchStubbedClient(fetchMock));
    setNote.mockImplementation((vars: { participantId: string; note: string }) =>
      service.setGamerGroupNote({ groupId: IDS.group, ...vars }),
    );

    renderPage("consumer_club");
    fireEvent.click(noteButton("Siiri"));
    fireEvent.click(noteDialog().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        noteDialog().getByText("An unexpected error occurred"),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Forbidden")).toBeNull();
    // The dialog stays open on a failure, with Save live again: the draft is
    // still in the box and reopening the page is the fix.
    expect(
      noteDialog().getByRole("button", { name: "Save" }),
    ).toHaveProperty("disabled", false);
  });
});

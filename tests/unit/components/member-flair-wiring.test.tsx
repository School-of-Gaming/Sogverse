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
import type {
  FutureSessionFeedEntry,
  PastSessionFeedEntry,
} from "@/components/gedu/session-feed";
import type { GeduGroupFeed } from "@/services/gedu-sessions";
import type { GeduAssignedProduct, ProductType } from "@/types";
import {
  createFetchStubbedClient,
  postgrestJson,
} from "../../mocks/postgrest-fetch";

/**
 * ============================================================================
 * The per-member overlay reaches the roster, and the two writes leave it.
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
 *     with no badge, no note, no creation and no error — the fields would be
 *     sitting on rows the shell throws away. Every fixture here therefore
 *     carries flair on the feed and null flair on the assignment document,
 *     which is the only arrangement that can tell the two apart.
 *  2. **Absence is how "none" is spelled.** A NULL from the RPC has to be left
 *     out of the map rather than written in as a null, because every consumer
 *     downstream reads a missing key as the answer. Creations arrive as `[]`
 *     rather than as a null, so the same convention has to be applied on length.
 *  3. **The clubs-only gate lives in the shell.** A camp hands over an empty
 *     newcomers map while its notes go through untouched — the two marks are
 *     gated differently, and only a surface rendering both can show it.
 *  4. **The row's marker is lit by a note OR a creation**, which is a claim
 *     about a member and not about a note, so it takes a roster where the two
 *     are on different people to make at all.
 *  5. **Each write is its own mutation, once, and only the half that changed
 *     goes out** — restamping an untouched note with whoever added a creation
 *     would put a name on the "last edited by" line that never wrote a word.
 *  6. **The owed marker is the whole chain**: the product's flag, the schedule's
 *     last occurrence, the roster's creations, and the tone on the button. It is
 *     the one part of this feature with no preview scenario, so this is where it
 *     is looked at.
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
  /**
   * A creation and nothing else — deliberately not one of the two carrying a
   * note, because the row's marker is lit by either and a roster where the same
   * people had both could never show that.
   */
  oskar: "e030b484-cbc1-4b39-ba30-0b164ecb409e",
  /** A join stamp and no note. */
  emil: "e293b898-5caa-4920-85a1-8336c282c3d7",
} as const;

const NOW = new Date("2026-03-16T12:00:00.000Z");
/** Ten days before `NOW` — comfortably inside the 30-day newcomer window. */
const JOINED_RECENTLY = "2026-03-06T12:00:00.000Z";

const STORED_NOTE =
  "Quiet in big groups — pair her rather than letting her pick a partner.";

const STORED_CREATION = {
  title: "Underwater dome",
  url: "https://www.planetminecraft.com/project/oskar-dome/",
} as const;

// --------------------------------------------------------------------------
// The services, stubbed at their hooks. `vi.hoisted` because `vi.mock`
// factories are lifted above the imports and these have to exist by then.
// --------------------------------------------------------------------------
const reads = vi.hoisted(() => ({
  product: null as unknown,
  feed: null as unknown,
}));

const setNote = vi.hoisted(() => vi.fn());
const setCreations = vi.hoisted(() => vi.fn());

const noopMutation = vi.hoisted(() => () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("@/services/assignments", () => ({
  useGeduAssignedProduct: () => ({ data: reads.product, isPending: false }),
}));

// The hooks are stubbed; everything else — the SQLSTATEs the shared save module
// reads at module scope, the photo cap and accept list the photo block reads —
// is kept real, so a constant added to the contracts cannot silently become
// `undefined` in here.
vi.mock("@/services/gedu-sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/gedu-sessions")>()),
  useGeduGroupFeed: () => ({ data: reads.feed, isPending: false }),
  useSetSessionNotes: noopMutation,
  useEmailSessionReport: noopMutation,
  useRecordAttendance: noopMutation,
  useAddSessionImage: noopMutation,
  useDeleteSessionImage: noopMutation,
  useSetGroupNotes: noopMutation,
  useSetSiteNotes: noopMutation,
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
  useSetGamerGroupCreations: () => ({
    mutateAsync: setCreations,
    isPending: false,
  }),
}));

// The calendar merge is a pure module with its own suite, and this page's
// sessions are not what is under test — an empty feed renders its empty line
// and leaves the rail, which is where the flair lives, untouched. The owed
// block below is the exception and supplies its own entries, because the marker
// it is about is gated on one of them.
const feedEntries = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/lib/gedu-session-feed", () => ({
  buildGeduSessionFeed: () => feedEntries.value,
}));

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
    creations?: GeduGroupFeed["roster"][number]["creations"];
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
    // `[]` is what the RPC emits for a member with none — a list has a real
    // empty value where a note has a null — so this default says the same
    // thing the wire does.
    creations: flair.creations ?? [],
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
      requires_gamer_creations: false,
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
      requires_gamer_creations: false,
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
      feedMember(IDS.oskar, "Oskar", { creations: [STORED_CREATION] }),
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

/** The per-gamer dialog's button on one member's row, by its accessible name. */
function flairButton(firstName: string): HTMLElement {
  return screen.getByRole("button", {
    name: `Note and creation about ${firstName}`,
  });
}

/**
 * The same button when it is **owed a creation** — a different accessible name,
 * which is the point: the tone is never the whole signal.
 */
function owedButton(firstName: string): HTMLElement | null {
  return screen.queryByRole("button", {
    name: `Note and creation about ${firstName} — a creation is still needed`,
  });
}

/**
 * Whether that button is **lit** — the whole of the "something is recorded about
 * this member" marker. The button itself is on every row, because opening an
 * empty dialog is the add flow; what carries the mark is the icon's own colour.
 */
function isLit(button: HTMLElement): boolean {
  return button.querySelector("svg")?.classList.contains("text-info") === true;
}

/** Whether it is wearing the owed tone, which outranks lit. */
function isOwedTone(button: HTMLElement): boolean {
  return (
    button.querySelector("svg")?.classList.contains("text-warning") === true
  );
}

/**
 * Matches the dialog's own title, whichever member it was opened for.
 *
 * Anchored on this roster's three names rather than on the word: the standing
 * notes panel a card away is headed "About this group", and a looser pattern
 * would ask that panel the question this file means to ask the dialog.
 */
const FLAIR_DIALOG_TITLE = /^About (Siiri|Oskar|Emil)$/;

/**
 * The open per-gamer dialog, as its own query scope.
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
function flairDialog() {
  const title = screen.getByRole("heading", { name: FLAIR_DIALOG_TITLE });
  const content = title.parentElement?.parentElement;
  if (content === null || content === undefined) {
    throw new Error("The per-gamer dialog's content element was not found.");
  }
  return within(content);
}

/** The note's textarea, named apart from the creation rows' inputs. */
function noteBox() {
  return flairDialog().getByRole("textbox", { name: "Private note" });
}

beforeEach(() => {
  feedEntries.value = [];
  setNote.mockReset();
  setNote.mockResolvedValue({
    group_id: IDS.group,
    participant_id: IDS.siiri,
    note: null,
    note_updated_by_first_name: null,
    updated_at: null,
  });
  setCreations.mockReset();
  setCreations.mockResolvedValue({
    group_id: IDS.group,
    participant_id: IDS.oskar,
    creations: [],
    updated_at: null,
  });
});

afterEach(cleanup);

describe("gedu product page — the overlay the shell builds from the feed", () => {
  it("lights the marker on a note, on a creation, and on nothing else", () => {
    renderPage("consumer_club");

    // Three rows, three answers, and the middle one is the claim: the marker
    // says something is recorded, not that a note is.
    expect(isLit(flairButton("Siiri"))).toBe(true);
    expect(isLit(flairButton("Oskar"))).toBe(true);
    // Present but unlit: the affordance is how the first note or creation gets
    // written, so gating it on having one would leave no way in.
    expect(isLit(flairButton("Emil"))).toBe(false);
  });

  it("badges the members inside the newcomer window, and nobody else", () => {
    renderPage("consumer_club");

    // Two stamps in the fixture, one row without — so the count is the claim,
    // not merely that a badge rendered somewhere.
    expect(screen.getAllByText("New")).toHaveLength(2);
  });

  it("draws no badge on a camp, and still draws both markers", () => {
    // The marks are gated differently: the newcomers map goes over empty on a
    // non-club product while the notes and the creations go over untouched.
    // Same roster, same stamps, one product type apart.
    renderPage("camp");

    expect(screen.queryByText("New")).toBeNull();
    expect(isLit(flairButton("Siiri"))).toBe(true);
    expect(isLit(flairButton("Oskar"))).toBe(true);
  });
});

describe("gedu product page — writing a note", () => {
  it("opens the dialog seeded with what is stored, and names the last editor", () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Siiri"));

    const dialog = flairDialog();
    expect(dialog.getByRole("heading", { name: "About Siiri" })).toBeTruthy();
    expect(noteBox()).toHaveProperty("value", STORED_NOTE);
    expect(dialog.getByText("Last edited by Sanna")).toBeTruthy();
    // The two audiences are stated in words, not left to the border styles.
    expect(dialog.getByText("Gedus and admins")).toBeTruthy();
    expect(dialog.getByText("Families see this")).toBeTruthy();
  });

  it("saves through the mutation once, with the trimmed text", async () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Siiri"));

    const dialog = flairDialog();
    fireEvent.change(noteBox(), {
      target: { value: "  Pair her with Emil this week.  " },
    });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setNote).toHaveBeenCalledTimes(1));
    expect(setNote).toHaveBeenCalledWith({
      participantId: IDS.siiri,
      note: "Pair her with Emil this week.",
    });
    // The other half was not touched, so it is not written. Re-sending it would
    // restamp the creations row with an editor who added nothing.
    expect(setCreations).not.toHaveBeenCalled();
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
    fireEvent.click(flairButton("Siiri"));
    // A change first: Save commits only the halves that differ from what is
    // stored, so an untouched dialog has nothing to hold the button through.
    fireEvent.change(noteBox(), { target: { value: "Rewritten." } });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    expect(
      flairDialog().getByRole("button", { name: "Save" }),
    ).toHaveProperty("disabled", true);
    // A second press cannot get a second write out while it is disabled.
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));
    expect(setNote).toHaveBeenCalledTimes(1);

    settle();
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: FLAIR_DIALOG_TITLE }),
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
    fireEvent.click(flairButton("Siiri"));
    fireEvent.change(noteBox(), { target: { value: "Rewritten." } });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        flairDialog().getByText("An unexpected error occurred"),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Forbidden")).toBeNull();
    // The dialog stays open on a failure, with Save live again: the draft is
    // still in the box and reopening the page is the fix.
    expect(
      flairDialog().getByRole("button", { name: "Save" }),
    ).toHaveProperty("disabled", false);
  });
});

/** The creation editor's two fields, which are one pair and not a list. */
function creationTitleBox() {
  return flairDialog().getByRole("textbox", { name: "Creation title" });
}

function creationUrlBox() {
  return flairDialog().getByRole("textbox", { name: "Creation link" });
}

describe("gedu product page — writing the creation", () => {
  it("opens seeded with what is stored", () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    expect(creationTitleBox()).toHaveProperty("value", STORED_CREATION.title);
    expect(creationUrlBox()).toHaveProperty("value", STORED_CREATION.url);
  });

  it("offers one pair of fields and no way to add a second", () => {
    // The wire shape is a list and the editor deliberately is not: essentially
    // every member has zero or one, and a list editor priced in add and remove
    // controls, per-row numbering and a cap message for an entry nobody writes.
    // Asserted rather than assumed, because "the editor authors one" is what
    // every fixture and every piece of copy around it now says.
    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    const dialog = flairDialog();
    expect(dialog.getAllByRole("textbox")).toHaveLength(3);
    expect(dialog.queryByRole("button", { name: /creation/i })).toBeNull();
  });

  it("writes the creation through its own mutation, trimmed", async () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Emil"));

    fireEvent.change(creationTitleBox(), {
      target: { value: "  Clock tower  " },
    });
    fireEvent.change(creationUrlBox(), {
      target: { value: " https://example.com/tower " },
    });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setCreations).toHaveBeenCalledTimes(1));
    // Replace-the-list, with a list of one: the RPC's shape is unchanged and
    // only what the editor can put in it is.
    expect(setCreations).toHaveBeenCalledWith({
      participantId: IDS.emil,
      creations: [{ title: "Clock tower", url: "https://example.com/tower" }],
    });
    // The note beside it was untouched, so no second write goes out.
    expect(setNote).not.toHaveBeenCalled();
  });

  it("writes nothing when both fields are left blank", async () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Emil"));
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    // A Gedu who opened the dialog and changed their mind has asked for
    // nothing — the same rule a trimmed-empty note follows, and the reason the
    // database's CHECK never sees a blank element.
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: FLAIR_DIALOG_TITLE }),
      ).toBeNull(),
    );
    expect(setCreations).not.toHaveBeenCalled();
  });

  it("refuses one field without the other and says why, without writing", () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Emil"));

    fireEvent.change(creationTitleBox(), {
      target: { value: "A tower with no link" },
    });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    // The schema's CHECK stays a loud backstop rather than a routine error
    // path: the refusal happens in the browser, and the dialog stays open on
    // the fields that caused it.
    expect(
      flairDialog().getByText("A creation needs both a title and a link."),
    ).toBeTruthy();
    expect(setCreations).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: FLAIR_DIALOG_TITLE }),
    ).toBeTruthy();
    // A validation answer is not an action in flight, so the button never
    // greys for it.
    expect(
      flairDialog().getByRole("button", { name: "Save" }),
    ).toHaveProperty("disabled", false);
  });

  it("emptying both fields is a real write, and puts the marker out", async () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    fireEvent.change(creationTitleBox(), { target: { value: "" } });
    fireEvent.change(creationUrlBox(), { target: { value: "" } });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    // An empty list deletes the row, which is how "no creations" is spelled
    // everywhere — it is not a no-op, exactly as clearing a note is not.
    await waitFor(() => expect(setCreations).toHaveBeenCalledTimes(1));
    expect(setCreations).toHaveBeenCalledWith({
      participantId: IDS.oskar,
      creations: [],
    });
  });

  it("writes both halves when both changed, and each one once", async () => {
    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    fireEvent.change(noteBox(), { target: { value: "Needs stretching." } });
    fireEvent.change(creationTitleBox(), {
      target: { value: "Underwater dome, finished" },
    });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setCreations).toHaveBeenCalledTimes(1));
    expect(setNote).toHaveBeenCalledTimes(1);
    expect(setNote).toHaveBeenCalledWith({
      participantId: IDS.oskar,
      note: "Needs stretching.",
    });
    expect(setCreations).toHaveBeenCalledWith({
      participantId: IDS.oskar,
      creations: [
        { title: "Underwater dome, finished", url: STORED_CREATION.url },
      ],
    });
  });

  it("writes nothing at all when a dialog is opened and saved untouched", async () => {
    // Both rows carry their own `updated_by`/`updated_at`, so a save that
    // re-sent an unedited half would put a name on a "last edited by" line
    // that never wrote a word. Nothing changed, so nothing is sent.
    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: FLAIR_DIALOG_TITLE }),
      ).toBeNull(),
    );
    expect(setNote).not.toHaveBeenCalled();
    expect(setCreations).not.toHaveBeenCalled();
  });

  it("retries only the half that did not land", async () => {
    // A save can half-land, and the only honest thing to leave behind is what
    // still needs doing. Both writes are idempotent replaces, so a retry that
    // re-sent the landed half would be harmless — but it would also restamp a
    // row nobody edited, which is the reason the dialog remembers instead.
    setCreations.mockRejectedValueOnce(new Error(""));

    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    fireEvent.change(noteBox(), { target: { value: "Needs stretching." } });
    fireEvent.change(creationTitleBox(), {
      target: { value: "Underwater dome, finished" },
    });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        flairDialog().getByText("An unexpected error occurred"),
      ).toBeTruthy(),
    );
    expect(setNote).toHaveBeenCalledTimes(1);

    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setCreations).toHaveBeenCalledTimes(2));
    // The note landed the first time and is not sent again.
    expect(setNote).toHaveBeenCalledTimes(1);
  });

  it("sends an edit to the half that already landed, rather than dropping it", async () => {
    // The regression this pins: remembering *that* a half landed, rather than
    // *what* landed, goes on suppressing that half after the Gedu edits it
    // again — so a note corrected after a partial failure is silently
    // discarded, the dialog closes, and nothing errors. Comparing against the
    // value that actually landed cannot make that mistake.
    setCreations.mockRejectedValueOnce(new Error(""));

    renderPage("consumer_club");
    fireEvent.click(flairButton("Oskar"));

    fireEvent.change(noteBox(), { target: { value: "First attempt." } });
    fireEvent.change(creationTitleBox(), {
      target: { value: "Underwater dome, finished" },
    });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        flairDialog().getByText("An unexpected error occurred"),
      ).toBeTruthy(),
    );
    expect(setNote).toHaveBeenCalledTimes(1);

    // The note landed; now it is rewritten, and the second Save has to carry
    // the correction.
    fireEvent.change(noteBox(), { target: { value: "Corrected after all." } });
    fireEvent.click(flairDialog().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setNote).toHaveBeenCalledTimes(2));
    expect(setNote).toHaveBeenLastCalledWith({
      participantId: IDS.oskar,
      note: "Corrected after all.",
    });
    // And the half that never landed still goes out on the retry.
    expect(setCreations).toHaveBeenCalledTimes(2);
  });
});

/**
 * ============================================================================
 * The owed marker, end to end through the shell.
 * ============================================================================
 *
 * The preview scene has a scenario of its own for this — a flagged product whose
 * run is over — and that is where the signal is *looked at*. What is asserted
 * here is the chain behind it, which a screenshot cannot show: the product's
 * flag, the schedule's last occurrence, the roster's creations, and the tone and
 * the name the button ends up wearing, including the two gates that must produce
 * nothing at all.
 *
 * The run below ends on Monday 2026-03-09, a week before this file's `NOW`, on
 * a Monday schedule — so the final session is 2026-03-09 and the feed entry the
 * derivation looks for is `${group}:2026-03-09`.
 */
const RUN_END_DATE = "2026-03-09";

const MONDAY_SLOTS = [
  { weekday: 0, start_time: "16:30", duration_minutes: 90 },
];

/** The final session, finished on the other three counts and owing only this. */
function finalSessionEntry(): PastSessionFeedEntry {
  return {
    kind: "past",
    id: `${IDS.group}:${RUN_END_DATE}`,
    startsAt: new Date("2026-03-09T14:30:00.000Z"),
    endsAt: new Date("2026-03-09T16:00:00.000Z"),
    report: "# The last session",
    staffNote: null,
    attendance: {
      [IDS.siiri]: "present",
      [IDS.oskar]: "present",
      [IDS.emil]: "present",
    },
    images: [],
    owed: true,
    reportEmailedAt: new Date("2026-03-09T19:00:00.000Z"),
    lastEditedBy: null,
  };
}

/**
 * The same page with an ended run behind it, and the three knobs the marker
 * turns on: whether the product is flagged, whether the run has a last day, and
 * what the schedule projects.
 */
function renderEndedRun(
  overrides: Partial<GeduAssignedProduct["product"]>,
  /**
   * Earlier sessions of the same run, for the one claim that needs more than
   * one card on the page: only the *final* session carries the creations block.
   */
  earlierSessions: readonly PastSessionFeedEntry[] = [],
): ReturnType<typeof render> {
  const product = assignedProduct("consumer_club");
  reads.product = {
    ...product,
    product: {
      ...product.product,
      start_date: "2026-01-05",
      end_date: RUN_END_DATE,
      schedule_slots: MONDAY_SLOTS,
      ...overrides,
    },
  };
  reads.feed = groupFeed("consumer_club");
  feedEntries.value = [finalSessionEntry(), ...earlierSessions];

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

/** The owed button for one member, asserted to be there. */
function owedFor(firstName: string): HTMLElement {
  const button = owedButton(firstName);
  if (button === null) {
    throw new Error(`No owed marker on ${firstName}'s row.`);
  }
  return button;
}

describe("gedu product page — the owed-creation marker", () => {
  it("marks every member with none, and leaves the one who has a creation alone", () => {
    renderEndedRun({ requires_gamer_creations: true });

    // The itemization the session card cannot do: two rows waiting, one done.
    expect(isOwedTone(owedFor("Siiri"))).toBe(true);
    expect(isOwedTone(owedFor("Emil"))).toBe(true);
    expect(owedButton("Oskar")).toBeNull();
    expect(isLit(flairButton("Oskar"))).toBe(true);
  });

  it("outranks the lit tone on a member who has a note but no creation", () => {
    renderEndedRun({ requires_gamer_creations: true });

    // Siiri has a note, so the row would otherwise be lit. Owed is the only one
    // of the three states that is *work*, so it wins — and it renames the
    // control, which is what keeps the signal off colour alone.
    expect(isOwedTone(owedFor("Siiri"))).toBe(true);
    expect(isLit(owedFor("Siiri"))).toBe(false);
  });

  it("routes to the same dialog every other row's button opens", () => {
    renderEndedRun({ requires_gamer_creations: true });
    fireEvent.click(owedFor("Siiri"));

    // The one-authoring-surface rule, as a click: the marker is the control
    // that already opens this member's dialog, so there is nowhere else it
    // could take anybody.
    expect(
      flairDialog().getByRole("heading", { name: "About Siiri" }),
    ).toBeTruthy();
  });

  it("marks nobody on the same run with the flag off", () => {
    // The flag is the whole gate: same run, same roster, same finished final
    // session, and not a single marker.
    renderEndedRun({ requires_gamer_creations: false });

    expect(owedButton("Siiri")).toBeNull();
    expect(owedButton("Emil")).toBeNull();
  });

  it("marks nobody on an open-ended flagged run, which has no final session", () => {
    // Documented behaviour rather than an error, and the reason it needs saying
    // out loud: a consumer club can be flagged and simply never owes.
    renderEndedRun({ requires_gamer_creations: true, end_date: null });

    expect(owedButton("Siiri")).toBeNull();
  });
});

/**
 * ============================================================================
 * The creations block on the final session's own card.
 * ============================================================================
 *
 * The roster's marker answers *who*; this answers it in the one place a gedu
 * who opened the session to fix what it is flagged for is actually looking.
 * That was the whole of the owner's complaint: the last card of a flagged run
 * went amber for a reason the card itself could not state, and the editor
 * underneath it showed a full register and a written report with nothing left
 * to do.
 *
 * Four things are asserted here and each is a way the block could be built and
 * still be useless. It has to be on the **final** session and no other; it has
 * to render **before** that session ends, quietly, which is the half that makes
 * the work findable in time; it has to take the warning tone at the moment the
 * card's own header does; and every name on it has to reach the same dialog the
 * roster's button opens, because a signal that cannot be acted on is the thing
 * being fixed.
 */

/** The Monday after this file's `NOW` — a final session still ahead of us. */
const UPCOMING_END_DATE = "2026-03-23";

/** That session, with nothing recorded on it: the run has not got there yet. */
function upcomingFinalSessionEntry(): FutureSessionFeedEntry {
  return {
    kind: "future",
    id: `${IDS.group}:${UPCOMING_END_DATE}`,
    startsAt: new Date("2026-03-23T14:30:00.000Z"),
    endsAt: new Date("2026-03-23T16:00:00.000Z"),
    report: null,
    staffNote: null,
    attendance: {},
    images: [],
    lastEditedBy: null,
  };
}

/** The same page with a flagged run whose last session has not happened yet. */
function renderUpcomingRun(): ReturnType<typeof render> {
  const product = assignedProduct("consumer_club");
  reads.product = {
    ...product,
    product: {
      ...product.product,
      start_date: "2026-01-05",
      end_date: UPCOMING_END_DATE,
      schedule_slots: MONDAY_SLOTS,
      requires_gamer_creations: true,
    },
  };
  reads.feed = groupFeed("consumer_club");
  feedEntries.value = [upcomingFinalSessionEntry()];

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

/**
 * The block's chips for one member.
 *
 * There are two of every chip and that is by construction rather than a bug:
 * the collapsed card and the card's editor are sibling regions that both draw
 * the block, exactly as they both draw the register, and only one of them is
 * ever on screen.
 */
function creationChips(firstName: string, missing: boolean): HTMLElement[] {
  return screen.queryAllByRole("button", {
    name: missing
      ? `${firstName} — creation still needed`
      : `${firstName} — creation added`,
  });
}

/** Whether a chip is wearing the owed tone rather than the informational one. */
function isWarningToned(chip: HTMLElement): boolean {
  return chip.className.includes("text-warning");
}

describe("gedu product page — the final session's creations block", () => {
  it("names who is missing, and marks the one who is done as done", () => {
    renderEndedRun({ requires_gamer_creations: true });

    // The itemization, on the card rather than only in the rail: two waiting,
    // one already in, and a count that says so without needing the colour.
    expect(creationChips("Siiri", true).length).toBeGreaterThan(0);
    expect(creationChips("Emil", true).length).toBeGreaterThan(0);
    expect(creationChips("Oskar", false).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 of 3 added").length).toBeGreaterThan(0);
  });

  it("takes the warning tone once the session has ended owing something", () => {
    renderEndedRun({ requires_gamer_creations: true });

    for (const chip of creationChips("Siiri", true)) {
      expect(isWarningToned(chip)).toBe(true);
    }
  });

  it("renders before the run ends, and stays quiet there", () => {
    // The answer to "it only turns yellow after the final session ends": the
    // block is on that card from the day the session is scheduled, so the work
    // is findable while there is still time to do it. Nothing is owed yet, so
    // nothing is amber.
    renderUpcomingRun();

    const chips = creationChips("Siiri", true);
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(isWarningToned(chip)).toBe(false);
    // Oskar's creation is already in — the same roster the owed case reads —
    // so the count is the same on both sides of the session's end. What
    // changes is only whether it is anybody's problem yet.
    expect(screen.getAllByText("1 of 3 added").length).toBeGreaterThan(0);
  });

  it("opens the same dialog the roster's button opens", () => {
    renderEndedRun({ requires_gamer_creations: true });
    fireEvent.click(creationChips("Siiri", true)[0]);

    // One authoring surface: the block is a route into the per-gamer dialog,
    // never a second editor beside it.
    expect(
      flairDialog().getByRole("heading", { name: "About Siiri" }),
    ).toBeTruthy();
  });

  it("is absent on the same finished run with the flag off", () => {
    renderEndedRun({ requires_gamer_creations: false });

    expect(creationChips("Siiri", true)).toHaveLength(0);
    expect(creationChips("Oskar", false)).toHaveLength(0);
  });

  it("is absent on a flagged run with no final session to hang it on", () => {
    // An open-ended product can be flagged and simply never owes, so there is
    // no session for the block to be about either.
    renderEndedRun({ requires_gamer_creations: true, end_date: null });

    expect(creationChips("Siiri", true)).toHaveLength(0);
  });

  it("stays on the final session when the run has other sessions too", () => {
    // Exactly one card of a run may carry it, however many cards there are —
    // otherwise a fifty-week club would repeat the same obligation fifty times.
    const earlier: PastSessionFeedEntry = {
      ...finalSessionEntry(),
      id: `${IDS.group}:2026-03-02`,
      startsAt: new Date("2026-03-02T14:30:00.000Z"),
      endsAt: new Date("2026-03-02T16:00:00.000Z"),
    };
    renderEndedRun({ requires_gamer_creations: true }, [earlier]);

    // One card, drawing the block in both of its two regions.
    expect(screen.getAllByText("1 of 3 added")).toHaveLength(2);
  });
});

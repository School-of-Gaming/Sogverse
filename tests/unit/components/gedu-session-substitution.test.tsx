import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { alertVariants } from "@/components/ui/alert";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import type {
  FutureSessionFeedEntry,
  PastSessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";
import {
  deriveSessionStaffing,
  NO_SESSION_STAFFING,
  type SubstitutionRequestInput,
  type StaffingAssignment,
} from "@/lib/session-staffing";

// Nothing here opens an editor or types into a note, so the markdown editor is
// opaque — and it is by a wide margin the heaviest thing a feed suite loads.
vi.mock("@/components/ui/rich-text-editor", () =>
  import("../../mocks/rich-text-editor"),
);

/**
 * ============================================================================
 * Who is running this session, on the card that says so
 * ============================================================================
 *
 * What a card says about its staffing is a three-way switch, and every arm of
 * it is a different page for the same gedu:
 *
 *   - **expected** → the `⋯` menu in the header holding "I can't make this
 *     session", and no status anywhere on the card. Filing is rare, so it is
 *     deliberately one press out of sight;
 *   - **holding their own request** → the loud status block with the Withdraw
 *     inside it, and *no* menu, because somebody who has filed an absence is no
 *     longer expected and must not be able to file a second one;
 *   - **neither** → nothing at all, which is the state a colleague's session
 *     card is in and the one an over-eager renderer gets wrong.
 *
 * The other half is the **staffing line**, which renders only on a date
 * carrying a request. A fifty-week feed that printed its staffing on every card
 * would repeat what the rail already says fifty times and bury the handful of
 * dates where something is outstanding — so its absence on an ordinary card is
 * as much the behaviour as its presence on a substituted one.
 *
 * Everything is driven through the real feed rather than the region alone: what
 * decides whether the action is offered is the entry's *kind*, and only the feed
 * and the card together produce one.
 */

/** Real generated UUIDs — an id that reaches an identicon is never a stub. */
const SANNA = "4a84d001-b789-41f5-ace3-cfcffa139869";
const PETRA = "96e29545-ad63-4948-b783-14e91189ad75";
const JOONAS = "d2826073-1d3f-4023-b45e-f42fea4332ca";

const GEDUS: readonly StaffingAssignment[] = [
  { id: SANNA, firstName: "Sanna", role: "primary" },
  { id: PETRA, firstName: "Petra", role: "assistant" },
];

const FOUNDED = new Date("2020-01-01T00:00:00.000Z");
const ROSTER: readonly SessionFeedGamer[] = [
  {
    id: "d9d0f5a8-6f97-4b0a-9a51-01d5a25a0f1e",
    firstName: "Aino",
    inGroupSince: FOUNDED,
  },
];

const NOW = new Date("2026-03-16T09:00:00.000Z");
/** A session still ahead of `NOW`, so the card's kind is `future`. */
const FUTURE_DATE = "2026-03-16";
const FUTURE_START = new Date("2026-03-16T14:30:00.000Z");
const FUTURE_END = new Date("2026-03-16T16:00:00.000Z");
/** A session that finished a week earlier — a `past` card, which never offers. */
const PAST_DATE = "2026-03-09";
const PAST_START = new Date("2026-03-09T14:30:00.000Z");
const PAST_END = new Date("2026-03-09T16:00:00.000Z");

function futureEntry(
  requests: readonly SubstitutionRequestInput[],
  viewerId: string,
  gedus: readonly StaffingAssignment[] = GEDUS,
) {
  return {
    kind: "future",
    id: `group-1:${FUTURE_DATE}`,
    startsAt: FUTURE_START,
    endsAt: FUTURE_END,
    staffing: deriveSessionStaffing({
      gedus,
      requests,
      sessionDate: FUTURE_DATE,
      viewerId,
    }),
    report: null,
    staffNote: null,
    attendance: {},
    images: [],
    lastEditedBy: null,
  } satisfies FutureSessionFeedEntry;
}

function pastEntry(requests: readonly SubstitutionRequestInput[], viewerId: string) {
  return {
    kind: "past",
    id: `group-1:${PAST_DATE}`,
    startsAt: PAST_START,
    endsAt: PAST_END,
    staffing: deriveSessionStaffing({
      gedus: GEDUS,
      requests,
      sessionDate: PAST_DATE,
      viewerId,
    }),
    report: null,
    staffNote: null,
    attendance: {},
    images: [],
    owed: true,
    reportEmailedAt: null,
    lastEditedBy: null,
  } satisfies PastSessionFeedEntry;
}

/** An open request somebody filed on the future session. */
function openRequest(by: { id: string; firstName: string }): SubstitutionRequestInput {
  return {
    id: `request-${by.id}`,
    sessionDate: FUTURE_DATE,
    requestedBy: by,
    role: "primary",
    status: "open",
    substituteId: null,
    offerCount: null,
  };
}

function renderFeed({
  entries,
  withCallbacks = true,
  renderSessionMenu,
  onRequestSubstitution = () => {},
}: {
  entries: readonly (FutureSessionFeedEntry | PastSessionFeedEntry)[];
  /** Whether this surface supplies the gedu's two substitution callbacks. */
  withCallbacks?: boolean;
  renderSessionMenu?: () => React.ReactNode;
  /** The filing write, so a case can refuse it the way the database does. */
  onRequestSubstitution?: () => void | Promise<void>;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={entries}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={null}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            onSendReport={() => Promise.resolve({ sent: 0, failed: 0, skipped: 0 })}
            onAddPhoto={() => Promise.resolve("")}
            onRemovePhoto={() => Promise.resolve()}
            onRequestSubstitution={withCallbacks ? onRequestSubstitution : undefined}
            onWithdrawSubstitutionRequest={withCallbacks ? () => {} : undefined}
            renderSessionMenu={renderSessionMenu}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

const copy = messages.gedu.sessionFeed;

/** The middle dot the run separates people with, and the space that binds it. */
const DOT = "\u00b7";
const SEPARATOR = `\u00a0${DOT}`;

/** The staffing line itself — a run of nodes rather than one string. */
function expectedLine(): HTMLParagraphElement {
  const line = [...document.querySelectorAll("p")].find((p) =>
    p.textContent.startsWith(copy.staffingExpectedLabel),
  );
  if (line === undefined) throw new Error("no staffing line on this card");
  return line;
}

/** The same line's text, with its whitespace normalised. */
function expectedLineText(): string {
  return expectedLine().textContent.replace(/\s+/g, " ").trim();
}

/** The one-person-and-their-role units the run is built from. */
function nameUnits(): HTMLElement[] {
  return [...expectedLine().querySelectorAll<HTMLElement>(".whitespace-nowrap")];
}

/** The `⋯` button in the card header — the only way to reach the filing form. */
function menuTrigger() {
  return screen.queryByRole("button", { name: copy.substitutionMenuLabel });
}

/** The one row inside it, which exists only while the menu is open. */
function menuItem() {
  return screen.queryByRole("menuitem", {
    name: copy.substitutionRequestAction,
  });
}

/** Open the overflow menu and hand back its one row. */
function openMenu(): HTMLElement {
  const trigger = menuTrigger();
  if (trigger === null) throw new Error("no overflow menu on this card");
  fireEvent.click(trigger);
  const item = menuItem();
  if (item === null) throw new Error("the menu opened with no action in it");
  return item;
}

/** Open the menu and choose the action, which is what opens the form. */
function openRequestDialog() {
  fireEvent.click(openMenu());
}

/**
 * Answer the dialog's one required question.
 *
 * Nothing is selected when the form opens — a pre-selected "Sick" would record
 * health data about a gedu that nobody stated — so the confirm stays disabled
 * until this runs.
 */
function chooseReason() {
  fireEvent.click(
    screen.getByRole("radio", { name: copy.substitutionReasonSick }),
  );
}

function withdrawButton() {
  return screen.queryByRole("button", { name: copy.substitutionWithdrawAction });
}

describe("the session card's staffing region", () => {
  it("offers the action from the overflow menu, and nowhere else", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    // **Nothing about filing is on the card until the menu is opened.** The
    // full-width button this replaced spent a band of every future card on the
    // rarest thing a gedu ever does with one.
    expect(
      screen.queryByRole("button", { name: copy.substitutionRequestAction }),
    ).toBeNull();
    expect(menuItem()).toBeNull();
    expect(menuTrigger()).not.toBeNull();
    expect(openMenu()).not.toBeNull();
    expect(withdrawButton()).toBeNull();
  });

  it("swaps the menu for a status block once that gedu has filed", () => {
    renderFeed({
      entries: [
        futureEntry(
          [{ ...openRequest({ id: SANNA, firstName: "Sanna" }), offerCount: 2 }],
          SANNA,
        ),
      ],
    });
    // The two can never be up together: a gedu who has filed is no longer
    // expected, which is the derivation's own sentence rather than a branch
    // this card makes.
    expect(menuTrigger()).toBeNull();
    const block = screen.getByRole("status");
    expect(block.textContent).toContain(copy.substitutionRequestStatusOpen);
    expect(withdrawButton()).not.toBeNull();
    // The withdraw lives inside the block, so the thing that takes the request
    // back is in the same panel that says there is one.
    expect(block.contains(withdrawButton())).toBe(true);
    expect(screen.getByText("2 offers waiting")).toBeTruthy();
  });

  it("shows no count where the reader is not told one", () => {
    renderFeed({
      entries: [futureEntry([openRequest({ id: SANNA, firstName: "Sanna" })], SANNA)],
    });
    // `null` is "not disclosed", which is a different fact from zero — so the
    // block says the request is open and invents no number for it.
    expect(screen.getByText(copy.substitutionRequestStatusOpen)).toBeTruthy();
    expect(screen.queryByText(/offers waiting/)).toBeNull();
  });

  it("states the viewer's own substituted request loudly, and offers no menu", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            {
              ...openRequest({ id: SANNA, firstName: "Sanna" }),
              status: "substituted",
              substituteId: { id: JOONAS, firstName: "Joonas" },
            },
          ],
          SANNA,
        ),
      ],
    });
    const block = screen.getByRole("status");
    expect(block.textContent).toContain("Joonas is substituting for you.");
    // Settled, so there is nothing to take back and nothing to file.
    expect(withdrawButton()).toBeNull();
    expect(menuTrigger()).toBeNull();
  });

  it("names the sub on a substituted request, for everybody", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            {
              ...openRequest({ id: PETRA, firstName: "Petra" }),
              status: "substituted",
              substituteId: { id: JOONAS, firstName: "Joonas" },
            },
          ],
          SANNA,
        ),
      ],
    });
    expect(screen.getByText("Joonas is substituting for Petra.")).toBeTruthy();
  });

  it("offers nothing to a viewer who is neither expected nor a requester", () => {
    // A signed-in gedu looking at a group they do not teach — the admin shell
    // and the preview scenes reach the same state with no viewer at all.
    renderFeed({ entries: [futureEntry([], "somebody-else")] });
    expect(menuTrigger()).toBeNull();
    expect(withdrawButton()).toBeNull();
  });

  it("offers nothing on a session that has already finished", () => {
    // The action is for a session dated today or later, and a `past` entry is
    // by construction neither.
    renderFeed({ entries: [pastEntry([], SANNA)] });
    expect(menuTrigger()).toBeNull();
  });

  it("withholds the action from a surface that supplies no callback", () => {
    // The gate is what the surface hands over, not who is looking: the admin
    // shell supplies the staffing editor in this slot instead.
    renderFeed({ entries: [futureEntry([], SANNA)], withCallbacks: false });
    expect(menuTrigger()).toBeNull();
  });
});

/**
 * ============================================================================
 * The overflow menu
 * ============================================================================
 *
 * There is no dropdown primitive in the kit, so this menu keeps the account
 * menu's promises by hand — and a hand-kept promise is one a refactor can drop
 * silently. What is pinned here is what `role="menu"` owes a keyboard: a way
 * in, a way out that hands focus back, and a dismissal that does not need one.
 */
describe("the card's overflow menu", () => {
  it("is a native button, which is what makes Enter and Space open it", () => {
    // Activation by Enter and Space is the browser's, not this component's:
    // a `<button type="button">` gets it for free and a `div` with a click
    // handler does not. jsdom dispatches no synthetic activation, so the
    // element's own type is the honest thing to assert.
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const trigger = menuTrigger();
    expect(trigger?.tagName).toBe("BUTTON");
    expect(trigger?.getAttribute("type")).toBe("button");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });

  it("is a 44px hit box around a small glyph", () => {
    // The thumb target, asserted on the classes because jsdom measures
    // nothing. `h-11 w-11` is 2.75rem — 44 CSS px — and the glyph inside stays
    // 16px: what grows is the area a finger can miss by, never the mark.
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const worn = new Set(menuTrigger()!.className.split(/\s+/));
    expect(worn.has("h-11")).toBe(true);
    expect(worn.has("w-11")).toBe(true);
    const glyph = menuTrigger()!.querySelector("svg");
    expect(glyph?.getAttribute("class")).toContain("h-4");
  });

  it("opens on ArrowDown with focus on the action", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const trigger = menuTrigger();
    fireEvent.keyDown(trigger!, { key: "ArrowDown" });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(menuItem());
  });

  it("takes no focus when it is opened with the pointer", () => {
    // The row's focus treatment is a filled ground, so focusing the only row
    // on every open drew a permanently-selected box inside the panel — and a
    // second fill on top of it as soon as the pointer arrived. Focus on open
    // belongs to the keyboard, which is where the account menu puts it.
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const item = openMenu();
    expect(document.activeElement).not.toBe(item);
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const trigger = menuTrigger();
    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menuItem()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the pointer goes somewhere else", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(menuItem()).toBeNull();
  });

  it("opens the request form when the action is chosen", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    openRequestDialog();
    chooseReason();
    expect(screen.getByText(copy.substitutionRequestDialogTitle)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
    ).toBeTruthy();
    // The panel closes behind the dialog: rows painted under a modal are rows
    // the keyboard cannot reach.
    expect(menuItem()).toBeNull();
  });

  it("hands focus back to the trigger when the form is dismissed", () => {
    // The row that opened the dialog went with the panel, so without the
    // hand-back focus lands on <body> and the next Tab restarts at the top of
    // the page. The menu owns it, which is what gives the admin's card the
    // same behaviour from the same place.
    renderFeed({ entries: [futureEntry([], SANNA)] });
    const trigger = menuTrigger();
    openRequestDialog();

    // The card's own note editor has a Cancel too, behind the modal; this one
    // is the dialog's, which is the last to mount.
    const cancels = screen.getAllByRole("button", { name: messages.common.cancel });
    fireEvent.click(cancels[cancels.length - 1]);

    expect(screen.queryByText(copy.substitutionRequestDialogTitle)).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the staffing line", () => {
  it("renders only on a date carrying a request", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    expect(screen.queryByText(/Running this session/)).toBeNull();
    cleanup();

    renderFeed({
      entries: [futureEntry([openRequest({ id: PETRA, firstName: "Petra" })], SANNA)],
    });
    expect(expectedLineText()).toContain("Running this session:");
    expect(screen.getByText("Substitute needed for Petra.")).toBeTruthy();
  });

  it("names who is expected, with the role each is paid for", () => {
    renderFeed({
      entries: [futureEntry([openRequest({ id: PETRA, firstName: "Petra" })], SANNA)],
    });
    // Petra has filed, so only Sanna is expected — and her pay class rides with
    // her name, because that is what the line is for. The run is a node per
    // person now, so the assertion reads the line rather than one text node.
    expect(expectedLineText()).toBe("Running this session: Sanna (Primary)");
  });

  it("separates people with a mark a name cannot contain", () => {
    // A display name may hold a comma — the seeded "Suhina, Susanna Hiltunen"
    // does — and a comma-joined run then reads as two people.
    renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({
              id: "0f1a1a3c-5c44-4d3a-93f2-4e3a7f6a1b22",
              firstName: "Mikko",
            }),
          ],
          SANNA,
        ),
      ],
    });

    const line = expectedLineText();
    expect(line).toContain("Sanna (Primary)");
    expect(line).toContain("Petra (Assistant)");
    expect(line).toContain("·");
    // Not one comma anywhere in the run: the separator is the only punctuation
    // between the two people, and neither name carries one here.
    expect(line).not.toContain(",");
  });

  it("leaves a place for a narrow card to break the run", () => {
    // Each person is unbreakable and a middle dot is no break opportunity of
    // its own, so without a real space between the units the whole run is one
    // box — and at 360px it left the card rather than wrapping inside it.
    const THIRD = "3d2a5f48-3d0f-4b8f-8b1d-1f2d2a0f9c54";
    renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({
              id: "0f1a1a3c-5c44-4d3a-93f2-4e3a7f6a1b22",
              firstName: "Mikko",
            }),
          ],
          SANNA,
          [
            ...GEDUS,
            { id: THIRD, firstName: "Joonas", role: "assistant" },
          ],
        ),
      ],
    });

    const units = nameUnits();
    expect(units).toHaveLength(3);

    // The separator rides the name before it, so no line can open with a
    // dangling dot — and the last person carries none at all.
    expect(units.slice(0, -1).map((unit) => unit.textContent.slice(-2))).toEqual([
      SEPARATOR,
      SEPARATOR,
    ]);
    expect(units[2].textContent).not.toContain(DOT);

    // And what stands between two units is an ordinary space: the one place a
    // renderer is allowed to break this line.
    for (const unit of units.slice(0, -1)) {
      const gap = unit.nextSibling;
      expect(gap === null ? null : gap.nodeValue).toBe(" ");
    }
  });

  it("keeps a name with a comma in it as one unbreakable unit", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            {
              ...openRequest({ id: PETRA, firstName: "Petra" }),
              status: "substituted",
              substituteId: {
                id: JOONAS,
                firstName: "Suhina, Susanna Hiltunen",
              },
            },
          ],
          "somebody-else",
        ),
      ],
    });

    // One node holds the whole name, comma included, so no wrap can fall
    // inside it and no reader can take it for two people.
    // The role is the one the request was filed for, which is what the sub is
    // paid as — Petra's primary seat, not her own assignment's class.
    const units = nameUnits().map((unit) =>
      unit.textContent.replace(SEPARATOR, ""),
    );
    expect(units).toContain("Suhina, Susanna Hiltunen (Primary)");
  });

  it("says so when a request has left nobody expected", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({ id: SANNA, firstName: "Sanna" }),
            openRequest({ id: PETRA, firstName: "Petra" }),
          ],
          SANNA,
        ),
      ],
    });
    expect(screen.getByText(copy.staffingNobodyExpected)).toBeTruthy();
  });

  /**
   * **The viewer is never written about in the third person.** The status block
   * says it to them directly, and "Substitute needed for Sanna" one line above
   * "You've asked for a substitute…" is the same fact twice — the second time
   * about a stranger who turns out to be you.
   */
  it("leaves the viewer's own open request off the line", () => {
    renderFeed({
      entries: [futureEntry([openRequest({ id: SANNA, firstName: "Sanna" })], SANNA)],
    });
    expect(screen.queryByText("Substitute needed for Sanna.")).toBeNull();
    // Still the line's own job: who is left running it.
    expect(expectedLineText()).toContain("Running this session:");
    // And the block still says it, in the second person.
    expect(
      screen.getByRole("status").textContent,
    ).toContain(copy.substitutionRequestStatusOpen);
  });

  it("leaves the viewer's own substituted request off the line too", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            {
              ...openRequest({ id: SANNA, firstName: "Sanna" }),
              status: "substituted",
              substituteId: { id: JOONAS, firstName: "Joonas" },
            },
          ],
          SANNA,
        ),
      ],
    });
    expect(screen.queryByText("Joonas is substituting for Sanna.")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Joonas is substituting for you.",
    );
  });

  it("still names every other absent gedu on the same session", () => {
    // Two people away from one session: the reader's own row goes, the
    // colleague's stays exactly as a colleague's card has always drawn it.
    renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({ id: SANNA, firstName: "Sanna" }),
            openRequest({ id: PETRA, firstName: "Petra" }),
          ],
          SANNA,
        ),
      ],
    });
    expect(screen.getByText("Substitute needed for Petra.")).toBeTruthy();
    expect(screen.queryByText("Substitute needed for Sanna.")).toBeNull();
  });

  it("is unchanged for a colleague looking at the same card", () => {
    // Petra's card, Sanna's absence: nothing about this viewer makes the note
    // drop a row, which is what keeps that change a viewer-only one.
    renderFeed({
      entries: [futureEntry([openRequest({ id: SANNA, firstName: "Sanna" })], PETRA)],
    });
    expect(screen.getByText("Substitute needed for Sanna.")).toBeTruthy();
    // One message on the card, and it is the colleague note rather than the
    // viewer's own panel: this reader has filed nothing.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(withdrawButton()).toBeNull();
  });
});

/**
 * ============================================================================
 * The staffing note
 * ============================================================================
 *
 * "Running this session: Sanna (Primary) / Substitute needed for Petra" is news
 * to everybody on the group, and it was small muted print under the date. It is
 * an **info** message now *(owner, 2026-09)* — promoted by the presence of a
 * fact about a colleague, and by nothing else, so the card a reader has only
 * their own request on stays as quiet as it was.
 *
 * The colours are the two the app already has and they carry the hierarchy: a
 * colleague's fact is info, the reader's own open request is warning, and a
 * card with both reads as two messages of two weights.
 */
/** The class tokens one Alert variant wears and the others do not. */
function alertOnly(variant: "info" | "warning"): string[] {
  const tokens = (value: string) => value.split(/\s+/).filter(Boolean);
  const other = new Set(
    tokens(alertVariants({ variant: variant === "info" ? "warning" : "info" })),
  );
  return tokens(alertVariants({ variant })).filter(
    (className) => !other.has(className),
  );
}

describe("the staffing note", () => {
  it("draws a colleague's fact as the app's info message", () => {
    renderFeed({
      entries: [futureEntry([openRequest({ id: PETRA, firstName: "Petra" })], SANNA)],
    });

    const note = screen.getByRole("status");
    expect(note.textContent).toContain("Running this session");
    expect(note.textContent).toContain("Substitute needed for Petra.");

    const worn = new Set(note.className.split(/\s+/));
    const info = alertOnly("info");
    expect(info.length).toBeGreaterThan(0);
    for (const className of info) {
      expect(worn.has(className), className).toBe(true);
    }
    // And none of the warning variant's own: that weight is the reader's own
    // request's and nothing else on this card may take it.
    for (const className of alertOnly("warning")) {
      expect(worn.has(className), className).toBe(false);
    }
  });

  it("is absent on a session nothing is outstanding on", () => {
    // The staffing facts render only on a date carrying a request — an
    // ordinary week has the group's own gedus on it and nothing to say — so
    // there is no note to promote.
    renderFeed({ entries: [futureEntry([], SANNA)] });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Running this session/)).toBeNull();
  });

  it("puts the unanswered seat before the answered one", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            {
              ...openRequest({ id: PETRA, firstName: "Petra" }),
              status: "substituted",
              substituteId: { id: JOONAS, firstName: "Joonas" },
            },
            openRequest({ id: "9d3a2f61-0c5f-4c4e-9a35-2cf0c0b3a5f2", firstName: "Mikko" }),
          ],
          SANNA,
        ),
      ],
    });
    const text = screen.getByRole("status").textContent;
    expect(text.indexOf("Substitute needed for Mikko.")).toBeGreaterThan(-1);
    expect(text.indexOf("Substitute needed for Mikko.")).toBeLessThan(
      text.indexOf("Joonas is substituting for Petra."),
    );
  });

  it("stacks under the viewer's own panel, quieter and first", () => {
    renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({ id: PETRA, firstName: "Petra" }),
            openRequest({ id: SANNA, firstName: "Sanna" }),
          ],
          SANNA,
        ),
      ],
    });

    const panels = screen.getAllByRole("status");
    expect(panels).toHaveLength(2);
    // The colleague's news first, the reader's own request under it.
    expect(panels[0].textContent).toContain("Substitute needed for Petra.");
    expect(panels[1].textContent).toContain(copy.substitutionRequestStatusOpen);

    const first = new Set(panels[0].className.split(/\s+/));
    const second = new Set(panels[1].className.split(/\s+/));
    for (const className of alertOnly("info")) {
      expect(first.has(className), className).toBe(true);
    }
    for (const className of alertOnly("warning")) {
      expect(second.has(className), className).toBe(true);
    }
    // And the reader's own is the one carrying the way back.
    expect(panels[1].contains(withdrawButton())).toBe(true);
  });

  it("puts no block element inside a paragraph", () => {
    const { container } = renderFeed({
      entries: [
        futureEntry(
          [
            openRequest({ id: PETRA, firstName: "Petra" }),
            openRequest({ id: SANNA, firstName: "Sanna" }),
          ],
          SANNA,
        ),
      ],
    });
    expect(container.querySelectorAll("p div")).toHaveLength(0);
    expect(container.querySelectorAll("p p")).toHaveLength(0);
  });
});

/**
 * ============================================================================
 * The header's one menu slot
 * ============================================================================
 *
 * **An admin's card is the gedu's card with different rows in the menu**
 * *(owner, 2026-09)*, and that is a structural claim rather than a stylistic
 * one: whatever a surface supplies lands in the header's trailing cluster,
 * last, after Edit — never in a band of its own under the staffing note. These
 * cases pin the geometry for both roles, because the admin surface reaches it
 * through the very same slot.
 */
describe("the header's menu slot", () => {
  /** The nearest ancestor of `node` that also holds the card's Edit button. */
  function trailingCluster(node: HTMLElement): HTMLElement {
    for (let el = node.parentElement; el !== null; el = el.parentElement) {
      if (within(el).queryByRole("button", { name: copy.edit }) !== null) {
        return el;
      }
    }
    throw new Error("no cluster holding Edit above this node");
  }

  it("puts a supplied menu in the header cluster, last after Edit", () => {
    const { container } = renderFeed({
      entries: [futureEntry([], SANNA), pastEntry([], SANNA)],
      withCallbacks: false,
      renderSessionMenu: () => (
        <button type="button">Staffing editor</button>
      ),
    });

    const supplied = screen.getAllByRole("button", { name: "Staffing editor" });
    expect(supplied).toHaveLength(2);
    for (const menu of supplied) {
      const cluster = trailingCluster(menu);
      expect(cluster.contains(menu)).toBe(true);
      // Last in the cluster, which is where the overflow menu belongs and what
      // keeps every mark before it in place.
      expect(cluster.lastElementChild).toBe(menu);
    }
    // And no band under the staffing note holding it instead.
    expect(container.querySelectorAll(".border-t")).toHaveLength(0);
  });

  it("puts the gedu's own menu in the same place", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });

    const trigger = menuTrigger();
    expect(trigger).not.toBeNull();
    if (trigger === null) throw new Error("no menu on this card");
    const cluster = trailingCluster(trigger);
    expect(cluster.contains(trigger)).toBe(true);
    expect(cluster.lastElementChild?.contains(trigger)).toBe(true);
  });

  it("is empty on the gedu side, which supplies none", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    expect(screen.queryByRole("button", { name: "Staffing editor" })).toBeNull();
  });

  it("draws no staffing band on a card with nothing outstanding", () => {
    // The band is the border and the padding the staffing facts sit in. A card
    // with no request has neither, whichever role is looking — which is what
    // makes the two cards the same height in the same state.
    const { container } = renderFeed({
      entries: [futureEntry([], SANNA)],
      withCallbacks: false,
      renderSessionMenu: () => (
        <button type="button">Staffing editor</button>
      ),
    });
    expect(container.querySelectorAll(".border-t")).toHaveLength(0);
  });
});

/**
 * ============================================================================
 * What happens after the write lands
 * ============================================================================
 *
 * The region holds one `committing` flag across both of its controls, and this
 * card **survives its own write**: the feed keys an entry by (group, date), so
 * filing an absence rebuilds the region rather than unmounting it. A flag that
 * was only ever cleared on a refusal therefore left the *next* action disabled
 * for the rest of the visit — the Withdraw the file had just put on screen,
 * and the file the withdraw had just handed back.
 *
 * The harness is the shape the live shell has: the callback does not resolve
 * until the document behind the card has been re-read, so the region is looking
 * at the new staffing by the time it lets go.
 */
function SubstitutionHarness({
  settleFile,
  settleWithdraw,
  initialRequests = [],
}: {
  settleFile?: Promise<void>;
  settleWithdraw?: Promise<void>;
  initialRequests?: readonly SubstitutionRequestInput[];
}) {
  const [requests, setRequests] =
    useState<readonly SubstitutionRequestInput[]>(initialRequests);

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={[futureEntry(requests, SANNA)]}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={null}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            onAddPhoto={() => Promise.resolve("")}
            onRemovePhoto={() => Promise.resolve()}
            onRequestSubstitution={async () => {
              await settleFile;
              setRequests([openRequest({ id: SANNA, firstName: "Sanna" })]);
            }}
            onWithdrawSubstitutionRequest={async () => {
              await settleWithdraw;
              setRequests([]);
            }}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

/** A deferred, so a write can be held open and then let go inside `act`. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function isDisabled(element: HTMLElement | null): boolean {
  return element !== null && element.hasAttribute("disabled");
}

describe("the staffing region after a write lands", () => {
  it("hands back the Withdraw the file itself put on screen", async () => {
    const file = deferred();
    render(<SubstitutionHarness settleFile={file.promise} />);

    openRequestDialog();
    chooseReason();
    fireEvent.click(
      screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
    );

    // Still in the air: nothing on the card may be pressed.
    expect(
      isDisabled(screen.getByRole("button", { name: copy.substitutionRequestConfirm })),
    ).toBe(true);

    await act(async () => {
      file.resolve();
    });

    // The card is rebuilt from the new staffing rather than unmounted, so this
    // is the very region that was committing a moment ago.
    expect(menuTrigger()).toBeNull();
    const withdraw = withdrawButton();
    expect(withdraw).not.toBeNull();
    expect(isDisabled(withdraw)).toBe(false);
  });

  it("hands back the file action the withdraw itself put on screen", async () => {
    const withdraw = deferred();
    render(
      <SubstitutionHarness
        settleWithdraw={withdraw.promise}
        initialRequests={[openRequest({ id: SANNA, firstName: "Sanna" })]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: copy.substitutionWithdrawAction }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: copy.substitutionWithdrawConfirm }),
    );
    expect(
      isDisabled(screen.getByRole("button", { name: copy.substitutionWithdrawConfirm })),
    ).toBe(true);

    await act(async () => {
      withdraw.resolve();
    });

    expect(withdrawButton()).toBeNull();
    // The menu the withdraw handed back is a menu, not a button: what has to
    // be true is that filing is reachable again from this very card.
    const action = openMenu();
    expect(isDisabled(action)).toBe(false);
  });

  it("keeps the dialog up and hands the control back when the write is refused", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimezoneProvider initialTimezone="Europe/Helsinki">
          <NowProvider initialNow={NOW}>
            <SessionFeed
              entries={[futureEntry([], SANNA)]}
              now={NOW}
              roster={ROSTER}
              sourceTimeZone="Europe/Helsinki"
              editingEntryId={null}
              onEditEntry={() => {}}
              onSaveEntry={() => {}}
              onSendReport={() =>
                Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
              }
              onAddPhoto={() => Promise.resolve("")}
              onRemovePhoto={() => Promise.resolve()}
              onRequestSubstitution={() => Promise.reject(new Error("nope"))}
              onWithdrawSubstitutionRequest={() => {}}
            />
          </NowProvider>
        </TimezoneProvider>
      </NextIntlClientProvider>,
    );

    openRequestDialog();
    chooseReason();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
      );
    });

    expect(screen.getByText(copy.substitutionRequestFailed)).toBeTruthy();
    expect(
      isDisabled(screen.getByRole("button", { name: copy.substitutionRequestConfirm })),
    ).toBe(false);
  });

  /**
   * **The card's menu and the Substitutions page's picker are two ways into one
   * write, so they explain its refusals with one mapper.** The page is where
   * the reason matters most — it cannot know what it has already filed on — but
   * a card refusing in one vocabulary while the page refuses in another would
   * be the second copy of two questions this feature exists not to have.
   */
  const REFUSALS = [
    {
      what: "an absence already filed for this session",
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "session_substitution_requests_live_seat"',
      },
      line: copy.substitutionRequestFailedAlreadyAsked,
    },
    {
      what: "a seat the caller is no longer expected at",
      error: { code: "42501", message: "Forbidden" },
      line: copy.substitutionRequestFailedNotExpected,
    },
    {
      what: "a date already behind the product",
      error: {
        code: "23514",
        message:
          "a substitution request cannot be filed for a past session (2026-03-01)",
      },
      line: copy.substitutionRequestFailedPastSession,
    },
    {
      what: "a weekday the schedule no longer names",
      error: {
        code: "23514",
        message: "No scheduled session on 2026-03-18 for this group",
      },
      line: copy.substitutionRequestFailedNotScheduled,
    },
  ] as const;

  for (const { what, error, line } of REFUSALS) {
    it(`names ${what} in the card's own dialog`, async () => {
      renderFeed({
        entries: [futureEntry([], SANNA)],
        onRequestSubstitution: () => Promise.reject(error),
      });

      openRequestDialog();
    chooseReason();
      const note = document.querySelector("textarea");
      if (note === null) throw new Error("the request form has no note field");
      fireEvent.change(note, { target: { value: "back on Thursday" } });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
        );
      });

      expect(screen.getByText(line)).toBeTruthy();
      expect(screen.queryByText(copy.substitutionRequestFailed)).toBeNull();
      // The dialog stands, with the draft where the gedu left it.
      expect(screen.getByText(copy.substitutionRequestDialogTitle)).toBeTruthy();
      expect(note.value).toBe("back on Thursday");
      expect(
        isDisabled(
          screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
        ),
      ).toBe(false);
    });
  }

  it("names a refused withdraw inside the dialog, not behind it", async () => {
    // The withdraw confirm holds for its own write, so the refusal belongs to
    // the dialog the gedu is standing in front of. Drawn on the card instead,
    // it would be under the overlay: the one place nobody can read it.
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimezoneProvider initialTimezone="Europe/Helsinki">
          <NowProvider initialNow={NOW}>
            <SessionFeed
              entries={[
                futureEntry([openRequest({ id: SANNA, firstName: "Sanna" })], SANNA),
              ]}
              now={NOW}
              roster={ROSTER}
              sourceTimeZone="Europe/Helsinki"
              editingEntryId={null}
              onEditEntry={() => {}}
              onSaveEntry={() => {}}
              onSendReport={() =>
                Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
              }
              onAddPhoto={() => Promise.resolve("")}
              onRemovePhoto={() => Promise.resolve()}
              onRequestSubstitution={() => {}}
              onWithdrawSubstitutionRequest={() => Promise.reject(new Error("nope"))}
            />
          </NowProvider>
        </TimezoneProvider>
      </NextIntlClientProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: copy.substitutionWithdrawAction }),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: copy.substitutionWithdrawConfirm }),
      );
    });

    expect(screen.getByText(copy.substitutionWithdrawFailed)).toBeTruthy();
    // The feed is the harness's own DOM; the dialog is a portal out of it.
    expect(container.textContent).not.toContain(copy.substitutionWithdrawFailed);
    expect(
      isDisabled(screen.getByRole("button", { name: copy.substitutionWithdrawConfirm })),
    ).toBe(false);
  });
});

/**
 * The frozen empty staffing every fixture that is not about staffing hands
 * over. It has to leave the card exactly as it was before any of this existed —
 * which is what makes it safe to require the field on every entry kind.
 */
describe("NO_SESSION_STAFFING", () => {
  it("draws nothing at all", () => {
    renderFeed({
      entries: [{ ...futureEntry([], SANNA), staffing: NO_SESSION_STAFFING }],
    });
    expect(menuTrigger()).toBeNull();
    expect(withdrawButton()).toBeNull();
    expect(screen.queryByText(/Running this session/)).toBeNull();
  });
});

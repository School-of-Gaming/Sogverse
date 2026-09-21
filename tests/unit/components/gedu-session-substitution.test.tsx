import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
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

function futureEntry(requests: readonly SubstitutionRequestInput[], viewerId: string) {
  return {
    kind: "future",
    id: `group-1:${FUTURE_DATE}`,
    startsAt: FUTURE_START,
    endsAt: FUTURE_END,
    staffing: deriveSessionStaffing({
      gedus: GEDUS,
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
  renderStaffingEditor,
}: {
  entries: readonly (FutureSessionFeedEntry | PastSessionFeedEntry)[];
  /** Whether this surface supplies the gedu's two substitution callbacks. */
  withCallbacks?: boolean;
  renderStaffingEditor?: () => React.ReactNode;
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
            onRequestSubstitution={withCallbacks ? () => {} : undefined}
            onWithdrawSubstitutionRequest={withCallbacks ? () => {} : undefined}
            renderStaffingEditor={renderStaffingEditor}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

const copy = messages.gedu.sessionFeed;

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
    expect(screen.getByText(copy.substitutionRequestDialogTitle)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.substitutionRequestConfirm }),
    ).toBeTruthy();
    // The panel closes behind the dialog: rows painted under a modal are rows
    // the keyboard cannot reach.
    expect(menuItem()).toBeNull();
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
    expect(screen.getByText(/Running this session/)).toBeTruthy();
    expect(screen.getByText("Substitute needed for Petra.")).toBeTruthy();
  });

  it("names who is expected, with the role each is paid for", () => {
    renderFeed({
      entries: [futureEntry([openRequest({ id: PETRA, firstName: "Petra" })], SANNA)],
    });
    // Petra has filed, so only Sanna is expected — and her pay class rides with
    // her name, because that is what the line is for.
    expect(
      screen.getByText("Running this session: Sanna (Primary)"),
    ).toBeTruthy();
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
    expect(screen.getByText(/Running this session/)).toBeTruthy();
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
    // Petra's card, Sanna's absence: nothing about this viewer makes the line
    // drop a row, which is what keeps the change a viewer-only one.
    renderFeed({
      entries: [futureEntry([openRequest({ id: SANNA, firstName: "Sanna" })], PETRA)],
    });
    expect(screen.getByText("Substitute needed for Sanna.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the staffing editor slot", () => {
  it("renders whatever the surface supplies, on every card", () => {
    renderFeed({
      entries: [futureEntry([], SANNA), pastEntry([], SANNA)],
      withCallbacks: false,
      renderStaffingEditor: () => (
        <button type="button">Staffing editor</button>
      ),
    });
    expect(
      screen.getAllByRole("button", { name: "Staffing editor" }),
    ).toHaveLength(2);
  });

  it("is empty on the gedu side, which supplies none", () => {
    renderFeed({ entries: [futureEntry([], SANNA)] });
    expect(screen.queryByRole("button", { name: "Staffing editor" })).toBeNull();
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

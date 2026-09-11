import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import {
  NO_TOPIC_PREP_READY,
  TOPIC_PREP_COOKIE_NAME,
  topicPrepReadyFor,
} from "@/components/topic-prep/topic-prep-cookie";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { INERT_HREF } from "@/lib/constants/routes";

/**
 * The "Before the first session" guide, as the enrolment card offers it.
 *
 * Everything about *what the guide says* is settled elsewhere — the registry's
 * resolver decides whether a topic has one and which steps survive the
 * in-person filter, and its own tests pin that. What only a rendered card can
 * answer is where the affordance goes, what it displaces, what puts it away for
 * good, and when it stops being offered at all:
 *
 *  1. **It takes the locked Join's slot and gives it straight back.** The
 *     locked button is inert and restates the schedule row above it; the guide
 *     has something to do behind it. Button for button, so the swap moves
 *     nothing.
 *  2. **A lit Join is never touched.** The room being open is the whole point of
 *     the card, so the guide steps down to a quiet link beside it.
 *  3. **The cards with no Join take the button under their footer sentence** —
 *     the in-person one and the unplaced seat, the latter being inert as a link
 *     while still opening a dialog, because a dialog is not a page.
 *  4. **Three cards never offer it**: a queue place (no seat to get ready for),
 *     a finished run, and an in-person card whose topic brings no steps. The
 *     third is in-person alone — remotely there is always the voice room.
 *  5. **Only the affirmative dismisses**, and the answer arrives on the *first*
 *     render as a prop, because it is read from a cookie by whatever rendered
 *     the page. There is no third "not known yet" state and nothing swaps after
 *     hydration.
 *  6. **The offer is bounded by the family's first two sessions.** Past the end
 *     of the second one the card offers nothing, answered or not — which is
 *     what keeps a family who has been turning up since February from being
 *     asked to confirm a dialog about their first session.
 */

// Keys echo, so an assertion names the copy the card reached for rather than
// the wording in messages/.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    };
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

const clock = vi.hoisted(() => ({ now: new Date() }));
const viewer = vi.hoisted(() => ({ id: "" }));
vi.mock("@/providers", () => ({
  useNow: () => clock.now,
  useTimezone: () => "Europe/Helsinki",
  useAuth: () => ({ user: { id: viewer.id, email: undefined } }),
}));

const NOW = new Date("2026-02-11T12:00:00.000Z");
const PARTICIPATION_ID = "e0b5b0c3-7c8f-4b3e-9a11-5f2c6d7e8a90";
/** Whoever is looking. The viewer half of every key written to the cookie. */
const VIEWER_ID = "9c1f0f2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const TRIGGER = "topicPrep.triggerLabel";
const READY = "topicPrep.readyLabel";
const DIALOG_TITLE = "topicPrep.dialogTitle";
const JOIN = "voiceButton.joinVoice";
/** The locked Join renders its label with the date and time interpolated. */
function lockedJoin(): HTMLElement | null {
  return screen.queryByText(/^voiceButton\.locked\(/);
}

/** Ten minutes out — long enough to read, short enough for a case to outlive. */
const WINDOW_ENDS_SOON = new Date(NOW.getTime() + 600_000);

/**
 * One enrollment, in whichever state a case needs. Defaults to the card the
 * affordance was designed for: a remote club with a guide behind its topic, its
 * room three days out, and a prep window still open.
 */
function enrollment(
  overrides: Partial<FamilyEnrollmentSummary> = {},
): FamilyEnrollmentSummary {
  return {
    participationId: PARTICIPATION_ID,
    productName: "Roblox Studio Club",
    productType: "consumer_club",
    topic: "roblox_studio",
    isRemote: true,
    prepWindowEnd: new Date(NOW.getTime() + 10 * 86_400_000),
    nextSessionStart: new Date(NOW.getTime() + 3 * 86_400_000),
    nextSessionEnd: new Date(NOW.getTime() + 3 * 86_400_000 + 5_400_000),
    hasVoiceRoom: true,
    voiceHref: INERT_HREF,
    siteName: null,
    openHref: INERT_HREF,
    endDate: null,
    timezone: "Europe/Helsinki",
    waitlistPosition: null,
    seatOfferSentAt: null,
    awaiting: false,
    paymentProblem: false,
    cancellation: null,
    scheduleLines: [],
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<FamilyEnrollmentSummary> = {},
  prepDismissed: ReadonlySet<string> = NO_TOPIC_PREP_READY,
) {
  return render(
    <EnrollmentCard
      enrollment={enrollment(overrides)}
      prepDismissed={prepDismissed}
      audience="gamer"
    />,
  );
}

/**
 * Open the guide and answer it, which is the one act that dismisses it.
 *
 * Two commits, not one: the dialog does not exist until the click that opens
 * it has been rendered, so a single `act` would look for the answer button
 * inside the frame that is still drawing it.
 */
function sayReady(): void {
  act(() => {
    screen.getByText(TRIGGER).click();
  });
  act(() => {
    screen.getByText(READY).click();
  });
}

/** What the browser has been told to remember, decoded. */
function storedCookie(): string {
  const match = document.cookie.match(
    // eslint-disable-next-line security/detect-non-literal-regexp -- the name is a hardcoded constant
    new RegExp(`(?:^|; )${TOPIC_PREP_COOKIE_NAME}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
}

beforeEach(() => {
  clock.now = NOW;
  viewer.id = VIEWER_ID;
  document.cookie = `${TOPIC_PREP_COOKIE_NAME}=;max-age=0;path=/`;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the prep guide in the Join's slot", () => {
  it("replaces the locked Join, and hands the slot back on I'm ready", () => {
    renderCard();

    // The locked button is gone rather than joined: one slot, one button, so
    // the swap costs no height and nothing below the card moves.
    expect(screen.getByText(TRIGGER)).toBeTruthy();
    expect(lockedJoin()).toBeNull();

    sayReady();

    expect(screen.queryByText(TRIGGER)).toBeNull();
    expect(lockedJoin()).toBeTruthy();
  });

  /**
   * **The whole point of the cookie**: the answer is known before a single
   * pixel is drawn, so the card that has been finished with paints its locked
   * Join on the first render and never shows "Get ready" at all. Under the
   * `localStorage` design this card drew the affordance first and corrected
   * itself a tick after hydration, which is the flash this replaces.
   */
  it("draws the locked Join from the first render when the prop says ready", () => {
    renderCard({}, new Set([PARTICIPATION_ID]));

    expect(screen.queryByText(TRIGGER)).toBeNull();
    expect(lockedJoin()).toBeTruthy();
  });

  /**
   * A parent and a child share one computer far more often than they share a
   * dashboard, so what is written down has to say *who* answered — a parent
   * finishing with the guide must not take it away from the child who has not
   * read it, and one child's club must not answer for their sibling's.
   */
  it("writes the viewer and the enrollment, not a bare flag", () => {
    renderCard();
    sayReady();

    expect(storedCookie()).toBe(`${VIEWER_ID}:${PARTICIPATION_ID}`);
  });

  /** A second card's answer joins the first rather than replacing it. */
  it("merges a second answer into what is already stored", () => {
    const other = "2f3a4b5c-6d7e-4f80-9112-334455667788";
    renderCard();
    sayReady();
    cleanup();

    renderCard({ participationId: other });
    sayReady();

    expect(storedCookie()).toBe(
      `${VIEWER_ID}:${PARTICIPATION_ID},${VIEWER_ID}:${other}`,
    );
  });
});

describe("the prep guide beside a lit Join", () => {
  it("leaves the Join exactly as it was and stands beside it", () => {
    // Mid-session: the room is open, which is the one thing on this card that
    // may never be gated, delayed or displaced.
    renderCard({
      nextSessionStart: new Date(NOW.getTime() - 600_000),
      nextSessionEnd: new Date(NOW.getTime() + 3_000_000),
    });

    expect(screen.getByText(JOIN)).toBeTruthy();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
    expect(lockedJoin()).toBeNull();
  });
});

describe("the prep guide on the cards with no Join", () => {
  it("sits under the site line of an in-person card", () => {
    renderCard({
      isRemote: false,
      hasVoiceRoom: false,
      siteName: "Kirjasto Oodi, Helsinki",
    });

    expect(screen.getByText("Kirjasto Oodi, Helsinki")).toBeTruthy();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
  });

  /**
   * The unplaced seat draws no link and no chevron because there is no page
   * behind it — and it still offers the guide, because a dialog is not a page
   * and the wait for a placement is precisely the window the guide is written
   * for. It also carries no window *end*: nobody has put them in a group, so
   * there are no sessions of theirs to count.
   */
  it("sits under the awaiting sentence of an unplaced seat", () => {
    renderCard({ awaiting: true, prepWindowEnd: null });

    expect(screen.getByText("familyEnrollment.awaitingGamer")).toBeTruthy();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
  });

  /**
   * **The two cards whose footer would otherwise not be drawn at all.**
   *
   * The footer is populated rather than reserved: where every sentence branch
   * comes up empty the row is left out, and the prep affordance lives inside
   * that row. So a card with nothing to say and a guide to offer has to draw
   * the footer for the guide alone — otherwise the family who has just paid,
   * and who has the whole setup ahead of them, is the one family never offered
   * it.
   */
  it("draws the footer for the guide alone on an in-person seat with no site named", () => {
    // A real row: the seat is in a group, and the location has no name on it
    // yet. Nothing else in the footer has anything to say.
    renderCard({ isRemote: false, hasVoiceRoom: false, siteName: null });

    expect(screen.getByText(TRIGGER)).toBeTruthy();
  });

  it("draws the footer for the guide alone on a remote seat with nothing scheduled", () => {
    // The product has a room but no slots yet, so there is no session for a
    // Join to name — and the guide is precisely what this family can be doing
    // while the schedule is settled. With nothing scheduled there is nothing
    // to bound the offer with either.
    renderCard({
      nextSessionStart: null,
      nextSessionEnd: null,
      prepWindowEnd: null,
    });

    expect(screen.getByText(TRIGGER)).toBeTruthy();
    expect(lockedJoin()).toBeNull();
  });
});

describe("the cards that never offer it", () => {
  it("says nothing on a queue place", () => {
    renderCard({
      waitlistPosition: 3,
      nextSessionStart: null,
      nextSessionEnd: null,
      prepWindowEnd: null,
    });

    expect(screen.queryByText(TRIGGER)).toBeNull();
  });

  it("says nothing on a finished run", () => {
    renderCard({
      nextSessionStart: null,
      nextSessionEnd: null,
      endDate: "2026-01-31",
    });

    expect(screen.queryByText(TRIGGER)).toBeNull();
  });

  it("says nothing on an in-person card whose topic brings no steps", () => {
    // A label-only topic names subject matter rather than one piece of
    // software, so there is nothing to install or sign into — and in person
    // there is no voice room to get ready for either.
    renderCard({ topic: "esports", isRemote: false, hasVoiceRoom: false });

    expect(screen.queryByText(TRIGGER)).toBeNull();
  });

  it("still offers the guide on a remote card whose topic brings no steps", () => {
    // The room is the thing to get ready for, and every remote product has
    // one — so the affordance is drawn on a topic that used to have nothing to
    // say, and it takes the locked Join's slot like any other guide.
    renderCard({ topic: "esports" });

    expect(screen.queryByText(TRIGGER)).not.toBeNull();
    expect(lockedJoin()).toBeNull();
  });
});

/**
 * **The rollout's whole quietness lives here.** A family who has been coming
 * for months has a working setup, and the guide asking them to confirm a
 * "Before the first session" dialog to get their card back would be the
 * platform noticing them for the first time on the day we shipped this.
 */
describe("the window the offer lives in", () => {
  it("offers nothing once the window has closed, answered or not", () => {
    renderCard({ prepWindowEnd: new Date(NOW.getTime() - 60_000) });

    expect(screen.queryByText(TRIGGER)).toBeNull();
    // And the slot goes back to what it always held.
    expect(lockedJoin()).toBeTruthy();
  });

  it("hands the Join's slot back the moment the window closes", () => {
    // Button for button in one slot, so following the live clock here costs
    // nothing: nothing on the card moves when the swap happens.
    const { rerender } = renderCard({ prepWindowEnd: WINDOW_ENDS_SOON });
    expect(screen.getByText(TRIGGER)).toBeTruthy();

    clock.now = new Date(WINDOW_ENDS_SOON.getTime() + 1_000);
    rerender(
      <EnrollmentCard
        enrollment={enrollment({ prepWindowEnd: WINDOW_ENDS_SOON })}
        prepDismissed={NO_TOPIC_PREP_READY}
        audience="gamer"
      />,
    );

    expect(screen.queryByText(TRIGGER)).toBeNull();
    expect(lockedJoin()).toBeTruthy();
  });

  /**
   * **A move between groups reopens the window, and must never re-ask a seat
   * that has already answered.**
   *
   * The start moment is the later of the two stamps, so a child moved to
   * another group is re-stamped and their window opens again from the new
   * placement — which is what a family who really is starting over with a new
   * gedu, a new room and a new day wants. What must not come back with it is
   * the guide on a seat that was finished with, and nothing about this card
   * has to be careful for that to hold: the answer is written down against the
   * **participation**, and a group move leaves the participation exactly where
   * it was. So the reopened window finds the seat already answered and offers
   * nothing, in the Join's slot and under the footer sentence alike.
   */
  it("never re-asks a seat that has answered, even when a group move reopens the window", () => {
    renderCard({ prepWindowEnd: WINDOW_ENDS_SOON });
    sayReady();
    // The reader's own answer, as the browser now holds it — which is exactly
    // what a page render parses back out of the cookie.
    const dismissed = topicPrepReadyFor(storedCookie(), VIEWER_ID);
    expect([...dismissed]).toEqual([PARTICIPATION_ID]);
    cleanup();

    // A fresh placement: the same seat, re-stamped, with a window running well
    // past the old one.
    const reopened = new Date(NOW.getTime() + 30 * 86_400_000);

    renderCard({ prepWindowEnd: reopened }, dismissed);
    expect(screen.queryByText(TRIGGER)).toBeNull();
    expect(lockedJoin()).toBeTruthy();
    cleanup();

    // And the same answer on the placement that has no Join to give back.
    renderCard({ awaiting: true, prepWindowEnd: reopened }, dismissed);
    expect(screen.getByText("familyEnrollment.awaitingGamer")).toBeTruthy();
    expect(screen.queryByText(TRIGGER)).toBeNull();
  });

  /**
   * The additive placements do **not** follow the clock, and that is the layout
   * rule rather than an oversight: there is no button underneath to take the
   * space back, so a button vanishing on time's own schedule would shrink the
   * card and pull the column up under whoever was reading it.
   */
  it("leaves the button under the awaiting sentence alone when the window closes mid-read", () => {
    const spec = { awaiting: true, prepWindowEnd: WINDOW_ENDS_SOON };
    const { rerender } = renderCard(spec);
    expect(screen.getByText(TRIGGER)).toBeTruthy();

    clock.now = new Date(WINDOW_ENDS_SOON.getTime() + 1_000);
    rerender(
      <EnrollmentCard
        enrollment={enrollment(spec)}
        prepDismissed={NO_TOPIC_PREP_READY}
        audience="gamer"
      />,
    );

    expect(screen.getByText(TRIGGER)).toBeTruthy();
  });
});

describe("what does and does not count as finishing with the guide", () => {
  it("keeps the affordance when the dialog is closed without answering", () => {
    renderCard();

    act(() => {
      screen.getByText(TRIGGER).click();
    });
    expect(screen.getByText(DIALOG_TITLE)).toBeTruthy();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    // Overlay gone, offer intact — and nothing written, so the next visit is
    // offered it again.
    expect(screen.queryByText(DIALOG_TITLE)).toBeNull();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
    expect(storedCookie()).toBe("");
  });
});

describe("a browser that refuses cookies", () => {
  it("still puts the affordance away for the reader who just answered", () => {
    const real = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "cookie",
    );
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() {
        throw new Error("site data blocked");
      },
      set() {
        throw new Error("site data blocked");
      },
    });

    try {
      renderCard();
      expect(screen.getByText(TRIGGER)).toBeTruthy();

      // The throwing write is swallowed: the reader answered, so the affordance
      // goes away for this visit whatever the browser will store. Offering the
      // guide again next time costs a click; leaving the button under their
      // cursor after they answered costs their trust in the button.
      sayReady();
      expect(screen.queryByText(TRIGGER)).toBeNull();
    } finally {
      Reflect.deleteProperty(document, "cookie");
      if (real) Object.defineProperty(Document.prototype, "cookie", real);
    }
  });
});

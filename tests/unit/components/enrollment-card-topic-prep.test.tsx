import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { INERT_HREF } from "@/lib/constants/routes";

/**
 * The "Before the first session" guide, as the enrolment card offers it.
 *
 * Everything about *what the guide says* is settled elsewhere — the registry's
 * resolver decides whether a topic has one and which steps survive the
 * in-person filter, and its own tests pin that. What only a rendered card can
 * answer is where the affordance goes, what it displaces, and what puts it away
 * for good:
 *
 *  1. **It takes the locked Join's slot and gives it straight back.** The
 *     locked button is inert and restates the schedule row above it; the guide
 *     has something to do behind it. Button for button, so the swap that
 *     follows the storage read moves nothing.
 *  2. **A lit Join is never touched.** The room being open is the whole point of
 *     the card, so the guide steps down to a quiet link beside it.
 *  3. **The cards with no Join take the button under their footer sentence** —
 *     the in-person one and the unplaced seat, the latter being inert as a link
 *     while still opening a dialog, because a dialog is not a page.
 *  4. **Three cards never offer it**: a queue place (no seat to get ready for),
 *     a finished run, and an in-person card whose topic brings no steps. The
 *     third is in-person alone — remotely there is always the voice room.
 *  5. **Only the affirmative dismisses.** Closing the dialog any other way
 *     leaves the affordance exactly where it was, so checking one step does not
 *     silently throw the guide away.
 *  6. **Storage is never trusted.** A browser that refuses it is a family who
 *     gets offered the guide, which is the failure that costs a click rather
 *     than the one that costs the setup instructions.
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
/** Whoever is looking. Restored per case, since one case swaps it mid-test. */
const VIEWER_ID = "9c1f0f2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const OTHER_VIEWER_ID = "1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6";

const TRIGGER = "topicPrep.triggerLabel";
const READY = "topicPrep.readyLabel";
const DIALOG_TITLE = "topicPrep.dialogTitle";
const JOIN = "voiceButton.joinVoice";
/** The locked Join renders its label with the date and time interpolated. */
function lockedJoin(): HTMLElement | null {
  return screen.queryByText(/^voiceButton\.locked\(/);
}

/**
 * One enrollment, in whichever state a case needs. Defaults to the card the
 * affordance was designed for: a remote club with a guide behind its topic and
 * its room three days out.
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

function renderCard(overrides: Partial<FamilyEnrollmentSummary> = {}) {
  return render(
    <EnrollmentCard enrollment={enrollment(overrides)} audience="gamer" />,
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

beforeEach(() => {
  clock.now = NOW;
  viewer.id = VIEWER_ID;
  window.localStorage.clear();
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

  it("stays away on a later visit, for this viewer and this enrollment", () => {
    renderCard();
    sayReady();
    cleanup();

    renderCard();
    expect(screen.queryByText(TRIGGER)).toBeNull();
    expect(lockedJoin()).toBeTruthy();
  });

  /**
   * A parent and a child share one computer far more often than they share a
   * dashboard, so a parent finishing with the guide must not take it away from
   * the child who has not read it — and one child's club must not answer for
   * their sibling's.
   */
  it("is keyed by the viewer and the enrollment, not by the browser", () => {
    renderCard();
    sayReady();
    cleanup();

    viewer.id = OTHER_VIEWER_ID;
    renderCard();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
    cleanup();

    viewer.id = VIEWER_ID;
    renderCard({ participationId: "2f3a4b5c-6d7e-4f80-9112-334455667788" });
    expect(screen.getByText(TRIGGER)).toBeTruthy();
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
   * for.
   */
  it("sits under the awaiting sentence of an unplaced seat", () => {
    renderCard({ awaiting: true });

    expect(screen.getByText("familyEnrollment.awaitingGamer")).toBeTruthy();
    expect(screen.getByText(TRIGGER)).toBeTruthy();
  });
});

describe("the cards that never offer it", () => {
  it("says nothing on a queue place", () => {
    renderCard({
      waitlistPosition: 3,
      nextSessionStart: null,
      nextSessionEnd: null,
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
    expect(window.localStorage.length).toBe(0);
  });
});

describe("a browser that refuses storage", () => {
  it("treats a throwing read as not dismissed", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("site data blocked");
      },
      setItem: () => {
        throw new Error("site data blocked");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });

    renderCard();
    expect(screen.getByText(TRIGGER)).toBeTruthy();

    // And the throwing *write* is swallowed too: the reader answered, so the
    // affordance goes away for this render whatever the browser will store.
    sayReady();
    expect(screen.queryByText(TRIGGER)).toBeNull();
  });
});

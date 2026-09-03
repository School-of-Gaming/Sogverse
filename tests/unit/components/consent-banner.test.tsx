import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// The banner asks *where* it is before it asks anything else, so the route has
// to be steerable per test — the global setup mock pins it at "/".
const mockNav = { pathname: "/" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockNav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ConsentBanner, ConsentProvider, useConsent } from "@/components/consent";
import {
  CONSENT_COOKIE_NAME,
  parseConsentCookie,
  type ConsentState,
} from "@/lib/consent";
import { getCookie } from "@/lib/cookies";

/**
 * ============================================================================
 * The consent strip: the three answers, and the two ways one takes effect.
 * ============================================================================
 *
 * Three things are worth a test here and the rest is markup.
 *
 *   - **Three buttons, and the order they sit in.** Refusing has to be exactly
 *     as easy as accepting, which is a legal requirement rather than a taste,
 *     and the DOM order is what puts the fullest answer rightmost in a row and
 *     topmost in a stack. A future tidy-up that reorders them on aesthetic
 *     grounds breaks both at once, silently.
 *   - **An upgrade is state; a withdrawal is a new document.** Granting a
 *     purpose only has to mount something. Revoking one cannot unmount a script
 *     that already installed itself on this page, so the page reloads and the
 *     pixels' own cookies go with it. Getting this wrong looks like it worked:
 *     the banner closes either way.
 *   - **The buttons never come back.** The strip's own committing flag has to
 *     hold across the reload, which is the one outcome slow enough for a second
 *     click to land in.
 */

/** Renders the strip with a way to reopen it, the way the footer link does. */
function Harness({ initial }: { initial: ConsentState | null }) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Helsinki"
    >
      <ConsentProvider initial={initial}>
        <ReopenButton />
        <ConsentBanner />
      </ConsentProvider>
    </NextIntlClientProvider>
  );
}

function ReopenButton() {
  const { open } = useConsent();
  return (
    <button type="button" onClick={open}>
      reopen
    </button>
  );
}

const GRANTED_BOTH: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-01T08:00:00.000Z",
};

function strip() {
  return screen.getByRole("region", { name: messages.consent.heading });
}

function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0].trim();
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  }
}

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearCookies();
  mockNav.pathname = "/";
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    // jsdom keeps Location's accessors on the prototype, so spreading the real
    // one yields an empty object — the two fields the cookie helpers read are
    // stated outright instead.
    value: { protocol: "http:", hostname: "localhost", reload },
  });
});

afterEach(cleanup);

describe("ConsentBanner", () => {
  it("asks when no answer is stored, and stays away once one is", () => {
    const { unmount } = render(<Harness initial={null} />);
    expect(screen.queryByRole("region")).not.toBeNull();
    unmount();

    render(<Harness initial={GRANTED_BOTH} />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  // A child signs in through their parent's account, so the answer is not
  // theirs to give — and nothing optional runs on their surface anyway. The
  // strip is withheld rather than shown-and-ignored, because a question put to
  // someone who cannot answer it only teaches them to dismiss it.
  it.each(["/gamer", "/gamer/clubs/abc"])(
    "does not ask on %s, even with no answer stored",
    (pathname) => {
      mockNav.pathname = pathname;

      render(<Harness initial={null} />);

      expect(screen.queryByRole("region")).toBeNull();
    },
  );

  it("still asks on a parent surface", () => {
    mockNav.pathname = "/parent";

    render(<Harness initial={null} />);

    expect(screen.queryByRole("region")).not.toBeNull();
  });

  it("offers exactly three answers, negative first and fullest last", () => {
    render(<Harness initial={null} />);

    const buttons = within(strip()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      messages.consent.rejectAll,
      messages.consent.analyticsOnly,
      messages.consent.analyticsAndMarketing,
    ]);
  });

  // The policy link is inside the sentence, not on a row of its own — so it is
  // the *only* link in the strip, and the words carrying it are chosen by each
  // locale rather than by the component.
  it("carries the policy link inside the body sentence and nowhere else", () => {
    render(<Harness initial={null} />);

    const links = within(strip()).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/privacy");
    // Rendered in place: the linked words sit inside the body paragraph, with
    // the rest of the sentence around them.
    const body = links[0].closest("p");
    expect(body).not.toBeNull();
    const sentence = body?.textContent ?? "";
    // The mechanism sentence, which is the one line of this copy that is a
    // promise rather than an explanation: nothing optional exists on the page
    // before an answer.
    expect(sentence).toContain("Only necessary cookies run until you choose");
    expect(sentence.endsWith(`${links[0].textContent}.`)).toBe(true);
  });

  // Naming Meta and TikTok here would make the strip a list of recipients that
  // nothing dates or versions. The policy names them; adding one is a policy
  // edit plus a CONSENT_VERSION bump.
  it("names no advertising platform", () => {
    render(<Harness initial={null} />);

    const text = strip().textContent;
    expect(text).not.toContain("Meta");
    expect(text).not.toContain("TikTok");
  });

  it("stores the chosen purposes and closes, without reloading", () => {
    render(<Harness initial={null} />);

    fireEvent.click(
      within(strip()).getByRole("button", {
        name: messages.consent.analyticsOnly,
      }),
    );

    expect(parseConsentCookie(getCookie(CONSENT_COOKIE_NAME))).toMatchObject({
      analytics: true,
      marketing: false,
    });
    expect(screen.queryByRole("region")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("adding a purpose to an existing answer does not reload", () => {
    render(
      <Harness
        initial={{ ...GRANTED_BOTH, marketing: false }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    fireEvent.click(
      within(strip()).getByRole("button", {
        name: messages.consent.analyticsAndMarketing,
      }),
    );

    expect(parseConsentCookie(getCookie(CONSENT_COOKIE_NAME))).toMatchObject({
      analytics: true,
      marketing: true,
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it("withdrawing a granted purpose clears the pixel cookies and reloads", () => {
    document.cookie = "_fbp=fb.1.abc;path=/";
    document.cookie = "_ttp=tt.1.abc;path=/";
    // The one that is easy to forget: TikTok's library reads this flag to
    // decide whether it may write `_ttp` at all, so leaving it behind re-arms
    // the withdrawal on the next visit.
    document.cookie = "_tt_enable_cookie=1;path=/";

    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    fireEvent.click(
      within(strip()).getByRole("button", { name: messages.consent.rejectAll }),
    );

    expect(parseConsentCookie(getCookie(CONSENT_COOKIE_NAME))).toMatchObject({
      analytics: false,
      marketing: false,
    });
    expect(document.cookie).not.toContain("_fbp");
    expect(document.cookie).not.toContain("_ttp");
    expect(document.cookie).not.toContain("_tt_enable_cookie");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps every button disabled once one is pressed", () => {
    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    const buttons = within(strip()).getAllByRole("button");
    fireEvent.click(buttons[0]);

    // The strip is still mounted — a withdrawal leaves it up until the reload
    // takes the document — so this is exactly the window a second click would
    // land in.
    for (const button of within(strip()).getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
 * The consent strip: its two screens, and the two ways an answer takes effect.
 * ============================================================================
 *
 * Four things are worth a test here and the rest is markup.
 *
 *   - **Two answers, and the order they sit in.** Refusing has to be exactly
 *     as easy as accepting, which is a legal requirement rather than a taste,
 *     and the DOM order is what puts Accept all rightmost in a row and topmost
 *     in a stack. A future tidy-up that reorders them on aesthetic grounds
 *     breaks both at once, silently.
 *   - **The customise panel stores exactly what its checkboxes say**, in every
 *     combination, and starts from the stored answer when the strip is
 *     reopened — a reopen that started from off would propose a withdrawal the
 *     reader never asked for.
 *   - **An upgrade is state; a withdrawal is a new document.** Granting a
 *     purpose only has to mount something. Revoking one cannot unmount a script
 *     that already installed itself on this page, so the page reloads — and
 *     where marketing is what was revoked, the pixels' own cookies go with it,
 *     while analytics alone leaves them be. Getting this wrong looks like it worked:
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

function press(name: string) {
  fireEvent.click(within(strip()).getByRole("button", { name }));
}

function purposeCheckbox(title: string) {
  return within(strip()).getByRole<HTMLInputElement>("checkbox", {
    name: title,
  });
}

const PURPOSES = messages.consent.purposes;

function storedAnswer() {
  return parseConsentCookie(getCookie(CONSENT_COOKIE_NAME));
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
  window.localStorage.clear();
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

  it("offers two answers, refusal first, with Customise after them", () => {
    render(<Harness initial={null} />);

    const buttons = within(strip()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      messages.consent.rejectAll,
      messages.consent.acceptAll,
      messages.consent.customise,
    ]);
    // The pair carries identical classes, so neither is the one we would like
    // pressed; Customise is a quiet text control, not a third answer.
    expect(buttons[0].className).toBe(buttons[1].className);
    expect(buttons[2].className).not.toBe(buttons[1].className);
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
    // Words before the link and a full stop after it: the linked words end a
    // sentence they are part of, rather than standing alone as a row.
    const label = links[0].textContent;
    expect(sentence.length).toBeGreaterThan(label.length);
    expect(sentence.endsWith(`${label}.`)).toBe(true);
  });

  // Naming the platform here would make the strip a list of recipients that
  // nothing dates or versions. The policy names it; adding one is a policy edit
  // plus a CONSENT_VERSION bump.
  it("names no advertising platform", () => {
    render(<Harness initial={null} />);

    const text = strip().textContent;
    expect(text).not.toContain("Meta");
    expect(text).not.toContain("Facebook");
    expect(text).not.toContain("Instagram");
  });

  it("Accept all grants both purposes and closes, without reloading", () => {
    render(<Harness initial={null} />);

    press(messages.consent.acceptAll);

    expect(storedAnswer()).toMatchObject({ analytics: true, marketing: true });
    expect(screen.queryByRole("region")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("Reject all grants nothing", () => {
    render(<Harness initial={null} />);

    press(messages.consent.rejectAll);

    expect(storedAnswer()).toMatchObject({ analytics: false, marketing: false });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("Customise opens the panel in the same strip, every checkbox off for a first answer", () => {
    render(<Harness initial={null} />);

    press(messages.consent.customise);

    // Necessary is shown on and cannot be changed; the two purposes start off.
    const necessary = purposeCheckbox(PURPOSES.necessary.title);
    expect(necessary.checked).toBe(true);
    expect(necessary.disabled).toBe(true);
    expect(purposeCheckbox(PURPOSES.analytics.title).checked).toBe(false);
    expect(purposeCheckbox(PURPOSES.marketing.title).checked).toBe(false);
    // Focus follows the reader into the panel rather than dropping to the page.
    expect(document.activeElement).toBe(
      purposeCheckbox(PURPOSES.analytics.title),
    );
    // Still the one non-modal strip, with the answers swapped for the panel.
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(
      within(strip()).queryByRole("button", {
        name: messages.consent.acceptAll,
      }),
    ).toBeNull();
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "Save choices stores analytics %s and marketing %s exactly as ticked",
    (analytics, marketing) => {
      render(<Harness initial={null} />);
      press(messages.consent.customise);

      if (analytics) fireEvent.click(purposeCheckbox(PURPOSES.analytics.title));
      if (marketing) fireEvent.click(purposeCheckbox(PURPOSES.marketing.title));
      press(messages.consent.saveChoices);

      expect(storedAnswer()).toMatchObject({ analytics, marketing });
      expect(screen.queryByRole("region")).toBeNull();
    },
  );

  it("a reopened panel starts from the stored answer", () => {
    render(<Harness initial={{ ...GRANTED_BOTH, analytics: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    press(messages.consent.customise);

    expect(purposeCheckbox(PURPOSES.analytics.title).checked).toBe(false);
    expect(purposeCheckbox(PURPOSES.marketing.title).checked).toBe(true);

    // Saving it untouched takes nothing away, so nothing reloads.
    press(messages.consent.saveChoices);
    expect(storedAnswer()).toMatchObject({ analytics: false, marketing: true });
    expect(reload).not.toHaveBeenCalled();
  });

  it("adding a purpose to an existing answer does not reload", () => {
    render(
      <Harness
        initial={{ ...GRANTED_BOTH, marketing: false }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    press(messages.consent.acceptAll);

    expect(storedAnswer()).toMatchObject({ analytics: true, marketing: true });
    expect(reload).not.toHaveBeenCalled();
  });

  it("unticking marketing in the panel clears the advertising cookies and reloads", () => {
    document.cookie = "_fbp=fb.1.abc;path=/";
    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    press(messages.consent.customise);
    fireEvent.click(purposeCheckbox(PURPOSES.marketing.title));
    press(messages.consent.saveChoices);

    expect(storedAnswer()).toMatchObject({ analytics: true, marketing: false });
    expect(document.cookie).not.toContain("_fbp");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // Analytics is Vercel's counting and nothing of either advertising vendor's,
  // so taking it away leaves what marketing granted exactly where it was. It
  // still reloads: Vercel's scripts stay installed on the document after their
  // components unmount.
  it("unticking analytics alone reloads and leaves the advertising cookies alone", () => {
    document.cookie = "_fbp=fb.1.abc;path=/";
    document.cookie = "_ga=GA1.1.1234567890.1790250509;path=/";
    window.localStorage.setItem("_gcl_ls", '{"schema":"gcl"}');
    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    press(messages.consent.customise);
    fireEvent.click(purposeCheckbox(PURPOSES.analytics.title));
    press(messages.consent.saveChoices);

    expect(storedAnswer()).toMatchObject({ analytics: false, marketing: true });
    expect(document.cookie).toContain("_fbp");
    expect(document.cookie).toContain("_ga=");
    expect(window.localStorage.getItem("_gcl_ls")).not.toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("withdrawing a granted purpose clears what both vendors left and reloads", () => {
    document.cookie = "_fbp=fb.1.abc;path=/";
    document.cookie = "_fbc=fb.1.abc.IwAR;path=/";
    document.cookie = "_fbleid=lead-1;path=/";
    // The half that is easy to forget, because it is not a cookie: clearing
    // `_fbp` while the library's own local-storage entries survive leaves the
    // device re-identifiable the moment the pixel is allowed to run again.
    window.localStorage.setItem("multiFbc", "[]");
    window.localStorage.setItem("fbevents^$last_event^$123", "1757500000000");
    window.localStorage.setItem("pixel_mutex:123", "held");
    // Google keeps a storage twin of the click id it also writes to `_gcl_aw`.
    window.localStorage.setItem("_gcl_ls", '{"schema":"gcl"}');
    window.localStorage.setItem("lastExternalReferrer", "empty");
    window.localStorage.setItem("sog-theme", "dark");

    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));

    press(messages.consent.rejectAll);

    expect(storedAnswer()).toMatchObject({ analytics: false, marketing: false });
    expect(document.cookie).not.toContain("_fbp");
    expect(document.cookie).not.toContain("_fbc");
    expect(document.cookie).not.toContain("_fbleid");
    expect(window.localStorage.getItem("multiFbc")).toBeNull();
    expect(window.localStorage.getItem("fbevents^$last_event^$123")).toBeNull();
    expect(window.localStorage.getItem("pixel_mutex:123")).toBeNull();
    expect(window.localStorage.getItem("_gcl_ls")).toBeNull();
    expect(window.localStorage.getItem("lastExternalReferrer")).toBeNull();
    // Ours is left alone: a withdrawal clears the advertiser's state, not the
    // reader's own preferences.
    expect(window.localStorage.getItem("sog-theme")).toBe("dark");
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

  it("keeps the panel disabled once Save choices is pressed", () => {
    render(<Harness initial={GRANTED_BOTH} />);
    fireEvent.click(screen.getByRole("button", { name: "reopen" }));
    press(messages.consent.customise);
    fireEvent.click(purposeCheckbox(PURPOSES.marketing.title));

    press(messages.consent.saveChoices);

    for (const control of [
      ...within(strip()).getAllByRole("button"),
      ...within(strip()).getAllByRole("checkbox"),
    ]) {
      expect(control).toHaveProperty("disabled", true);
    }
  });
});

/**
 * ============================================================================
 * The provider's standing invariant: no advertising cookie without marketing.
 * ============================================================================
 *
 * The withdrawal above is best-effort by construction — it runs while the
 * scripts it is clearing up after are still in the document, and a tag
 * container writes its session cookie on the way out, after the deletion and
 * before the reload lands. What makes a withdrawal *stick* is this: a document
 * where marketing is not granted clears the advertising cookies on mount, where
 * neither vendor has any code running to put them back.
 *
 * So the case that matters most is the property-suffixed `_ga_<id>`, the one
 * shape that survived the pre-reload clearing on a real browser; and the case
 * that would be a defect is clearing under a granted answer, because those
 * scripts are about to run in that very document.
 */
describe("ConsentProvider", () => {
  /** Nothing to render: the invariant is the provider's, not the strip's. */
  function mount(initial: ConsentState | null) {
    return render(
      <ConsentProvider initial={initial}>
        <span>body</span>
      </ConsentProvider>,
    );
  }

  /** What a container leaves behind: the client id and the session state. */
  function seedGoogleCookies() {
    document.cookie = "_ga=GA1.1.1234567890.1790250509;path=/";
    document.cookie =
      "_ga_0Q531TML1G=GS2.1.s1790250509$o1$g1$t1790250522;path=/";
  }

  it("clears the session cookie a container rewrote on its way out", () => {
    seedGoogleCookies();
    document.cookie = "_fbp=fb.1.abc;path=/";
    window.localStorage.setItem("multiFbc", "[]");
    // The click id Google keeps outside the cookie jar. Deleting `_gcl_aw` and
    // leaving this is deleting one copy of the same value.
    window.localStorage.setItem("_gcl_ls", '{"schema":"gcl"}');
    // Ours, and the reader's own: an invariant about the advertisers' state
    // must not reach past it.
    document.cookie = `${CONSENT_COOKIE_NAME}=stored;path=/`;
    window.localStorage.setItem("sog-theme", "dark");

    mount({
      analytics: true,
      marketing: false,
      decidedAt: "2026-09-01T08:00:00.000Z",
    });

    expect(document.cookie).not.toContain("_ga_0Q531TML1G");
    expect(document.cookie).not.toContain("_ga=");
    expect(document.cookie).not.toContain("_fbp");
    expect(window.localStorage.getItem("multiFbc")).toBeNull();
    expect(window.localStorage.getItem("_gcl_ls")).toBeNull();
    expect(document.cookie).toContain(CONSENT_COOKIE_NAME);
    expect(window.localStorage.getItem("sog-theme")).toBe("dark");
  });

  // A visitor who has never answered is the same case as a refusal: whatever is
  // on the document was not put there by anything this app was allowed to load.
  it("clears when no answer has been given at all", () => {
    seedGoogleCookies();

    mount(null);

    expect(document.cookie).not.toContain("_ga_0Q531TML1G");
    expect(document.cookie).not.toContain("_ga=");
  });

  // The one case where clearing would itself be the defect: the gated
  // components are loading those scripts into this very document, and React
  // has already run their effects by the time the provider's runs.
  it("leaves everything alone where marketing is granted", () => {
    seedGoogleCookies();
    window.localStorage.setItem("multiFbc", "[]");

    mount(GRANTED_BOTH);

    expect(document.cookie).toContain("_ga_0Q531TML1G");
    expect(document.cookie).toContain("_ga=");
    expect(window.localStorage.getItem("multiFbc")).toBe("[]");
  });

  // Reading `window.localStorage` throws outright where site data is blocked.
  // The cookies are the half that matters and they go first, so such a browser
  // still gets the whole of the invariant it is able to have.
  it("clears the cookies even where local storage cannot be read", () => {
    seedGoogleCookies();
    const own = Object.getOwnPropertyDescriptor(window, "localStorage");
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("site data blocked", "SecurityError");
      },
    });

    try {
      expect(() => mount(null)).not.toThrow();
      expect(document.cookie).not.toContain("_ga_0Q531TML1G");
      expect(reported).toHaveBeenCalled();
    } finally {
      // jsdom keeps `localStorage` on the prototype, so there may be no own
      // descriptor to put back — leaving the throwing one in place would break
      // every case after this.
      if (own) Object.defineProperty(window, "localStorage", own);
      else Reflect.deleteProperty(window, "localStorage");
      reported.mockRestore();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "@/../messages/en/common.json";
import landingSubscribe from "@/../messages/en/landingSubscribe.json";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";

/**
 * **The email sign-up section as a reader meets it**: the page's own heading
 * and button over the site's form, the button held disabled until an address
 * is typed and the consent box ticked (the names are optional), what is
 * posted, and the form giving way to "you are signed up" once it is accepted.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PAGE = id(500);
const HERO = id(1);
const FORM = id(2);

const SECTIONS: LandingSection[] = [
  { id: HERO, type: "hero" },
  { id: FORM, type: "subscribe", background: "default" },
];

const TEXTS: LandingSectionTexts = {
  [HERO]: { headline: "Gaming clubs in Espoo" },
  [FORM]: {
    eyebrow: "News",
    heading: "Hear about new clubs first",
    intro: "One email a month.",
    buttonLabel: "Keep me posted",
  },
};

const messages = { common, landingSubscribe };
const t = messages.landingSubscribe;

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ success: true })));
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage({
  preview = false,
  textLocale = "fi",
}: { preview?: boolean; textLocale?: "fi" | "en" } = {}) {
  return render(
    <NextIntlClientProvider locale="fi" messages={messages}>
      <LandingPageBody
        sections={SECTIONS}
        pictures={{}}
        testimonials={{}}
        guideIds={[]}
        sectionTexts={TEXTS}
        textLocale={textLocale}
        locale="fi"
        products={null}
        pageId={PAGE}
        preview={preview}
      />
    </NextIntlClientProvider>,
  );
}

function nameInput(label: string): HTMLElement {
  return screen.getByLabelText(label, { exact: false });
}

function fillIn(email: string, firstName = "", lastName = "") {
  fireEvent.change(screen.getByLabelText(t.email), { target: { value: email } });
  fireEvent.change(nameInput(t.firstName), { target: { value: firstName } });
  fireEvent.change(nameInput(t.lastName), { target: { value: lastName } });
}

function isDisabled(): boolean {
  return screen.getByRole("button", { name: "Keep me posted" }).hasAttribute("disabled");
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Keep me posted" }).closest("form")!);
  });
}

describe("the email sign-up section", () => {
  it("marks the form's own words with the page's language inside a body in another, the button label with the version's", () => {
    const { unmount } = renderPage({ textLocale: "en" });
    const form = screen.getByRole("button", { name: "Keep me posted" }).closest("form");
    expect(form?.closest("[lang]")?.getAttribute("lang")).toBe("fi");
    expect(screen.getByText("Keep me posted").getAttribute("lang")).toBe("en");
    // The page's own heading stays in the body's language.
    const heading = screen.getByRole("heading", { name: "Hear about new clubs first" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("en");
    unmount();
    renderPage();
    expect(screen.getByText("Keep me posted").hasAttribute("lang")).toBe(false);
    expect(document.querySelector("[lang]")).toBeNull();
  });

  it("draws the page's words over the form", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: "Hear about new clubs first" }),
    ).toBeTruthy();
    expect(screen.getByText("One email a month.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep me posted" })).toBeTruthy();
    expect(screen.getByRole("checkbox").getAttribute("aria-checked") ?? "false").toBe("false");
  });

  it("marks both names optional, on one row of the form", () => {
    renderPage();
    const first = nameInput(t.firstName);
    const last = nameInput(t.lastName);
    for (const input of [first, last]) {
      expect(input.hasAttribute("required")).toBe(false);
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label?.textContent).toContain(common.optional);
    }
    expect(first.getAttribute("autocomplete")).toBe("given-name");
    expect(last.getAttribute("autocomplete")).toBe("family-name");
  });

  it("enables the button with just the address and the consent, no names", () => {
    renderPage();
    expect(isDisabled()).toBe(true);

    fillIn("aino@example.com");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(isDisabled()).toBe(false);
  });

  it.each([
    ["the address", "  ", true],
    ["the consent", "aino@example.com", false],
  ])("keeps the button disabled, posting nothing, without %s", async (_, email, tick) => {
    renderPage();
    fillIn(email, "Aino", "Virtanen");
    if (tick) fireEvent.click(screen.getByRole("checkbox"));
    expect(isDisabled()).toBe(true);

    await submit();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the page, the form, the locale and the reader's words", async () => {
    renderPage();
    fillIn("aino@example.com", "Aino", "Virtanen");
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/landing-pages/subscribe");
    expect(JSON.parse(init.body)).toEqual({
      pageId: PAGE,
      sectionId: FORM,
      locale: "fi",
      email: "aino@example.com",
      firstName: "Aino",
      lastName: "Virtanen",
      consent: true,
    });
  });

  it("posts with no names typed, leaving them blank for the route to drop", async () => {
    renderPage();
    fillIn("aino@example.com");
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({
      email: "aino@example.com",
      firstName: "",
      lastName: "",
    });
  });

  it("says the reader is signed up in place of the form once it is accepted", async () => {
    renderPage();
    fillIn("aino@example.com");
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    await waitFor(() => expect(screen.getByText(t.successTitle)).toBeTruthy());
    expect(screen.getByText(t.successBody)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep me posted" })).toBeNull();
    // The page's own heading stays: the success answers its ask.
    expect(screen.getByRole("heading", { name: "Hear about new clubs first" })).toBeTruthy();
  });

  it.each([
    [400, t.invalid],
    [502, t.error],
  ])("says why a %i refused it and lets the reader try again", async (status, sentence) => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: "x" }), { status }));
    renderPage();
    fillIn("aino@example.com", "Aino");
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(sentence));
    expect(isDisabled()).toBe(false);
  });

  it("draws the form in the admin's preview with its button disabled, posting nothing", async () => {
    renderPage({ preview: true });
    fillIn("aino@example.com", "Aino");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(isDisabled()).toBe(true);
    await submit();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByText(t.successTitle)).toBeNull();
  });

  it("links the privacy policy from the consent sentence, in a new tab", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Privacy Policy" });
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

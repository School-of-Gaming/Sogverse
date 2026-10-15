import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";
import { NO_UTM_ATTRIBUTION, type UtmAttribution } from "@/lib/utm";
import { UtmProvider } from "@/providers";

/**
 * **The email sign-up section as a reader meets it**: the page's own heading
 * and button over the site's form, the anchor the confirmation link returns
 * to, the consent box that has to be ticked, what is posted, and the three
 * states the section can be in — the form, "check your inbox", and the thanks
 * a reader coming back from the confirmation link sees instead of the form.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PAGE = id(500);
const HERO = id(1);
const FORM = id(2);

const SECTIONS: LandingSection[] = [
  { id: HERO, type: "hero" },
  { id: FORM, type: "subscribe" },
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
  subscribed = false,
  utm = NO_UTM_ATTRIBUTION,
}: { subscribed?: boolean; utm?: UtmAttribution } = {}) {
  return render(
    <NextIntlClientProvider locale="fi" messages={messages}>
      <UtmProvider initialUtm={utm}>
        <LandingPageBody
          sections={SECTIONS}
          imagePaths={{}}
          sectionTexts={TEXTS}
          textLocale="fi"
          locale="fi"
          pageId={PAGE}
          subscribed={subscribed}
        />
      </UtmProvider>
    </NextIntlClientProvider>,
  );
}

function fillIn(email: string, firstName = "") {
  fireEvent.change(screen.getByLabelText(t.email), { target: { value: email } });
  if (firstName !== "") {
    fireEvent.change(screen.getByLabelText(new RegExp(t.firstName)), {
      target: { value: firstName },
    });
  }
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Keep me posted" }).closest("form")!);
  });
}

describe("the email sign-up section", () => {
  it("draws the page's words over the form, at the anchor the confirmation returns to", () => {
    renderPage();
    const heading = screen.getByRole("heading", { level: 2, name: "Hear about new clubs first" });
    expect(heading.closest("section")?.id).toBe(`signup-${FORM}`);
    expect(screen.getByText("One email a month.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep me posted" })).toBeTruthy();
    expect(screen.getByRole("checkbox").getAttribute("aria-checked") ?? "false").toBe("false");
  });

  it("refuses to post until the consent box is ticked", async () => {
    renderPage();
    fillIn("aino@example.com");
    await submit();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(t.consentRequired);
  });

  it("posts the page, the form, the locale, the reader's words and the visit's UTM values", async () => {
    renderPage({ utm: { ...NO_UTM_ATTRIBUTION, source: "newsletter" } });
    fillIn("aino@example.com", "Aino");
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
      consent: true,
      website: "",
      utm: { source: "newsletter" },
    });
    await waitFor(() => expect(screen.getByText(t.sentTitle)).toBeTruthy());
    expect(screen.getByText(t.sentBody.replace("{email}", "aino@example.com"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep me posted" })).toBeNull();
  });

  it.each([
    [429, t.rateLimited],
    [400, t.invalid],
    [502, t.error],
  ])("says why a %i refused it and lets the reader try again", async (status, sentence) => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: "x" }), { status }));
    renderPage();
    fillIn("aino@example.com");
    fireEvent.click(screen.getByRole("checkbox"));
    await submit();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(sentence));
    expect(
      screen.getByRole("button", { name: "Keep me posted" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("thanks a reader back from the confirmation link in place of the form", () => {
    renderPage({ subscribed: true });
    expect(screen.getByText(t.confirmedTitle)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep me posted" })).toBeNull();
    // The page's own heading stays: the thanks answers its ask.
    expect(screen.getByRole("heading", { name: "Hear about new clubs first" })).toBeTruthy();
  });

  it("links the privacy policy from the consent sentence, in a new tab", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Privacy Policy" });
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

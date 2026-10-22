import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enLandingPage from "@/../messages/en/landingPage.json";
import enRichText from "@/../messages/en/richText.json";
import fiLandingPage from "@/../messages/fi/landingPage.json";
import fiRichText from "@/../messages/fi/richText.json";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type { PublicGuide } from "@/services/guides/guides.contracts";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sog.test");
afterAll(() => vi.unstubAllEnvs());

/** The raw path the reader is on, as the register and sign-in links carry it. */
const PAGE_PATH = "/fi/tutustu/vanhempien-opas";
vi.mock("next/navigation", () => ({
  usePathname: () => PAGE_PATH,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const mockAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => mockAuth() }));

const en = { landingPage: enLandingPage, richText: enRichText };
const fi = { landingPage: fiLandingPage, richText: fiRichText };

/**
 * **A landing page's guide section** shows every reader the same section, and
 * only its download depends on who is looking: signed in, whatever the role,
 * a link to the download route in the page's language; signed out, the same
 * button in the same place, disabled, with why and the way to an account that
 * comes back to this page. Pinned too: the file's facts — size, and its
 * language when the fallback picked another — and a guide the read did not
 * answer leaving the section out.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const GUIDE_SECTION = id(2);
const GUIDE = id(3);

const SECTIONS: LandingSection[] = [
  { id: HERO, type: "hero" },
  { id: GUIDE_SECTION, type: "guide", guideId: GUIDE },
];

const TEXTS: LandingSectionTexts = {
  [HERO]: { headline: "Gaming, explained" },
  [GUIDE_SECTION]: {
    eyebrow: "Free guide",
    heading: "A parent's guide to gaming",
    description: "Everything we tell parents, in one PDF.",
  },
};

const MB = 1024 * 1024;

const BOTH: PublicGuide = {
  id: GUIDE,
  files: [
    { locale: "en", byteSize: Math.round(2.4 * MB) },
    { locale: "fi", byteSize: Math.round(1.2 * MB) },
  ],
};

function renderGuide({
  guides = { [GUIDE]: BOTH },
  locale = "en",
}: { guides?: Record<string, PublicGuide>; locale?: SupportedLocale } = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "fi" ? fi : en}>
      <LandingPageBody
        sections={SECTIONS}
        imagePaths={{}}
        testimonials={{}}
        guides={guides}
        sectionTexts={TEXTS}
        textLocale={locale}
        locale={locale}
      />
    </NextIntlClientProvider>,
  );
}

function signedIn(role: "admin" | "customer" | "gamer" | "gedu") {
  mockAuth.mockReturnValue({
    user: { id: id(50), email: "reader@example.com" },
    profile: { id: id(50), role },
    isLoading: false,
  });
}

describe("the guide section", () => {
  beforeEach(() => {
    mockAuth.mockReturnValue({ user: null, profile: null, isLoading: false });
  });

  it("shows its words to every reader", () => {
    renderGuide();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "A parent's guide to gaming",
    );
    expect(screen.getByText("Free guide")).toBeTruthy();
    expect(screen.getByText("Everything we tell parents, in one PDF.")).toBeTruthy();
  });

  it.each(["admin", "customer", "gamer", "gedu"] as const)(
    "downloads in the page's language for a signed-in %s",
    (role) => {
      signedIn(role);
      renderGuide();
      const download = screen.getByRole("link", { name: "Download the guide" });
      expect(download.getAttribute("href")).toBe(`/api/guides/${GUIDE}/download?locale=en`);
      expect(download.hasAttribute("download")).toBe(true);
      expect(screen.queryByRole("link", { name: "Create an account" })).toBeNull();
    },
  );

  it("disables the download for a signed-out reader, says why, and leads back to this page", () => {
    renderGuide();
    const button = screen.getByRole("button", { name: "Download the guide" });
    expect(button.hasAttribute("disabled")).toBe(true);
    const reason = screen.getByText(
      "You need a free School of Gaming account to download the guide.",
    );
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);

    const back = `redirect=${encodeURIComponent(PAGE_PATH)}`;
    expect(screen.getByRole("link", { name: "Create an account" }).getAttribute("href")).toBe(
      `/register?${back}`,
    );
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      `/login?${back}`,
    );
  });

  it("draws the signed-out look while the session is still being looked for", () => {
    mockAuth.mockReturnValue({ user: null, profile: null, isLoading: true });
    renderGuide();
    expect(screen.getByRole("button", { name: "Download the guide" })).toBeTruthy();
  });

  it("states the file's size, in the page's number conventions", () => {
    renderGuide();
    expect(screen.getByText("PDF · 2.4 MB")).toBeTruthy();
  });

  it("names the file's language when the fallback picked another", () => {
    signedIn("customer");
    renderGuide({ guides: { [GUIDE]: { id: GUIDE, files: [BOTH.files[0]] } }, locale: "fi" });
    expect(screen.getByText("PDF · 2,4 Mt · englanniksi")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Lataa opas" }).getAttribute("href"),
    ).toBe(`/api/guides/${GUIDE}/download?locale=fi`);
  });

  it("leaves the section out when the read answered nothing for its guide", () => {
    const { container } = renderGuide({ guides: {} });
    expect(container.querySelectorAll("section")).toHaveLength(1);
  });
});

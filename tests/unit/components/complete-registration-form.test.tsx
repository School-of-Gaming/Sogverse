import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

/**
 * The finish page's form: the register form's questions minus the address and
 * password a Google account already supplied. What this pins is what it must
 * share with the register forms — the terms refusal before anything is sent,
 * the prefilled but editable names, and each variant posting to its own
 * completion route — plus the one thing it adds: a full-page navigation once
 * the account is registered.
 *
 * Translations echo the key, so assertions are about which key the form
 * reaches for.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    // A `link` tag renders its link around the key, so the switch line's
    // address can be asserted on; every other rich string is just its key.
    t.rich = (
      key: string,
      values?: { link?: (chunks: string) => React.ReactNode },
    ) => (values?.link ? values.link(key) : key);
    return t;
  },
  useLocale: () => "fi",
}));

// The hook's own job — the allowlist, then the redirect or the fallback — is
// not this file's; what is, is which redirect the form hands it and which
// fallback it asks for.
const mockUseAuthRedirect = vi.fn<(redirect: string | null) => void>();
const mockNavigateAfterAuth = vi.fn();
vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: (redirect: string | null) => {
    mockUseAuthRedirect(redirect);
    return {
      redirect,
      safeRedirect: redirect,
      status: null,
      navigateAfterAuth: (...args: unknown[]) => mockNavigateAfterAuth(...args),
    };
  },
}));

const mockPushGtmEvent = vi.fn();
vi.mock("@/lib/gtm", () => ({
  pushGtmEvent: (...args: unknown[]) => mockPushGtmEvent(...args),
}));

// Fields whose own dependencies (the locations table, a phone library, the
// game-account lookups) this file has no use for.
vi.mock("@/components/locations/home-location-field", () => ({
  HomeLocationField: () => <div />,
}));
vi.mock("@/components/gedu/coverage-areas-field", () => ({
  CoverageAreasField: () => <div />,
}));
vi.mock("@/components/ui/phone-input", () => ({
  InternationalPhoneInput: () => <div />,
}));
vi.mock("@/components/ui/spoken-language-checkboxes", () => ({
  SpokenLanguageCheckboxes: () => <div />,
}));
vi.mock("@/components/game-account", () => ({
  GAME_PLATFORMS: {
    minecraft: { name: "Minecraft" },
    roblox: { name: "Roblox" },
  },
  GameUsernameEditableRow: () => <div />,
}));

import { CompleteRegistrationForm } from "@/components/auth/complete-registration-form";
import { ROUTES } from "@/lib/constants";

const mockFetch = vi.fn();

const UTM = { source: "Lynx", medium: null, campaign: "lynx-summer-a" };

function renderForm(
  variant: "parent" | "gedu",
  { redirect = null }: { redirect?: string | null } = {},
) {
  const view = render(
    <CompleteRegistrationForm
      variant={variant}
      email="parent@example.test"
      initialFirstName="Marja"
      initialLastName="Virtanen"
      utm={UTM}
      redirect={redirect}
    />,
  );
  const form = view.container.querySelector<HTMLFormElement>(
    'form:not([action="/api/auth/signout"])',
  );
  if (!form) throw new Error("no form");
  const input = (id: string) => {
    const found = view.container.querySelector<HTMLInputElement>(`#${id}`);
    if (!found) throw new Error(`no #${id}`);
    return found;
  };
  const submitButton = () => {
    const found = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!found) throw new Error("no submit");
    return found;
  };
  const submit = () =>
    act(async () => {
      fireEvent.submit(form);
    });
  return { view, input, submit, submitButton };
}

function tickTerms(view: ReturnType<typeof render>) {
  const [terms] = view.container.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  fireEvent.click(terms);
}

function sentBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls[0];
  return JSON.parse(init.body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
});

describe("CompleteRegistrationForm", () => {
  it("prefills the names Google gave, and shows the address as settings does: disabled", () => {
    const { input } = renderForm("parent");

    expect(input("firstName").value).toBe("Marja");
    expect(input("lastName").value).toBe("Virtanen");
    expect(input("email").value).toBe("parent@example.test");
    expect(input("email").disabled).toBe(true);
  });

  it("offers a sign-out that is a form post of its own", () => {
    const { view } = renderForm("parent");

    const signOut = view.container.querySelector<HTMLFormElement>(
      'form[action="/api/auth/signout"]',
    );
    expect(signOut?.method).toBe("post");
  });

  it("refuses the parent submit without the terms tick, and posts nothing", async () => {
    const { view, submit, submitButton } = renderForm("parent");

    await submit();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("register.termsRequired");
    expect(submitButton().disabled).toBe(false);
  });

  it("posts the parent's answers to the parent route and navigates in full", async () => {
    const { view, submit, submitButton } = renderForm("parent");
    tickTerms(view);

    await submit();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/auth/complete-registration");
    expect(sentBody()).toEqual({
      firstName: "Marja",
      lastName: "Virtanen",
      locale: "fi",
      utm: { source: "Lynx", campaign: "lynx-summer-a" },
      marketingConsent: false,
      acceptedTerms: true,
    });
    expect(mockPushGtmEvent).toHaveBeenCalledTimes(1);
    expect(mockNavigateAfterAuth).toHaveBeenCalledWith(ROUTES.selectProfile);
    // The document is unloading: the button stays busy.
    expect(submitButton().disabled).toBe(true);
  });

  it("re-enables and says why when the route refuses", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 }),
    );
    const { view, submit, submitButton } = renderForm("parent");
    tickTerms(view);

    await submit();

    expect(view.container.textContent).toContain("Invalid request");
    expect(submitButton().disabled).toBe(false);
    expect(mockNavigateAfterAuth).not.toHaveBeenCalled();
  });

  it("posts the Gedu variant to the Gedu route, with no terms to tick", async () => {
    const { view, submit } = renderForm("gedu");

    expect(
      view.container.querySelectorAll('input[type="checkbox"]'),
    ).toHaveLength(0);

    await submit();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/gedu/complete-registration");
    expect(sentBody()).toMatchObject({
      firstName: "Marja",
      lastName: "Virtanen",
      locale: "fi",
      spokenLanguages: [],
      locationIds: [],
      utm: { source: "Lynx", campaign: "lynx-summer-a" },
    });
    expect(mockPushGtmEvent).not.toHaveBeenCalled();
    expect(mockNavigateAfterAuth).toHaveBeenCalledWith(ROUTES.gedu.dashboard);
  });

  it.each(["parent", "gedu"] as const)(
    "hands the %s variant's navigation the product page it came from",
    async (variant) => {
      const { view, submit } = renderForm(variant, {
        redirect: "/fi/kauppa/abc-123",
      });
      if (variant === "parent") tickTerms(view);

      await submit();

      expect(mockUseAuthRedirect).toHaveBeenLastCalledWith("/fi/kauppa/abc-123");
      expect(mockNavigateAfterAuth).toHaveBeenCalledTimes(1);
    },
  );

  function findSwitchLink(view: ReturnType<typeof render>) {
    return [...view.container.querySelectorAll("a")].find((anchor) =>
      anchor.textContent.startsWith("switchTo"),
    );
  }

  it("gives the parent form no way to the Gedu one", () => {
    // A Gedu registers from the Gedu registration page. Someone on the parent
    // form started anywhere else, and the parent form is where they belong.
    const { view } = renderForm("parent", { redirect: "/shop/abc-123" });

    expect(findSwitchLink(view)).toBeUndefined();
  });

  it("offers the Gedu form a way to the parent one, asked for outright", () => {
    // A bare address would fall back to the intent cookie, which says Gedu.
    const { view } = renderForm("gedu", { redirect: "/shop/abc-123" });

    const link = findSwitchLink(view);
    if (!link) throw new Error("no switch link");
    const url = new URL(link.getAttribute("href") ?? "", "https://internal.invalid");
    expect(link.textContent).toBe("switchToParent");
    expect(url.pathname).toBe(ROUTES.completeRegistration);
    expect(url.searchParams.get("as")).toBe("parent");
    expect(url.searchParams.get("utm_campaign")).toBe("lynx-summer-a");
    expect(url.searchParams.get("redirect")).toBe("/shop/abc-123");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { mockSupabaseClient } from "../../setup";

/**
 * **The Gedu register page's Google button asks for the Gedu finish page.** A
 * Google account arrives with none of the fields on the form, so the callback
 * sends a new one to the finish page — and only a `next` carrying `as=gedu`
 * gets the Gedu variant of it.
 *
 * The wrapped navigation mock builds paths with no locale prefix, so the
 * assertion is about the route and its query, not the language.
 *
 * The password path's one form-side refusal of its own, a Gedu with no spoken
 * language, is pinned at the end: the finish page's Gedu variant shares it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "fi",
}));

let mockUtm: { source: string | null; medium: string | null; campaign: string | null } = {
  source: null,
  medium: null,
  campaign: null,
};

vi.mock("@/providers", () => ({
  useAuth: () => ({
    freezeUntilNavigation: vi.fn(),
    unfreezeAuthState: vi.fn(),
  }),
  useUtm: () => mockUtm,
}));

vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    safeRedirect: null,
    status: null,
    navigateAfterAuth: vi.fn(),
  }),
}));

// The fields this file is not about, and whose own dependencies (a phone
// library, the locations table, the game-account lookups) it has no use for.
vi.mock("@/components/gedu/coverage-areas-field", () => ({
  CoverageAreasField: () => <div />,
}));
vi.mock("@/components/ui/phone-input", () => ({
  InternationalPhoneInput: () => <div />,
}));
// One button speaking Finnish: what the form needs from the boxes is a
// selection, not the boxes.
vi.mock("@/components/ui/spoken-language-checkboxes", () => ({
  SpokenLanguageCheckboxes: ({ onChange }: { onChange: (codes: string[]) => void }) => (
    <button type="button" onClick={() => onChange(["fi"])}>
      speaks-finnish
    </button>
  ),
}));
vi.mock("@/components/game-account", () => ({
  GAME_PLATFORMS: {
    minecraft: { name: "Minecraft" },
    roblox: { name: "Roblox" },
  },
  GameUsernameEditableRow: () => <div />,
}));

import { RegisterGeduForm } from "@/components/auth/register-gedu-form";

const signInWithOAuth = vi.mocked(mockSupabaseClient.auth.signInWithOAuth);

/** Whether `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUtm = { source: null, medium: null, campaign: null };
  signInWithOAuth.mockResolvedValue({
    data: { provider: "google", url: "https://accounts.google.test" },
    error: null,
  });
});

describe("the Gedu register page's Google button", () => {
  // The certification alert is read first, because it is context for either
  // path; the Google button comes directly after it and before any field, then
  // the "or" divider, then the fields, then the submit at the bottom.
  it("sits under the certification alert, above the divider, the fields and the submit", () => {
    const view = render(<RegisterGeduForm redirect={null} />);

    const alert = screen.getByText("registerGedu.certificationAlertTitle");
    const google = screen.getByRole("button", { name: "continue" });
    const divider = screen.getByText("or");
    const firstName = view.container.querySelector("#firstName");
    if (!firstName) throw new Error("no first name field");
    const submit = screen.getByRole("button", { name: "createAccount" });

    expect(precedes(alert, google)).toBe(true);
    expect(precedes(google, divider)).toBe(true);
    expect(precedes(divider, firstName)).toBe(true);
    expect(precedes(firstName, submit)).toBe(true);
  });

  it("sends the Gedu finish page as next", async () => {
    render(<RegisterGeduForm redirect={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "continue" }));
    });

    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const [args] = signInWithOAuth.mock.calls[0];
    expect(args.provider).toBe("google");
    const target = new URL(args.options.redirectTo);
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe("/api/auth/callback");

    const next = target.searchParams.get("next");
    if (!next) throw new Error("no next");
    const nextUrl = new URL(next, "https://internal.invalid");
    expect(nextUrl.pathname).toBe("/complete-registration");
    expect(nextUrl.searchParams.get("as")).toBe("gedu");
  });

  // The round trip through Google unloads the tab holding the visit's
  // attribution in memory, so it travels on the finish page's address.
  it("carries the visit's attribution on next", async () => {
    mockUtm = { source: "recruit", medium: null, campaign: "gedu-autumn" };
    render(<RegisterGeduForm redirect={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "continue" }));
    });

    const [args] = signInWithOAuth.mock.calls[0];
    const next = new URL(args.options.redirectTo).searchParams.get("next");
    if (!next) throw new Error("no next");
    const nextUrl = new URL(next, "https://internal.invalid");
    expect(nextUrl.searchParams.get("as")).toBe("gedu");
    expect(nextUrl.searchParams.get("utm_source")).toBe("recruit");
    expect(nextUrl.searchParams.get("utm_campaign")).toBe("gedu-autumn");
    expect(nextUrl.searchParams.has("utm_medium")).toBe(false);
  });
});

describe("the Gedu register form's spoken languages", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
  });

  function fillAccount(container: HTMLElement) {
    const set = (id: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`no #${id}`);
      fireEvent.change(input, { target: { value } });
    };
    set("firstName", "Aino");
    set("lastName", "Virtanen");
    set("email", "aino@example.test");
    set("password", "a-long-password");
    set("confirmPassword", "a-long-password");
  }

  const submit = (container: HTMLElement) =>
    act(async () => {
      const form = container.querySelector("form");
      if (!form) throw new Error("no form");
      fireEvent.submit(form);
    });

  // A Gedu is offered substitutions only in a language they speak, so the
  // form refuses none — before anything is sent, and leaving it usable.
  it("refuses a submit with no spoken language, and posts nothing", async () => {
    const view = render(<RegisterGeduForm redirect={null} />);
    fillAccount(view.container);

    await submit(view.container);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByText("registerGedu.spokenLanguagesRequired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "createAccount" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("posts once a language is chosen", async () => {
    const view = render(<RegisterGeduForm redirect={null} />);
    fillAccount(view.container);
    fireEvent.click(screen.getByRole("button", { name: "speaks-finnish" }));

    await submit(view.container);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/gedu/register");
    expect(JSON.parse(init.body)).toMatchObject({ spokenLanguages: ["fi"] });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

/**
 * **Signing in seeds the `locale` cookie from the profile — the one deliberate
 * exception to "persistence is picker-only".**
 *
 * The form ends in a full-page navigation to a *bare* dashboard path, and a
 * bare path is resolved by the cookie → `Accept-Language` → English ladder. So
 * on a fresh device — a new phone, a cleared browser, a school computer — the
 * reader's stored language reaches the URL only if sign-in puts it in the
 * cookie first. Password sign-in happens in the browser, so this is the one of
 * the three auth flows that writes it client-side.
 *
 * Two properties are load-bearing and both are pinned below: the write happens
 * **before** the navigation (the document is about to unload, and a write that
 * loses that race is a preference silently dropped), and a null
 * `profiles.locale` — which means "auto-detect from the browser" — writes
 * nothing, because the ladder's header leg is exactly what that reader asked
 * for.
 */

const signInWithPassword = vi.fn<
  (credentials: { email: string; password: string }) => Promise<unknown>
>();

/**
 * The profile row the form reads after a successful sign-in. A local stub
 * rather than the shared client from `tests/setup.ts`, for the reason given in
 * `login-form-identifier.test.tsx`: the shared `from()` chain resolves
 * `single()` to undefined, which this form destructures.
 */
const profileRow = {
  data: { role: "customer", locale: "fi" } as {
    role: string;
    locale: string | null;
  } | null,
};

/** The columns the form asked `profiles` for, as one string. */
const selectedColumns = vi.fn<(columns: string) => void>();

vi.mock("@/lib/supabase/client", () => ({
  getClient: () => ({
    auth: { signInWithPassword },
    from: () => ({
      select: (columns: string) => {
        selectedColumns(columns);
        return {
          eq: () => ({ single: () => Promise.resolve(profileRow) }),
        };
      },
    }),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useAuth: () => ({
    freezeUntilNavigation: vi.fn(),
    unfreezeAuthState: vi.fn(),
  }),
}));

/**
 * What the cookie jar looked like at the moment the form navigated. Read
 * inside the navigation mock rather than after it, because "after" cannot tell
 * a write that beat the unload from one that would have lost to it.
 */
let cookieAtNavigation: string | undefined;
const mockNavigateAfterAuth = vi.fn(() => {
  cookieAtNavigation = document.cookie;
});

vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    status: null,
    navigateAfterAuth: () => mockNavigateAfterAuth(),
  }),
}));

import { LoginForm } from "@/components/auth/login-form";

function renderForm() {
  const view = render(<LoginForm redirect={null} />);
  const form = view.container.querySelector("form");
  if (!form) throw new Error("no form");

  return {
    fill(id: string, value: string) {
      const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`no field #${id}`);
      fireEvent.change(input, { target: { value } });
    },
    submit: () =>
      act(async () => {
        fireEvent.submit(form);
      }),
  };
}

async function signIn() {
  const view = renderForm();
  view.fill("identifier", "parent@example.test");
  view.fill("password", "a-long-enough-password");
  await view.submit();
}

function localeCookie(): string | undefined {
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "locale=;path=/;max-age=0";
  cookieAtNavigation = undefined;
  profileRow.data = { role: "customer", locale: "fi" };
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "3f2b1c90-6a4e-4d21-9f77-0c8b5a1e2d34" } },
    error: null,
  });
});

describe("the locale cookie a password sign-in leaves behind", () => {
  it("writes the profile's locale, and writes it before navigating", async () => {
    await signIn();

    expect(localeCookie()).toBe("fi");
    expect(mockNavigateAfterAuth).toHaveBeenCalledTimes(1);
    expect(cookieAtNavigation).toContain("locale=fi");
  });

  it("leaves the cookie alone when the profile says auto-detect", async () => {
    // Null is a real answer, not a missing one: this reader asked to follow
    // whatever language their browser negotiates, so writing anything here
    // would freeze a guess into a preference they never made.
    profileRow.data = { role: "customer", locale: null };
    document.cookie = "locale=sv;path=/";

    await signIn();

    expect(localeCookie()).toBe("sv");
  });

  it("ignores a stored value we do not ship", async () => {
    // The column is plain nullable text, so a value can outlive the locale it
    // named. An unsupported one is not written on: it would put a segment in
    // the URL that resolves to no locale at all.
    profileRow.data = { role: "customer", locale: "de" };

    await signIn();

    expect(localeCookie()).toBeUndefined();
  });

  it("reads the locale on the profile query the form already made", async () => {
    // The plan's one accepted cost here was an extra fetch per device; the
    // form was already reading this row for the post-login destination, so
    // `locale` joins that select and sign-in costs no additional round trip.
    await signIn();

    expect(selectedColumns).toHaveBeenCalledTimes(1);
    expect(selectedColumns).toHaveBeenCalledWith("role, locale");
  });
});

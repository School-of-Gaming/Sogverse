import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { mockSupabaseClient } from "../../setup";

/**
 * Parent registration moved off `supabase.auth.signUp` and onto a server route,
 * because only the server can mint the verification token and send the welcome
 * mail. This file pins what that move must not have cost, and the three things
 * it added.
 *
 * What must not have changed:
 *  - the button is busy from the click all the way to the navigation, and comes
 *    back only on the outcomes where the parent has to try again;
 *  - success is a FULL-PAGE navigation, because the browser Supabase client
 *    seeds its session from cookies at construction and only a document unload
 *    rebuilds it (root CLAUDE.md, auth state);
 *  - a registration that fails leaves the form usable and says why.
 *
 * What is new:
 *  - the request carries the optional home location and the UI locale, which
 *    used to be a second client write and nothing at all respectively;
 *  - a 409 is the "you already have an account" case, and it gets the
 *    translated message rather than whatever the server wrote;
 *  - a 400 carrying the weak-password code is the other refusal the parent can
 *    act on, and it too gets its own translated message — the generic one tells
 *    them to go and sign in, which is wrong when no account exists;
 *  - the optional marketing box, which starts unticked and whose answer travels
 *    in the same body as an explicit boolean either way.
 *
 * The translations are stubbed to echo the key, so the assertions are about
 * which key the form reaches for, not about wording in `messages/`.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "fi",
}));

const mockFreezeUntilNavigation = vi.fn();
const mockUnfreezeAuthState = vi.fn();
vi.mock("@/providers", () => ({
  useAuth: () => ({
    freezeUntilNavigation: mockFreezeUntilNavigation,
    unfreezeAuthState: mockUnfreezeAuthState,
  }),
  useReferralCode: () => "paris-nord",
}));

// The navigation itself is the hook's job and jsdom cannot perform it; what
// this file is about is that the form asks for it, once, with the right
// fallback.
const mockNavigateAfterAuth = vi.fn();
vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    status: null,
    navigateAfterAuth: (...args: unknown[]) => mockNavigateAfterAuth(...args),
  }),
}));

// The picker browses the locations table; the form only needs a value from it.
vi.mock("@/components/locations/home-location-field", () => ({
  HomeLocationField: () => <div data-testid="home-location" />,
}));

import { RegisterForm } from "@/components/auth/register-form";
import { ROUTES } from "@/lib/constants";

const mockFetch = vi.fn();

function renderForm() {
  const view = render(<RegisterForm redirect={null} />);

  function fill(id: string, value: string) {
    const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`no field #${id}`);
    fireEvent.change(input, { target: { value } });
  }

  fill("firstName", "Marja");
  fill("lastName", "Virtanen");
  fill("email", "parent@example.test");
  fill("password", "a-long-enough-password");
  fill("confirmPassword", "a-long-enough-password");

  const form = view.container.querySelector("form");
  if (!form) throw new Error("no form");

  function checkbox(id: string) {
    const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`no checkbox #${id}`);
    return input;
  }

  return {
    ...view,
    fill,
    checkbox,
    // Async, because the handler awaits the route and then the sign-in: the
    // state updates that follow both land after the event has been dispatched.
    submit: () =>
      act(async () => {
        fireEvent.submit(form);
      }),
    button: () =>
      view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!,
  };
}

/** The JSON body the form POSTed. */
function postedBody(): Record<string, unknown> {
  return JSON.parse(mockFetch.mock.calls[0][1].body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ userId: "u1" }), { status: 200 }),
  );
  mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({ error: null });
});

describe("RegisterForm", () => {
  it("registers through the route, not through the browser signUp", async () => {
    const form = renderForm();

    await form.submit();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("/api/auth/register");
    // The old path. It cannot mint a verification token or send mail, which is
    // the whole reason this moved.
    expect(mockSupabaseClient.auth.signUp).not.toHaveBeenCalled();
  });

  it("sends the names, the UI locale and the referral code it was given", async () => {
    const form = renderForm();

    await form.submit();

    expect(postedBody()).toMatchObject({
      email: "parent@example.test",
      firstName: "Marja",
      lastName: "Virtanen",
      // The profile has no stored preference yet — it is created by this very
      // request — so the locale the form is being read in is the best answer
      // anyone has for the welcome mail.
      locale: "fi",
      referralCode: "paris-nord",
    });
  });

  it("omits the home location when none was picked", async () => {
    const form = renderForm();

    await form.submit();

    expect(postedBody()).not.toHaveProperty("homeLocationId");
  });

  // -- The optional marketing box --

  it("starts with the marketing box unticked", () => {
    const form = renderForm();

    // An opt-in that arrives pre-ticked is not an opt-in.
    expect(form.checkbox("marketingConsent").checked).toBe(false);
  });

  it("sends the opt-in when the parent ticks the box", async () => {
    const form = renderForm();
    fireEvent.click(form.checkbox("marketingConsent"));

    await form.submit();

    expect(postedBody().marketingConsent).toBe(true);
  });

  // The schema takes the field as optional so a client that predates the box
  // can still register — but this form always has an answer, and an untouched
  // box is a decline the parent made rather than a question nobody asked. So
  // the key is present on every request this form makes, and the route's
  // absent-means-false reading is never exercised from here.
  it("always sends an explicit boolean, false when the box was left alone", async () => {
    const form = renderForm();

    await form.submit();

    expect(postedBody()).toHaveProperty("marketingConsent");
    expect(postedBody().marketingConsent).toBe(false);
  });

  // Disabled from the loading flag like every other control on the form, so a
  // parent cannot change their answer between the POST and the navigation it
  // leads to. The success path leaves the flag set — the document is unloading
  // — which is the frame this reads.
  it("leaves the marketing box disabled through the navigation", async () => {
    const form = renderForm();

    await form.submit();

    expect(form.checkbox("marketingConsent").disabled).toBe(true);
  });

  it("signs in and hands the navigation its fallback on success", async () => {
    const form = renderForm();

    await form.submit();

    // Frozen before the sign-in, because Supabase fires SIGNED_IN synchronously
    // inside the call — freezing afterwards would be too late to stop the
    // header flashing signed-in chrome.
    expect(mockFreezeUntilNavigation).toHaveBeenCalledTimes(1);
    expect(mockSupabaseClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "parent@example.test",
      password: "a-long-enough-password",
    });
    expect(mockNavigateAfterAuth).toHaveBeenCalledWith(ROUTES.selectProfile);
  });

  it("leaves the button busy through the navigation", async () => {
    const form = renderForm();

    await form.submit();

    // The document is unloading; re-enabling here is what lets a fast parent
    // register twice.
    expect(form.button().disabled).toBe(true);
  });

  it("shows the translated already-registered message on a 409", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "That email is already registered." }), {
        status: 409,
      }),
    );
    const form = renderForm();

    await form.submit();

    // The status is what the form keys on — not the server's sentence, which is
    // in no particular language.
    expect(form.container.textContent).toContain("register.accountExists");
    expect(form.button().disabled).toBe(false);
    expect(mockSupabaseClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  // The status is a plain 400 — nothing is conflicting — so the code is the
  // only thing separating this from the generic refusal, whose sentence would
  // send the parent looking for a sign-in they never made.
  it("shows the translated weak-password message when the route sends that code", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "That password was refused as too weak.",
          code: "WEAK_PASSWORD",
        }),
        { status: 400 },
      ),
    );
    const form = renderForm();

    await form.submit();

    expect(form.container.textContent).toContain("register.weakPassword");
    expect(form.container.textContent).not.toContain("refused as too weak");
    expect(form.button().disabled).toBe(false);
    expect(mockSupabaseClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the route's own message on any other refusal", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "That email could not be registered." }), {
        status: 400,
      }),
    );
    const form = renderForm();

    await form.submit();

    expect(form.container.textContent).toContain(
      "That email could not be registered.",
    );
    expect(form.button().disabled).toBe(false);
  });

  it("re-enables and unfreezes when the sign-in that follows fails", async () => {
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const form = renderForm();

    await form.submit();

    expect(mockUnfreezeAuthState).toHaveBeenCalled();
    expect(form.button().disabled).toBe(false);
    expect(mockNavigateAfterAuth).not.toHaveBeenCalled();
  });

  it("refuses locally, and posts nothing, when the passwords disagree", async () => {
    const form = renderForm();
    form.fill("confirmPassword", "something-else");

    await form.submit();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(form.container.textContent).toContain("Passwords do not match");
    expect(form.button().disabled).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { mockSupabaseClient } from "../../setup";

/**
 * **When a registration counts as a sign-up.**
 *
 * What the event means is the whole of it: an account exists and nothing has
 * been signed up *for*. So it is pushed on the one outcome where that is true —
 * the route answered yes — and on none of the refusals, where no account was
 * created for anything to be reported about.
 *
 * The moment matters as much as the outcome. The push goes out before the
 * sign-in that follows it, which puts a full network round trip between the
 * event and the navigation that unloads the document. Reversing the two would
 * leave a tag racing the unload for no gain, and the account exists either way
 * — which is why a *failed* sign-in does not retract the report.
 *
 * **This is the parent door, and it is the only registration that reports
 * anything.** A gedu registration is an application to work with us rather than
 * a family signing up for a thing, so it is not a conversion: its form posts to
 * its own route, that route reports nothing on the server side, and the form
 * pushes nothing here. There is no event to assert on, which is the point — if
 * the push ever appears on that form, it was copied across from this one.
 *
 * As everywhere else, the transport is not the subject: whether a container was
 * ever armed is `pushGtmEvent`'s decision and has its own coverage.
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
  useUtm: () => ({ source: null, medium: null, campaign: null }),
}));

vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    status: null,
    navigateAfterAuth: vi.fn(),
  }),
}));

// The picker browses the locations table; nothing here needs a value from it.
vi.mock("@/components/locations/home-location-field", () => ({
  HomeLocationField: () => <div data-testid="home-location" />,
}));

const pushed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gtm", () => ({
  pushGtmEvent: (event: unknown) => pushed(event),
}));

import { RegisterForm } from "@/components/auth/register-form";
import { ROUTES } from "@/lib/constants";

const mockFetch = vi.fn();

/** A rendered form with every required answer already given. */
function renderForm({ acceptTerms = true }: { acceptTerms?: boolean } = {}) {
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

  // The required acknowledgement is the first of the two boxes — the same
  // by-position lookup the sibling suite uses, because `CheckboxRow` generates
  // its own ids.
  const termsBox = () =>
    view.container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )[0];

  if (acceptTerms) fireEvent.click(termsBox());

  return {
    ...view,
    fill,
    // Async, because the handler awaits the route and then the sign-in.
    submit: () =>
      act(async () => {
        fireEvent.submit(form);
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ userId: "u1" }), { status: 200 }),
  );
  mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({ error: null });
});

describe("a parent account that now exists", () => {
  it("pushes sign_up naming the page it happened on, and nothing else", async () => {
    const form = renderForm();

    await form.submit();

    // Nothing has been signed up *for*, so the event carries nothing but the
    // page: there is no product, no price and no outcome to name yet.
    expect(pushed.mock.calls).toEqual([
      [{ event: "sign_up", page_path: ROUTES.register }],
    ]);
  });

  it("pushes before the sign-in, not after it", async () => {
    const form = renderForm();

    await form.submit();

    // The sign-in is a full network round trip, and the navigation that unloads
    // the document is behind it. Pushing first is what buys a tag that headroom.
    expect(pushed.mock.invocationCallOrder[0]).toBeLessThan(
      mockSupabaseClient.auth.signInWithPassword.mock.invocationCallOrder[0],
    );
  });

  it("still reports the account when the sign-in that follows fails", async () => {
    mockSupabaseClient.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const form = renderForm();

    await form.submit();

    // The account was created; the parent merely has not got into it yet. A
    // report retracted here would undercount every registration whose sign-in
    // hiccupped, and the event does not claim a session.
    expect(pushed).toHaveBeenCalledTimes(1);
  });
});

describe("a registration that never happened", () => {
  it("reports nothing when the route refuses", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "That email is already registered." }), {
        status: 409,
      }),
    );
    const form = renderForm();

    await form.submit();

    expect(pushed).not.toHaveBeenCalled();
  });

  it("reports nothing when the form refuses before it asks", async () => {
    const form = renderForm({ acceptTerms: false });

    await form.submit();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(pushed).not.toHaveBeenCalled();
  });
});

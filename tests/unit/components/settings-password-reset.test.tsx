import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
// An import placed after the components would not have been evaluated yet.
import {
  gameAccountModule,
  geduCoverageEditorModule,
  homeLocationFieldModule,
  locationsServiceModule,
  minecraftServiceModule,
  providersModule,
  robloxServiceModule,
  usersServiceModule,
} from "../../mocks/settings-page";
import { act, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile, createMockGamerProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

/**
 * **The Security card's password button sends a reset mail; it does not
 * navigate.**
 *
 * The bug this pins against: the button used to push the browser at
 * /reset-password, which is the *completion* page for an emailed recovery link
 * and cannot do anything without the single-use token that link carries. A
 * signed-in user therefore met "Reset link expired" and, from there, a
 * /forgot-password that the proxy bounced them off. Both exits were dead ends.
 *
 * So what is asserted here is the request, not a route: which address it
 * carries, that the button holds its disabled state until the request settles,
 * and that both outcomes are told to the user on the page they are already on.
 *
 * Gamers are the other half. They never type a password — the parent's
 * account-switch mints their session server-side — and their
 * `@gamer.sogverse.internal` address reaches no inbox, so the button is absent
 * rather than merely inert. Both directions are pinned, because a card that
 * never draws the button passes the gamer case on its own.
 */

// --------------------------------------------------------------------------
// The signed-in user, and the page scaffolding around the card under test.
// Every body but the contract card's is shared with the seed test — this card
// reads none of these hooks, and the profile form around it is not what is
// under test.
// --------------------------------------------------------------------------
const auth: { profile: Profile } = { profile: createMockProfile() };

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/components/game-account", () => gameAccountModule());
vi.mock("@/components/gedu/gedu-coverage-editor", () =>
  geduCoverageEditorModule(),
);
vi.mock("@/components/locations/home-location-field", () =>
  homeLocationFieldModule(),
);
// Not shared: the seed test renders this card for real, and stubbing it is what
// keeps this file about the Security card alone.
vi.mock("@/components/gedu/contract/gedu-contract-settings-card", () => ({
  GeduContractSettingsCard: () => <div data-testid="gedu-contract-card" />,
}));

// --- Helpers --------------------------------------------------------------

/** The catalogue's own copy, so a wording change cannot hide a regression. */
const RESET_BUTTON = messages.settings.resetPassword;
const SENDING = messages.common.sending;

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent />
    </NextIntlClientProvider>,
  );
}

function resetButton() {
  return screen.getByRole("button", { name: RESET_BUTTON });
}

/** Click, and let the request the click starts settle. */
async function clickAndSettle(button: HTMLElement) {
  await act(async () => {
    button.click();
  });
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = createMockProfile();
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Tests ----------------------------------------------------------------

describe("who is offered the password-reset button", () => {
  it("offers it to a parent", () => {
    auth.profile = createMockProfile({ role: "customer" });
    renderSettings();

    expect(resetButton()).toBeTruthy();
  });

  it("offers it to a gedu", () => {
    auth.profile = createMockProfile({ role: "gedu" });
    renderSettings();

    expect(resetButton()).toBeTruthy();
  });

  it("withholds it from a gamer", () => {
    auth.profile = createMockGamerProfile();
    renderSettings();

    expect(screen.queryByRole("button", { name: RESET_BUTTON })).toBeNull();
    // The card itself is still there — sign-out lives in it, and a gamer needs
    // that. Only the password affordance is gone.
    expect(
      screen.getByRole("button", { name: messages.common.signOut }),
    ).toBeTruthy();
  });
});

describe("sending the reset mail", () => {
  it("posts the signed-in account's own address to the forgot-password route", async () => {
    auth.profile = createMockProfile({ email: "parent@example.com" });
    renderSettings();

    await clickAndSettle(resetButton());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/auth/forgot-password");
    expect(init.method).toBe("POST");
    // The address is the profile's, never anything typed on this page — the
    // card has no email input, and taking one would turn a settings button into
    // an open mailer.
    expect(JSON.parse(init.body)).toEqual({ email: "parent@example.com" });
  });

  it("confirms inline, naming the address the link went to", async () => {
    auth.profile = createMockProfile({ email: "parent@example.com" });
    renderSettings();

    await clickAndSettle(resetButton());

    // The whole sentence, address interpolated — the page already prints the
    // address on its own in the profile card above, so matching the address
    // alone would pass without a confirmation ever being rendered.
    const confirmation = messages.settings.resetPasswordEmailSent.replace(
      "{email}",
      "parent@example.com",
    );
    expect(screen.getByText(confirmation)).toBeTruthy();
  });

  it("holds the button disabled from the click until the request settles", async () => {
    let settle: ((response: Response) => void) | undefined;
    mockFetch.mockImplementation(
      () => new Promise<Response>((resolve) => { settle = resolve; }),
    );
    renderSettings();

    const button = resetButton();
    act(() => {
      button.click();
    });

    // The flag is live before the first render after the click, so there is no
    // frame in which a fast second click could fire the request again.
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.textContent).toContain(SENDING);

    await act(async () => {
      settle!(new Response(JSON.stringify({ success: true })));
    });
    // Cleared on every outcome: the user stays on this page, and asking for a
    // second link is legitimate.
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  });

  it("reports a network failure rather than claiming a mail was sent", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    renderSettings();

    await clickAndSettle(resetButton());

    expect(
      screen.getByText(messages.settings.resetPasswordEmailFailed),
    ).toBeTruthy();
  });

  // The route answers 200 whatever it finds — that uniform answer is its
  // enumeration defence — so an HTTP-level refusal is the only server-side
  // signal this page can honestly read as a failure.
  it("reports a non-OK response as a failure", async () => {
    mockFetch.mockResolvedValue(new Response("nope", { status: 500 }));
    renderSettings();

    await clickAndSettle(resetButton());

    expect(
      screen.getByText(messages.settings.resetPasswordEmailFailed),
    ).toBeTruthy();
  });
});

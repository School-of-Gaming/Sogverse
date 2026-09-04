import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase and read their module bodies out of here.
import {
  gameAccountModule,
  geduCoverageEditorModule,
  homeLocationFieldModule,
  locationsServiceModule,
  marketingConsentsServiceModule,
  minecraftServiceModule,
  providersModule,
  robloxServiceModule,
  usersServiceModule,
} from "../../mocks/settings-page";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockGamerProfile } from "../../mocks/supabase";
import type { GamerSignIn, Profile } from "@/types";

/**
 * **The settings page asks whether an address reaches a person, not whether its
 * holder is a child.**
 *
 * Three rows used to be gated on `role !== "gamer"` — the Email field, the
 * verification line and button, and the password-reset button — and the role was
 * only ever standing in for the real question. It stopped being a safe stand-in
 * the day a parent could give their child a mailbox of their own: an email-mode
 * child holds a real address, verifies it themselves, and sets their own
 * password through the ordinary reset flow, so withholding all three from them
 * would hide the only three controls their account has.
 *
 * The other two modes must not gain any of it. A synthetic
 * `@gamer.sogverse.internal` handle reaches no inbox, so a verification stamp on
 * one would mean nothing and a reset mail to one would arrive nowhere — and a
 * username-mode child's password is their parent's to set, which is what the one
 * row they *do* get says.
 *
 * All three modes are rendered rather than just the new one, because a card that
 * showed the Email field to everybody would pass the email case on its own.
 */

const auth: { profile: Profile } = { profile: createMockGamerProfile() };

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/services/marketing-consents", () => marketingConsentsServiceModule());
vi.mock("@/components/game-account", () => gameAccountModule());
vi.mock("@/components/gedu/gedu-coverage-editor", () => geduCoverageEditorModule());
vi.mock("@/components/locations/home-location-field", () =>
  homeLocationFieldModule(),
);
vi.mock("@/components/gedu/contract/gedu-contract-settings-card", () => ({
  GeduContractSettingsCard: () => <div data-testid="gedu-contract-card" />,
}));

const RESET_BUTTON = messages.settings.resetPassword;
const VERIFY_BUTTON = messages.settings.sendVerificationEmail;
const USERNAME_LABEL = messages.settings.usernameLabel;

/** The synthetic address a username-mode child's account actually holds. */
const USERNAME_ADDRESS = "lily2015@gamer.sogverse.internal";
/** The opaque handle a switch-only child gets, which nobody ever reads. */
const SWITCH_ONLY_ADDRESS = "g3f2b1c906a4e4d21@gamer.sogverse.internal";

function renderFor(signIn: GamerSignIn, profile: Partial<Profile> = {}) {
  auth.profile = createMockGamerProfile(profile);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent gamerSignIn={signIn} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a switch-only gamer's settings", () => {
  it("shows neither an address, a verification prompt, nor a password button", () => {
    const view = renderFor("parent", { email: SWITCH_ONLY_ADDRESS });

    expect(view.container.textContent).not.toContain(SWITCH_ONLY_ADDRESS);
    expect(screen.queryByRole("button", { name: VERIFY_BUTTON })).toBeNull();
    expect(screen.queryByRole("button", { name: RESET_BUTTON })).toBeNull();
  });

  it("still gets the card the sign-out button lives in", () => {
    renderFor("parent", { email: SWITCH_ONLY_ADDRESS });

    expect(
      screen.getByRole("button", { name: messages.common.signOut }),
    ).toBeTruthy();
  });
});

describe("a username-mode gamer's settings", () => {
  it("shows the username their parent chose, and never the address behind it", () => {
    const view = renderFor("username", { email: USERNAME_ADDRESS });

    expect(screen.getByDisplayValue("lily2015")).toBeTruthy();
    expect(view.container.textContent).toContain(USERNAME_LABEL);
    expect(view.container.textContent).not.toContain(USERNAME_ADDRESS);
  });

  // The one thing a child locked out of this account needs to know, and a
  // mechanism rather than a reassurance.
  it("says where a new password comes from", () => {
    renderFor("username", { email: USERNAME_ADDRESS });

    expect(
      screen.getByText(messages.settings.gamerPasswordFromParent),
    ).toBeTruthy();
  });

  it("offers no password button of its own and no verification prompt", () => {
    renderFor("username", { email: USERNAME_ADDRESS });

    expect(screen.queryByRole("button", { name: RESET_BUTTON })).toBeNull();
    expect(screen.queryByRole("button", { name: VERIFY_BUTTON })).toBeNull();
  });
});

describe("an email-mode gamer's settings", () => {
  it("shows the mailbox their parent gave them", () => {
    renderFor("email", { email: "lily@example.test" });

    expect(screen.getAllByDisplayValue("lily@example.test").length).toBeGreaterThan(0);
  });

  it("offers the verification prompt while the address is unconfirmed", () => {
    renderFor("email", { email: "lily@example.test", email_verified_at: null });

    expect(screen.getByRole("button", { name: VERIFY_BUTTON })).toBeTruthy();
  });

  it("states the address is verified once it is, with no prompt left over", () => {
    renderFor("email", {
      email: "lily@example.test",
      email_verified_at: "2026-02-19T17:40:00.000Z",
    });

    expect(screen.getByText(messages.settings.emailVerified)).toBeTruthy();
    expect(screen.queryByRole("button", { name: VERIFY_BUTTON })).toBeNull();
  });

  it("offers the password-reset button, because the mail can now arrive", () => {
    renderFor("email", { email: "lily@example.test" });

    expect(screen.getByRole("button", { name: RESET_BUTTON })).toBeTruthy();
  });

  it("does not also print a username, which this account does not have", () => {
    const view = renderFor("email", { email: "lily@example.test" });

    expect(view.container.textContent).not.toContain(USERNAME_LABEL);
  });
});

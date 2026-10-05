import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
import {
  adminEmailPreferencesServiceModule,
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
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

/**
 * **An admin chooses which staff emails reach them, and every kind starts
 * off.** The group renders for an admin alone, unticked when they have no row,
 * and the Profile card's Save writes only a kind the admin actually moved.
 */

const auth: { profile: Profile } = { profile: createMockProfile({ role: "admin" }) };
const setPreference = vi.fn();

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/services/admin-email-preferences", () =>
  adminEmailPreferencesServiceModule(() => setPreference),
);
vi.mock("@/services/marketing-consents", () =>
  marketingConsentsServiceModule(),
);
vi.mock("@/components/game-account", () => gameAccountModule());
vi.mock("@/components/gedu/gedu-coverage-editor", () =>
  geduCoverageEditorModule(),
);
vi.mock("@/components/locations/home-location-field", () =>
  homeLocationFieldModule(),
);
vi.mock("@/components/gedu/contract/gedu-contract-settings-card", () => ({
  GeduContractSettingsCard: () => <div data-testid="gedu-contract-card" />,
}));

const copy = messages.settings.adminEmails;

/** The box's accessible name is its label followed by the hint under it. */
const sessionReportCopyBox = () =>
  screen.getByRole<HTMLInputElement>("checkbox", {
    name: (name) => name.startsWith(copy.session_report_copy.label),
  });

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setPreference.mockResolvedValue(undefined);
  auth.profile = createMockProfile({ role: "admin" });
});

describe("the admin email preferences", () => {
  it("offers session report copies to an admin, off until turned on", () => {
    renderSettings();

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(screen.getByText(copy.session_report_copy.hint)).toBeTruthy();
    expect(sessionReportCopyBox().checked).toBe(false);
  });

  it("saves a kind the admin turned on", async () => {
    renderSettings();

    await act(async () => {
      sessionReportCopyBox().click();
    });
    await act(async () => {
      screen.getByRole("button", { name: messages.common.saveChanges }).click();
    });

    expect(setPreference).toHaveBeenCalledExactlyOnceWith({
      kind: "session_report_copy",
      enabled: true,
    });
  });

  it("writes nothing when the admin left the box alone", async () => {
    renderSettings();

    await act(async () => {
      screen.getByRole("button", { name: messages.common.saveChanges }).click();
    });

    expect(setPreference).not.toHaveBeenCalled();
  });

  it.each(["gedu", "customer"] as const)("is absent for a %s", (role) => {
    auth.profile = createMockProfile({ role });
    renderSettings();

    expect(screen.queryByText(copy.title)).toBeNull();
  });
});

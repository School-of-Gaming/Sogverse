import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SITE_ORIGIN } from "../../mocks/site-origin";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
import {
  gameAccountModule,
  geduCoverageEditorModule,
  homeLocationFieldModule,
  locationsServiceModule,
  notificationPreferencesCardModule,
  emailMarketingServiceModule,
  marketingConsentsServiceModule,
  minecraftServiceModule,
  providersModule,
  robloxServiceModule,
  usersServiceModule,
} from "../../mocks/settings-page";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enSettings from "@/../messages/en/settings.json";
import enCommon from "@/../messages/en/common.json";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

const messages = { settings: enSettings, common: enCommon };

/**
 * **The MCP card is the admin's, and it hands over exactly the URL the route
 * built.** The route builds the URL only for an admin, so its presence is the
 * role test: no URL, no card. What is copied is the prop itself — the page
 * never rebuilds the address from the browser's location, which is what keeps
 * each environment showing its own endpoint.
 */

const auth: { profile: Profile } = { profile: createMockProfile({ role: "admin" }) };

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users/users.queries", () => usersServiceModule());
vi.mock("@/services/locations/locations.queries", () => locationsServiceModule());
vi.mock("@/services/minecraft/minecraft.queries", () => minecraftServiceModule());
vi.mock("@/services/roblox/roblox.queries", () => robloxServiceModule());
vi.mock("@/components/settings/notification-preferences-card", () =>
  notificationPreferencesCardModule(),
);
vi.mock("@/services/marketing-consents/marketing-consents.queries", () =>
  marketingConsentsServiceModule(),
);
vi.mock("@/services/email-marketing/email-marketing.queries", () =>
  emailMarketingServiceModule(),
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

const MCP_URL = `${SITE_ORIGIN}/api/mcp`;

function renderSettings(mcpServerUrl?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent mcpServerUrl={mcpServerUrl} />
    </NextIntlClientProvider>,
  );
}

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = createMockProfile({ role: "admin" });
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the MCP card", () => {
  it("shows the URL it was given, in a field that can be selected", () => {
    renderSettings(MCP_URL);

    expect(screen.getByText(messages.settings.mcp.title)).toBeTruthy();
    const field = screen.getByLabelText<HTMLInputElement>(
      messages.settings.mcp.urlLabel,
    );
    expect(field.value).toBe(MCP_URL);
    expect(field.readOnly).toBe(true);
    expect(field.disabled).toBe(false);
  });

  it("copies exactly that URL and confirms it", async () => {
    renderSettings(MCP_URL);

    await act(async () => {
      screen.getByRole("button", { name: messages.settings.mcp.copy }).click();
    });

    expect(writeText).toHaveBeenCalledWith(MCP_URL);
    expect(
      screen.getByRole("button", { name: messages.settings.mcp.copied }),
    ).toBeTruthy();
  });

  it("is absent when the route built no URL", () => {
    auth.profile = createMockProfile({ role: "customer" });
    renderSettings();

    expect(screen.queryByText(messages.settings.mcp.title)).toBeNull();
  });
});

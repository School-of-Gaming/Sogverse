import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
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
import { createMockProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

/**
 * **The Discord field is staff's, and it shows the link the route read.** The
 * route reads a link only for an admin or a Gedu, so the prop's presence is the
 * role test: no prop, no field. Linked or not, the field is read-only and the
 * sentence under it says how to link from Discord — worded for the state it is
 * in.
 */

const auth: { profile: Profile } = { profile: createMockProfile({ role: "gedu" }) };

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
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

const copy = messages.settings.discord;

function renderSettings(discordUsername?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent discordUsername={discordUsername} />
    </NextIntlClientProvider>,
  );
}

/** The text of the hint the field points at with `aria-describedby`. */
function describedBy(field: HTMLElement): string | null {
  const id = field.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

beforeEach(() => {
  auth.profile = createMockProfile({ role: "gedu" });
});

describe("the Discord field", () => {
  it("shows a linked account as @username, read-only, with the switch sentence", () => {
    renderSettings("gedu.aino");

    const field = screen.getByLabelText<HTMLInputElement>(copy.label);
    expect(field.value).toBe("@gedu.aino");
    expect(field.disabled).toBe(true);
    expect(describedBy(field)).toBe(copy.relinkHint);
    expect(screen.queryByText(copy.linkHint)).toBeNull();
  });

  it("shows an unlinked account as empty, saying how to link one", () => {
    auth.profile = createMockProfile({ role: "admin" });
    renderSettings(null);

    const field = screen.getByLabelText<HTMLInputElement>(copy.label);
    expect(field.value).toBe("");
    expect(field.placeholder).toBe(copy.notLinked);
    expect(field.disabled).toBe(true);
    expect(describedBy(field)).toBe(copy.linkHint);
  });

  it.each(["customer", "gamer"] as const)(
    "is absent for a %s, whose route hands down no link",
    (role) => {
      auth.profile = createMockProfile({ role });
      renderSettings();

      expect(screen.queryByLabelText(copy.label)).toBeNull();
      expect(screen.queryByText(copy.linkHint)).toBeNull();
    },
  );
});

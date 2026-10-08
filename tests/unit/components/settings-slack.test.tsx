import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
import {
  gameAccountModule,
  geduCoverageEditorModule,
  homeLocationFieldModule,
  locationsServiceModule,
  notificationPreferencesCardModule,
  marketingConsentsServiceModule,
  minecraftServiceModule,
  providersModule,
  robloxServiceModule,
  usersServiceModule,
} from "../../mocks/settings-page";
import { staticImageModule } from "../../mocks/static-image";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

/**
 * **The Slack field is an admin's, and it shows the link the route read.** The
 * route reads a Slack link only for an admin, so the prop's presence is the
 * role test: no prop, no field. Linked or not, the field is read-only and the
 * sentence under it says how to link from Slack — worded for the state it is
 * in.
 */

const auth: { profile: Profile } = { profile: createMockProfile({ role: "admin" }) };

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/components/settings/notification-preferences-card", () =>
  notificationPreferencesCardModule(),
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
vi.mock("@/assets/partners/discord-symbol-blurple.svg", () =>
  staticImageModule("/discord-symbol-blurple.svg", 127, 96),
);
vi.mock("@/assets/partners/slack-mark-color.svg", () =>
  staticImageModule("/slack-mark-color.svg", 400, 400),
);

/** The catalogue's sentences as read: the `<code>` tags render, never print. */
const plain = (message: string) => message.replace(/<\/?code>/g, "");
const copy = {
  ...messages.settings.slack,
  linkHint: plain(messages.settings.slack.linkHint),
  relinkHint: plain(messages.settings.slack.relinkHint),
};

function renderSettings(slackUsername?: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent slackUsername={slackUsername} />
    </NextIntlClientProvider>,
  );
}

/** The text of the hint the field points at with `aria-describedby`. */
function describedBy(field: HTMLElement): string | null {
  const id = field.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}

beforeEach(() => {
  auth.profile = createMockProfile({ role: "admin" });
});

describe("the Slack field", () => {
  it("shows a linked account as @username, read-only, with the switch sentence", () => {
    renderSettings("office.kyle");

    const field = screen.getByLabelText<HTMLInputElement>(copy.label);
    expect(field.value).toBe("@office.kyle");
    expect(field.disabled).toBe(true);
    expect(describedBy(field)).toBe(copy.relinkHint);
  });

  it("shows an unlinked account as empty, saying how to link one", () => {
    renderSettings(null);

    const field = screen.getByLabelText<HTMLInputElement>(copy.label);
    expect(field.value).toBe("");
    expect(field.placeholder).toBe(copy.notLinked);
    expect(field.disabled).toBe(true);
    expect(describedBy(field)).toBe(copy.linkHint);
  });

  it("sets the command to type as code inside the hint", () => {
    renderSettings(null);

    const field = screen.getByLabelText(copy.label);
    const hint = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    expect(hint?.querySelector("code")?.textContent).toBe("/link");
  });

  it("leads its label with Slack's mark, hidden from assistive technology", () => {
    renderSettings(null);

    const label = document.querySelector('label[for="settings-slack"]');
    const mark = label?.querySelector("img");
    expect(mark?.getAttribute("src")).toContain("/slack-mark-color.svg");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("is absent when the route hands down no link", () => {
    auth.profile = createMockProfile({ role: "gedu" });
    renderSettings();

    expect(screen.queryByLabelText(copy.label)).toBeNull();
  });
});

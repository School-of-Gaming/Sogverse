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
import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NotificationPreferencesCard } from "@/components/settings/notification-preferences-card";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { NotificationPreference, Profile } from "@/types";

/**
 * **The viewer chooses which notifications reach them, by channel, and every
 * toggle starts off.** The card renders for an admin alone, groups its toggles
 * under the channel, and its own Save writes only a toggle the viewer actually
 * moved.
 */

const auth: { profile: Profile } = { profile: createMockProfile({ role: "admin" }) };
const read: { data: NotificationPreference[] | undefined; isError: boolean } = {
  data: [],
  isError: false,
};
const setPreference = vi.fn();

vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/services/notification-preferences", () => ({
  NOTIFICATION_TOGGLES: { email: ["session_report_copy"] },
  useMyNotificationPreferences: () => read,
  useSetNotificationPreference: () => ({ mutateAsync: setPreference }),
}));
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

const copy = messages.settings.notifications;

/** The box's accessible name is its label followed by the hint under it. */
const sessionReportCopyBox = () =>
  screen.getByRole<HTMLInputElement>("checkbox", {
    name: (name) => name.startsWith(copy.kinds.session_report_copy.label),
  });

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: messages.common.saveChanges,
  });

function withMessages(children: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setPreference.mockResolvedValue(undefined);
  auth.profile = createMockProfile({ role: "admin" });
  read.data = [];
  read.isError = false;
});

describe("the notification preferences card on the settings page", () => {
  it("is shown to an admin, as its own section", () => {
    render(withMessages(<SettingsSectionContent />));

    expect(screen.getByText(copy.title)).toBeTruthy();
    expect(
      screen.getByRole("group", { name: copy.channels.email }),
    ).toBeTruthy();
  });

  it.each(["gedu", "customer", "gamer"] as const)(
    "is absent for a %s, who has no toggle",
    (role) => {
      auth.profile = createMockProfile({ role });
      render(withMessages(<SettingsSectionContent />));

      expect(screen.queryByText(copy.title)).toBeNull();
    },
  );
});

describe("the notification preferences card", () => {
  it("offers session report copies by email, off until turned on", () => {
    render(withMessages(<NotificationPreferencesCard />));

    expect(screen.getByText(copy.kinds.session_report_copy.hint)).toBeTruthy();
    expect(sessionReportCopyBox().checked).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });

  it("shows a stored answer", () => {
    read.data = [
      {
        profile_id: auth.profile.id,
        kind: "session_report_copy",
        channel: "email",
        enabled: true,
        updated_at: "2026-10-05T12:00:00Z",
      },
    ];
    render(withMessages(<NotificationPreferencesCard />));

    expect(sessionReportCopyBox().checked).toBe(true);
  });

  it("keeps a stored answer through a failed refetch", () => {
    read.data = [
      {
        profile_id: auth.profile.id,
        kind: "session_report_copy",
        channel: "email",
        enabled: true,
        updated_at: "2026-10-05T12:00:00Z",
      },
    ];
    read.isError = true;
    render(withMessages(<NotificationPreferencesCard />));

    expect(sessionReportCopyBox().checked).toBe(true);
  });

  it("offers usable boxes, all off, when the first read fails", () => {
    read.data = undefined;
    read.isError = true;
    render(withMessages(<NotificationPreferencesCard />));

    expect(sessionReportCopyBox().checked).toBe(false);
    expect(sessionReportCopyBox().disabled).toBe(false);
  });

  it("keeps the box disabled until the read lands", () => {
    read.data = undefined;
    render(withMessages(<NotificationPreferencesCard />));

    expect(sessionReportCopyBox().disabled).toBe(true);
  });

  it("saves a toggle the viewer turned on, with its own Save", async () => {
    render(withMessages(<NotificationPreferencesCard />));

    await act(async () => {
      sessionReportCopyBox().click();
    });
    expect(saveButton().disabled).toBe(false);
    await act(async () => {
      saveButton().click();
    });

    expect(setPreference).toHaveBeenCalledExactlyOnceWith({
      kind: "session_report_copy",
      channel: "email",
      enabled: true,
    });
  });

  it("enables Save only while something differs from what is on file", async () => {
    render(withMessages(<NotificationPreferencesCard />));

    await act(async () => {
      sessionReportCopyBox().click();
    });
    await act(async () => {
      sessionReportCopyBox().click();
    });

    expect(saveButton().disabled).toBe(true);
  });

  it("says so in its own words when a write is refused", async () => {
    setPreference.mockRejectedValue({ message: "permission denied", code: "42501" });
    render(withMessages(<NotificationPreferencesCard />));

    await act(async () => {
      sessionReportCopyBox().click();
    });
    await act(async () => {
      saveButton().click();
    });

    expect(screen.getByRole("alert").textContent).toBe(copy.saveFailed);
    expect(sessionReportCopyBox().checked).toBe(true);
  });
});

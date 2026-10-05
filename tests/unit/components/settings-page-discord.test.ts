import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * **The settings route reads a Discord link for the two roles that can hold
 * one, and for no one else.** The body renders the Discord field exactly when
 * the route hands it `discordUsername`, so what is pinned here is the role test
 * itself: an admin and a Gedu are given their link (or `null`), a parent and a
 * gamer are given no prop at all and cost no read.
 *
 * The page is an async server component; it is awaited and the element it
 * returns inspected.
 */

const mockGetUserWithProfile = vi.fn();
const mockGetLink = vi.fn();

/** Answers every select the gamer branch makes with no rows. */
const fakeClient = {
  from: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return chain;
  },
};

vi.mock("@/lib/supabase/server", () => ({
  getUserWithProfile: () => mockGetUserWithProfile(),
  createClient: () => Promise.resolve(fakeClient),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/url", () => ({
  getOrigin: () => "https://sogverse.test",
}));
vi.mock("@/services/discord-link/discord-link.service", () => ({
  DiscordLinkService: class {
    getLink(profileId: string) {
      return mockGetLink(profileId);
    }
  },
}));
vi.mock("@/services/gedu/gedu-contract.service", () => ({
  GeduContractService: class {
    getAcceptances() {
      return Promise.resolve([]);
    }
  },
}));
vi.mock("@/components/settings/settings-section-content", () => ({
  SettingsSectionContent: () => null,
}));

import SettingsPage from "@/app/[locale]/(dashboard)/settings/page";

function signedInAs(role: string) {
  mockGetUserWithProfile.mockResolvedValue({
    user: { id: `${role}-id` },
    profile: { role },
  });
}

async function renderedProps() {
  const element = (await SettingsPage()) as ReactElement<Record<string, unknown>>;
  return element.props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the settings route's Discord read", () => {
  it("hands an admin their linked username, read for their own profile", async () => {
    signedInAs("admin");
    mockGetLink.mockResolvedValue({
      discord_username: "office.kyle",
      linked_at: "2026-10-05T10:00:00Z",
    });

    const props = await renderedProps();

    expect(mockGetLink).toHaveBeenCalledWith("admin-id");
    expect(props.discordUsername).toBe("office.kyle");
  });

  it("hands a Gedu with no link null, not an absent prop", async () => {
    signedInAs("gedu");
    mockGetLink.mockResolvedValue(null);

    const props = await renderedProps();

    expect(mockGetLink).toHaveBeenCalledWith("gedu-id");
    expect(props).toHaveProperty("discordUsername", null);
  });

  it.each(["customer", "gamer"])(
    "reads nothing for a %s and hands down no prop",
    async (role) => {
      signedInAs(role);

      const props = await renderedProps();

      expect(mockGetLink).not.toHaveBeenCalled();
      expect(props).not.toHaveProperty("discordUsername");
    },
  );
});

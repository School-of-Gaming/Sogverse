import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * **The settings route reads a Slack link for an admin, the one role that can
 * hold one, and for no one else.** The body renders the Slack field exactly
 * when the route hands it `slackUsername`, so what is pinned here is the role
 * test itself: an admin is given their link (or `null`), every other role is
 * given no prop at all and costs no read.
 *
 * The page is an async server component; it is awaited and the element it
 * returns inspected.
 */

const mockGetUserWithProfile = vi.fn();
const mockGetSlackLink = vi.fn();

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
    getLink() {
      return Promise.resolve(null);
    }
  },
}));
vi.mock("@/services/slack-link/slack-link.service", () => ({
  SlackLinkService: class {
    getLink(profileId: string) {
      return mockGetSlackLink(profileId);
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

describe("the settings route's Slack read", () => {
  it("hands an admin their linked username, read for their own profile", async () => {
    signedInAs("admin");
    mockGetSlackLink.mockResolvedValue({ slack_username: "office.kyle" });

    const props = await renderedProps();

    expect(mockGetSlackLink).toHaveBeenCalledWith("admin-id");
    expect(props.slackUsername).toBe("office.kyle");
  });

  it("hands an admin with no link null, not an absent prop", async () => {
    signedInAs("admin");
    mockGetSlackLink.mockResolvedValue(null);

    const props = await renderedProps();

    expect(props).toHaveProperty("slackUsername", null);
  });

  it.each(["gedu", "customer", "gamer"])(
    "reads nothing for a %s and hands down no prop",
    async (role) => {
      signedInAs(role);

      const props = await renderedProps();

      expect(mockGetSlackLink).not.toHaveBeenCalled();
      expect(props).not.toHaveProperty("slackUsername");
    },
  );
});

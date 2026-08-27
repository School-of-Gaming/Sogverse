import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduContractSettingsCard } from "@/components/gedu/contract/gedu-contract-settings-card";
import { buildGeduContractAcceptance } from "@/components/gedu/contract/mock-contract-fixtures";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { Profile } from "@/types";

/**
 * **The gedu contract settings card is born in its real state.**
 *
 * The settings route reads the acceptances server-side and hands them down, so
 * the card renders signed-or-not on its very first frame rather than growing
 * into it a fetch later. Both halves of that are pinned here: the card putting
 * the seed straight into the query cache instead of waiting for the network,
 * and the page body carrying the route's prefetch down to it.
 *
 * The degraded path is pinned alongside them, because it is the reason the card
 * still sits last on the page. A `null` seed means the server read failed, and
 * the card must then show *nothing* — never "not accepted", which would tell a
 * gedu who has signed that they have not.
 */

// --------------------------------------------------------------------------
// The signed-in user, and the two providers the card and its page body read.
// --------------------------------------------------------------------------
const auth: { profile: Profile } = {
  profile: createMockProfile({ role: "gedu" }),
};

vi.mock("@/providers", () => ({
  useAuth: () => ({
    user: { id: auth.profile.id },
    profile: auth.profile,
    refreshProfile: vi.fn(),
  }),
  useTimezone: () => "Europe/Helsinki",
}));

// Neighbouring sections of the settings page, stubbed so this file is about the
// contract card alone. They own their own reads and their own tests.
vi.mock("@/services/users", () => ({
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
  useSendVerificationEmail: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/services/locations", () => ({
  useLocationsByIds: () => ({ data: undefined }),
}));
vi.mock("@/services/minecraft", () => ({
  useMyMinecraftAccount: () => ({ data: null }),
  useUpdateMyMinecraft: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/services/roblox", () => ({
  useMyRobloxAccount: () => ({ data: null }),
  useUpdateMyRoblox: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/components/game-account", () => ({
  GameAccountCard: () => <div data-testid="game-account-card" />,
}));
vi.mock("@/components/gedu/gedu-coverage-editor", () => ({
  GeduCoverageEditor: () => <div data-testid="gedu-coverage-editor" />,
}));
vi.mock("@/components/locations/home-location-field", () => ({
  HomeLocationField: () => <div data-testid="home-location-field" />,
}));

/**
 * The read behind the hook, stood in for by one that never answers. That is
 * what makes "the seed is enough" assertable rather than merely likely: a
 * seeded card renders its answer with this promise still pending, and the
 * call count says outright whether the browser had to ask at all.
 */
const getAcceptances = vi.fn(() => new Promise<never>(() => {}));
vi.mock("@/services/gedu/gedu-contract.service", () => ({
  GeduContractService: class {
    getAcceptances = getAcceptances;
  },
}));

// --- Helpers --------------------------------------------------------------

const SIGNED_ROW = buildGeduContractAcceptance({
  acceptedAt: "2026-03-14T09:12:00.000Z",
});

/** The catalogue's own copy, so a wording change cannot hide a regression. */
const ACCEPTED_TITLE = messages.gedu.contract.settings.acceptedTitle;
const NOT_ACCEPTED_TITLE = messages.gedu.contract.settings.notAcceptedTitle;
const CARD_TITLE = messages.gedu.contract.settings.title;

/**
 * A client that will not refetch behind the assertions, so what a first render
 * shows is the seed and nothing else. The query function would reach the
 * globally-mocked Supabase client, which answers nothing — which is the point:
 * a seeded card must not need it.
 */
function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = createMockProfile({ role: "gedu" });
});

// --- Tests ----------------------------------------------------------------

describe("the card's server seed", () => {
  it("renders the signature from the seed, with no fetch in between", () => {
    renderWithQuery(
      <GeduContractSettingsCard
        geduId={auth.profile.id}
        initialAcceptances={[SIGNED_ROW]}
      />,
    );

    // Synchronously, on the first render — no `waitFor`, because a seeded query
    // has its answer before the component ever mounts.
    expect(screen.getByText(ACCEPTED_TITLE)).toBeTruthy();
    expect(screen.getByText(SIGNED_ROW.signed_name)).toBeTruthy();
    // And it never asked: the standing read is still pending, so the card
    // cannot have got this from anywhere but the seed.
    expect(getAcceptances).not.toHaveBeenCalled();
  });

  it("renders the prompt from a seeded empty list", () => {
    renderWithQuery(
      <GeduContractSettingsCard
        geduId={auth.profile.id}
        initialAcceptances={[]}
      />,
    );

    // `[]` is a real answer — this gedu has signed nothing — and the seed is
    // trusted with it, which is exactly why a *failed* read must not be
    // flattened into one.
    expect(screen.getByText(NOT_ACCEPTED_TITLE)).toBeTruthy();
  });

  it("shows neither answer when the seed was withheld", () => {
    renderWithQuery(
      <GeduContractSettingsCard
        geduId={auth.profile.id}
        initialAcceptances={null}
      />,
    );

    // The degraded path: the server read failed, the browser is asking again,
    // and until it answers the card says nothing rather than guessing.
    expect(screen.queryByText(ACCEPTED_TITLE)).toBeNull();
    expect(screen.queryByText(NOT_ACCEPTED_TITLE)).toBeNull();
    expect(getAcceptances).toHaveBeenCalledTimes(1);
    // The heading is there from the first paint either way — it is what a late
    // answer lands under without moving it.
    expect(screen.getByText(CARD_TITLE)).toBeTruthy();
  });
});

describe("the settings page body's threading", () => {
  it("hands the route's prefetch down, so the card paints signed on first render", () => {
    renderWithQuery(
      <SettingsSectionContent initialGeduContractAcceptances={[SIGNED_ROW]} />,
    );

    expect(screen.getByText(ACCEPTED_TITLE)).toBeTruthy();
  });

  it("keeps a withheld seed withheld rather than turning it into an empty list", () => {
    renderWithQuery(
      <SettingsSectionContent initialGeduContractAcceptances={null} />,
    );

    // The card is mounted — its heading is up — but its body is empty, which is
    // the whole difference between "we could not read" and "nothing signed".
    expect(screen.getByText(CARD_TITLE)).toBeTruthy();
    expect(screen.queryByText(NOT_ACCEPTED_TITLE)).toBeNull();
  });

  it("renders no contract card at all for a non-gedu", () => {
    auth.profile = createMockProfile({ role: "customer" });
    renderWithQuery(<SettingsSectionContent />);

    expect(screen.queryByText(CARD_TITLE)).toBeNull();
  });
});

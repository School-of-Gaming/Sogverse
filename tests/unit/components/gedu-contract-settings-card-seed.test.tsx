import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase, and each reads its module body out of here.
// An import placed after the components would not have been evaluated yet.
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
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduContractSettingsCard } from "@/components/gedu/contract/gedu-contract-settings-card";
import { buildGeduContractAcceptance } from "@/components/gedu/contract/mock-contract-fixtures";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { geduContractKeys } from "@/services/gedu";
import { createMockProfile } from "../../mocks/supabase";
import type { GeduContractAcceptance, Profile } from "@/types";

/**
 * **The gedu contract settings card is born in its real state, and there is no
 * other state it can be in.**
 *
 * The settings route reads the acceptances server-side and hands them down —
 * or fails, so a rendered page always has them. That is what makes the card a
 * two-state component, and what is pinned here is the whole of that claim: the
 * seed alone is enough to paint the real answer, it lands on the key every
 * other reader of these rows shares, and the page body carries it down.
 *
 * **The query client here is the app's, not a convenient one.** "It fetched
 * nothing" is only worth asserting under the configuration production runs —
 * the 60-second `staleTime` and React Query's own `refetchOnMount` — because a
 * client told not to refetch would pass that assertion whatever the card did.
 * It is also what gives the last case its teeth: a seed stamped with the moment
 * the server read it goes stale on schedule, so a payload replayed out of the
 * router cache is asked about again instead of standing for a minute.
 */

// --------------------------------------------------------------------------
// The signed-in user, and the page scaffolding the card renders inside.
// --------------------------------------------------------------------------
const auth: { profile: Profile } = {
  profile: createMockProfile({ role: "gedu" }),
};

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

/** The seed as the route builds it: the rows, stamped at the read. */
const freshSeed = (acceptances: GeduContractAcceptance[]) => ({
  acceptances,
  fetchedAt: Date.now(),
});

/**
 * A client configured exactly as `QueryProvider` configures the app's: a
 * one-minute `staleTime` and nothing else overridden. Anything looser would
 * make "no fetch" a property of the test rather than of the card.
 */
function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {ui}
        </NextIntlClientProvider>
      </QueryClientProvider>,
    ),
  };
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
        seed={freshSeed([SIGNED_ROW])}
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

  it("renders the sign prompt from a seeded empty list, with no fetch in between", () => {
    renderWithQuery(
      <GeduContractSettingsCard geduId={auth.profile.id} seed={freshSeed([])} />,
    );

    // `[]` is a real answer — this gedu has signed nothing — and it is trusted
    // as one, which it can be because a read that failed never reaches here:
    // the route throws instead of handing over an empty list.
    expect(screen.getByText(NOT_ACCEPTED_TITLE)).toBeTruthy();
    expect(getAcceptances).not.toHaveBeenCalled();
  });

  it("seeds the shared cache key, not a copy of its own", () => {
    const { queryClient } = renderWithQuery(
      <GeduContractSettingsCard
        geduId={auth.profile.id}
        seed={freshSeed([SIGNED_ROW])}
      />,
    );

    // The very entry the hook reads and the accept mutation invalidates. A seed
    // that landed anywhere else would still render this card correctly and
    // leave every other reader of these rows fetching.
    expect(
      queryClient.getQueryData(geduContractKeys.acceptances(auth.profile.id)),
    ).toEqual([SIGNED_ROW]);
  });

  it("asks again when the seed is older than the staleTime", () => {
    renderWithQuery(
      <GeduContractSettingsCard
        geduId={auth.profile.id}
        seed={{
          acceptances: [SIGNED_ROW],
          // Five minutes old — what a back-navigation served from the router
          // cache hands over. Without the stamp React Query would call this
          // fresh and sit on it.
          fetchedAt: Date.now() - 5 * 60 * 1000,
        }}
      />,
    );

    // Still painted from the seed, immediately — being stale is not being
    // absent, and the card never blanks while the refetch is in flight.
    expect(screen.getByText(ACCEPTED_TITLE)).toBeTruthy();
    expect(getAcceptances).toHaveBeenCalledTimes(1);
  });
});

describe("the settings page body's threading", () => {
  it("hands the route's seed down, so the card paints signed on first render", () => {
    renderWithQuery(
      <SettingsSectionContent geduContractSeed={freshSeed([SIGNED_ROW])} />,
    );

    expect(screen.getByText(ACCEPTED_TITLE)).toBeTruthy();
    expect(getAcceptances).not.toHaveBeenCalled();
  });

  it("renders no contract card at all for a non-gedu", () => {
    auth.profile = createMockProfile({ role: "customer" });
    renderWithQuery(<SettingsSectionContent />);

    expect(screen.queryByText(CARD_TITLE)).toBeNull();
  });
});

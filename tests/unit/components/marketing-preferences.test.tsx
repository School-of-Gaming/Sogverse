import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase and read their module bodies out of here.
import {
  gameAccountModule,
  geduCoverageEditorModule,
  homeLocationFieldModule,
  locationsServiceModule,
  minecraftServiceModule,
  providersModule,
  robloxServiceModule,
  usersServiceModule,
} from "../../mocks/settings-page";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { MarketingPreferencesCard } from "@/components/settings/marketing-preferences-card";
import { UserMarketingConsentsCard } from "@/components/admin/user-marketing-consents-card";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { MarketingConsent, MarketingConsentType, Profile } from "@/types";

/**
 * **A marketing consent is answered by ticking a box, so the box is the whole
 * of the contract with the user** — what it is seeded from, when it may be
 * clicked, and exactly what one click sends.
 *
 * Two claims carry the most weight here and neither is visible from reading the
 * component. The first is that a box is *not clickable before the read lands*:
 * a checkbox seeded from an unresolved read is seeded from `false`, so an
 * already-opted-in parent clicking early would send an answer already on file,
 * the RPC would no-op it, and the box would spring back. The second is that the
 * box stays disabled from the click until the write settles, which `isPending`
 * alone does not give (it flips false a render before the outcome handlers run)
 * — so the mutation mock here deliberately never settles, and what is asserted
 * is that the control is still disabled while it hangs.
 *
 * The admin block is the read-only other end: it must render both consents
 * whatever the database holds, and a customer with no rows at all has to read
 * as *not granted* rather than as a blank.
 */

// --------------------------------------------------------------------------
// The service, stood in for. `mine` and `forCustomer` are separate handles
// because the two surfaces read different queries and one test renders both.
// --------------------------------------------------------------------------
const mine: { data: MarketingConsent[] | undefined } = { data: [] };
const forCustomer: { data: MarketingConsent[] | undefined } = { data: [] };
const setConsentMutate = vi.fn();

vi.mock("@/services/marketing-consents", () => ({
  useMyMarketingConsents: () => ({ data: mine.data }),
  useMarketingConsentsForCustomer: () => ({ data: forCustomer.data }),
  useSetMarketingConsent: () => ({ mutate: setConsentMutate }),
}));

// The settings page body's scaffolding, for the role-gating case at the end.
const auth: { profile: Profile } = { profile: createMockProfile() };
vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/services/users", () => usersServiceModule());
vi.mock("@/services/locations", () => locationsServiceModule());
vi.mock("@/services/minecraft", () => minecraftServiceModule());
vi.mock("@/services/roblox", () => robloxServiceModule());
vi.mock("@/components/game-account", () => gameAccountModule());
vi.mock("@/components/gedu/gedu-coverage-editor", () =>
  geduCoverageEditorModule(),
);
vi.mock("@/components/locations/home-location-field", () =>
  homeLocationFieldModule(),
);

// --- Helpers --------------------------------------------------------------

const CUSTOMER_ID = "6f5a2c1e-8b47-4d3a-9c21-0f7e5b8d4a63";

function consentRow(
  consentType: MarketingConsentType,
  granted: boolean,
  updatedAt = "2026-04-09T10:15:00.000Z",
): MarketingConsent {
  return {
    customer_id: CUSTOMER_ID,
    consent_type: consentType,
    granted,
    updated_at: updatedAt,
  };
}

function renderIntl(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The catalogue's own copy, so a wording change cannot hide a regression. */
const SOG_LABEL = messages.settings.marketing.schoolOfGaming;
const CARD_TITLE = messages.settings.marketing.title;
const SAVE_FAILED = messages.settings.marketing.saveFailed;
const NOT_GRANTED = messages.admin.users.marketing.notGranted;
const GRANTED = messages.admin.users.marketing.granted;

beforeEach(() => {
  vi.clearAllMocks();
  mine.data = [];
  forCustomer.data = [];
  auth.profile = createMockProfile();
});

// --- The settings card ----------------------------------------------------

describe("the settings marketing card", () => {
  it("seeds each box from the stored answer, School of Gaming first", () => {
    mine.data = [
      // Deliberately the partner's row first: Postgres orders an enum by
      // declaration order and a select promises no order at all, so the render
      // order must come from the component rather than from the rows.
      consentRow("lynx_educate", true),
      consentRow("school_of_gaming", false),
    ];
    renderIntl(<MarketingPreferencesCard />);

    const [sog, lynx] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(sog.closest("label")?.textContent).toContain("School of Gaming");
    expect(lynx.closest("label")?.textContent).toContain("Lynx Educate");
    expect(sog.checked).toBe(false);
    expect(lynx.checked).toBe(true);
  });

  it("renders a consent with no row at all as unticked", () => {
    mine.data = [consentRow("school_of_gaming", true)];
    renderIntl(<MarketingPreferencesCard />);

    const [sog, lynx] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(sog.checked).toBe(true);
    // Never asked and answered no are different states in the database and the
    // same state on screen: both are "we may not mail you".
    expect(lynx.checked).toBe(false);
  });

  it("disables both boxes until the read resolves", () => {
    mine.data = undefined;
    renderIntl(<MarketingPreferencesCard />);

    for (const box of screen.getAllByRole<HTMLInputElement>("checkbox")) {
      expect(box.disabled).toBe(true);
    }
  });

  it("commits a tick immediately, naming the type, the answer and the source", () => {
    mine.data = [];
    renderIntl(<MarketingPreferencesCard />);

    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(setConsentMutate).toHaveBeenCalledTimes(1);
    expect(setConsentMutate.mock.calls[0][0]).toEqual({
      consentType: "lynx_educate",
      granted: true,
      // `settings` is one of the two sources the RPC accepts; `registration` is
      // refused there and must never be sent from a signed-in surface.
      source: "settings",
    });
  });

  it("commits an untick as an explicit no", () => {
    mine.data = [consentRow("school_of_gaming", true)];
    renderIntl(<MarketingPreferencesCard />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(setConsentMutate.mock.calls[0][0]).toEqual({
      consentType: "school_of_gaming",
      granted: false,
      source: "settings",
    });
  });

  it("keeps the clicked box disabled while its write is in flight, and leaves the other one alone", () => {
    // The mock never calls `onSettled`, which is the whole point: this is the
    // window `isPending` closes too early and a fast second click would land in.
    mine.data = [];
    renderIntl(<MarketingPreferencesCard />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    const [sog, lynx] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(sog.disabled).toBe(true);
    expect(lynx.disabled).toBe(false);
  });

  it("re-enables the box and shows the failure when the write is refused", () => {
    setConsentMutate.mockImplementation(
      (
        _vars: unknown,
        options: { onError: (error: Error) => void; onSettled: () => void },
      ) => {
        options.onError(new Error("nope"));
        options.onSettled();
      },
    );
    mine.data = [];
    renderIntl(<MarketingPreferencesCard />);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    // The parent stays on this page through a failure, so the box has to come
    // back for a retry to be possible at all — and it still shows server state,
    // which a write that never landed leaves untouched.
    const [sog] = screen.getAllByRole<HTMLInputElement>("checkbox");
    expect(sog.disabled).toBe(false);
    expect(sog.checked).toBe(false);
    expect(screen.getByText(SAVE_FAILED)).toBeTruthy();
  });
});

describe("who gets the settings marketing card", () => {
  it("renders it for a parent", () => {
    auth.profile = createMockProfile({ role: "customer" });
    renderIntl(<SettingsSectionContent />);

    expect(screen.getByText(CARD_TITLE)).toBeTruthy();
    expect(screen.getByText(SOG_LABEL)).toBeTruthy();
  });

  it("renders none for a gedu, whose consents the database refuses to hold", () => {
    auth.profile = createMockProfile({ role: "gedu" });
    renderIntl(<SettingsSectionContent />);

    expect(screen.queryByText(CARD_TITLE)).toBeNull();
  });
});

// --- The admin block ------------------------------------------------------

describe("the admin marketing block", () => {
  it("reports both consents as not granted for a customer with no rows", () => {
    forCustomer.data = [];
    renderIntl(<UserMarketingConsentsCard customerId={CUSTOMER_ID} />);

    expect(screen.getAllByText(NOT_GRANTED)).toHaveLength(2);
    expect(screen.queryByText(GRANTED)).toBeNull();
    // Both are still named — an admin reads the answer off a fixed pair of rows
    // rather than off whichever rows happen to exist.
    expect(
      screen.getByText(messages.admin.users.marketing.schoolOfGaming),
    ).toBeTruthy();
    expect(
      screen.getByText(messages.admin.users.marketing.lynxEducate),
    ).toBeTruthy();
  });

  it("reports each consent's own state, with the moment a stored row carries", () => {
    forCustomer.data = [
      consentRow("school_of_gaming", true, "2026-04-09T10:15:00.000Z"),
      consentRow("lynx_educate", false, "2026-04-09T10:15:00.000Z"),
    ];
    renderIntl(<UserMarketingConsentsCard customerId={CUSTOMER_ID} />);

    expect(screen.getByText(GRANTED)).toBeTruthy();
    expect(screen.getByText(NOT_GRANTED)).toBeTruthy();
    // Two rows, two stamps. The date is formatted in the viewer's zone
    // (Europe/Helsinki, from the mocked provider) rather than the runtime
    // default, which is what the timestamptz rule requires.
    expect(screen.getAllByText(/^since /)).toHaveLength(2);
  });

  it("states nothing at all until the read lands", () => {
    forCustomer.data = undefined;
    renderIntl(<UserMarketingConsentsCard customerId={CUSTOMER_ID} />);

    // Saying "not granted" and correcting it a round trip later would be the
    // card stating a fact it did not have. The labels are already on screen.
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
    expect(screen.queryByText(GRANTED)).toBeNull();
    expect(
      screen.getByText(messages.admin.users.marketing.lynxEducate),
    ).toBeTruthy();
  });
});

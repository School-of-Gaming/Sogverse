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
} from "../../mocks/settings-page";
import type { ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { UserMarketingCard } from "@/components/admin/user-marketing-card";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { UtmAttribution } from "@/lib/utm";
import type { MarketingConsent, MarketingConsentType, Profile } from "@/types";

/**
 * **A marketing consent is answered by ticking a box inside the Profile card,
 * and committed by that card's Save button** — so the contract under test spans
 * both: what the boxes are seeded from, when they may be clicked, and exactly
 * which writes one Save makes.
 *
 * The consents used to be a card of their own that committed on every tick.
 * That made them the settings page's only auto-saver, on a page where every
 * other control waits for Save, so they moved into the Profile card. Three
 * claims carry the weight here and none is visible from reading the component:
 *
 * - A box is **not clickable before the read lands**: seeded from an unresolved
 *   read it would be seeded from `false`, and an already-opted-in parent could
 *   untick something they had never ticked.
 * - A Save writes **only the consents that actually changed** — an unchanged one
 *   would still cost a round trip and still stamp a "source: settings" touch
 *   nobody made.
 * - A consent write that fails **still leaves the profile saved**, so the card
 *   shows the error and no success line, and the boxes keep the parent's choice
 *   so pressing Save again retries exactly what is still outstanding.
 *
 * The admin block at the end is the read-only other end, and is untouched by all
 * of this: it must render both consents whatever the database holds, and a
 * customer with no rows at all has to read as *not granted* rather than a blank.
 */

// --------------------------------------------------------------------------
// The services, stood in for. `mine` and `forCustomer` are separate handles
// because the two surfaces read different queries and one test renders both.
// --------------------------------------------------------------------------
const mine: { data: MarketingConsent[] | undefined; isError: boolean } = {
  data: [],
  isError: false,
};
const forCustomer: { data: MarketingConsent[] | undefined } = { data: [] };
const setConsentAsync = vi.fn();
const updateProfileAsync = vi.fn();

vi.mock("@/services/marketing-consents", () => ({
  useMyMarketingConsents: () => ({ data: mine.data, isError: mine.isError }),
  useMarketingConsentsForCustomer: () => ({ data: forCustomer.data }),
  useSetMarketingConsent: () => ({ mutateAsync: setConsentAsync }),
}));

// Not the shared factory: this file asserts on the profile write itself, and
// the factory hands out a fresh spy per render.
vi.mock("@/services/users", () => ({
  useUpdateProfile: () => ({ mutateAsync: updateProfileAsync }),
  useSendVerificationEmail: () => ({ mutate: vi.fn() }),
}));

const auth: { profile: Profile } = { profile: createMockProfile() };
vi.mock("@/providers", () => providersModule(() => auth.profile));
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

/** The settings page as a parent meets it, with the marketing group on it. */
function renderSettings() {
  auth.profile = createMockProfile({ role: "customer" });
  return renderIntl(<SettingsSectionContent />);
}

/**
 * Re-render after changing `mine.data`, standing in for the query invalidation
 * a successful write triggers.
 *
 * The mocked hook reads the handle afresh on every render, but nothing re-runs
 * the tree when the handle is reassigned — so without this the component keeps
 * the seed it was last rendered with, and a "what does a second Save send"
 * assertion would be measuring a stale baseline rather than the real one.
 */
function reseed(view: ReturnType<typeof renderIntl>) {
  view.rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SettingsSectionContent />
    </NextIntlClientProvider>,
  );
}

/**
 * The two marketing boxes, in render order (ours, then the partner's).
 *
 * Read off the DOM rather than by test id, and deliberately *not* by taking
 * every checkbox on the page: the spoken-language group above renders its own,
 * so the marketing boxes are found inside the group its legend names.
 */
function marketingBoxes() {
  const legend = screen.getByText(messages.settings.marketing.title);
  const group = legend.closest("fieldset");
  if (!group) throw new Error("the marketing group rendered no fieldset");
  return Array.from(
    group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
}

const saveButton = () => screen.getByRole("button", { name: /save changes/i });

const GROUP_TITLE = messages.settings.marketing.title;
const SOG_LABEL = messages.settings.marketing.schoolOfGaming;
const PROFILE_SAVED = messages.settings.profileUpdated;
/** The one sentence a failed save shows, profile half or consent half. */
const PROFILE_SAVE_FAILED = messages.settings.failedToUpdateProfile;
const NOT_GRANTED = messages.admin.users.marketing.notGranted;
const GRANTED = messages.admin.users.marketing.granted;

beforeEach(() => {
  vi.clearAllMocks();
  mine.data = [];
  mine.isError = false;
  forCustomer.data = [];
  auth.profile = createMockProfile();
  updateProfileAsync.mockResolvedValue(undefined);
  setConsentAsync.mockResolvedValue(undefined);
});

// --- The marketing group inside the Profile card --------------------------

describe("the marketing preferences group", () => {
  it("seeds each box from the stored answer, School of Gaming first", () => {
    mine.data = [
      // Deliberately the partner's row first: Postgres orders an enum by
      // declaration order and a select promises no order at all, so the render
      // order must come from the component rather than from the rows.
      consentRow("lynx_educate", true),
      consentRow("school_of_gaming", false),
    ];
    renderSettings();

    const [sog, lynx] = marketingBoxes();
    expect(sog.closest("label")?.textContent).toContain("School of Gaming");
    expect(lynx.closest("label")?.textContent).toContain("Lynx Educate");
    expect(sog.checked).toBe(false);
    expect(lynx.checked).toBe(true);
  });

  it("renders a consent with no row at all as unticked", () => {
    mine.data = [consentRow("school_of_gaming", true)];
    renderSettings();

    const [sog, lynx] = marketingBoxes();
    expect(sog.checked).toBe(true);
    // Never asked and answered no are different states in the database and the
    // same state on screen: both are "we may not mail you".
    expect(lynx.checked).toBe(false);
  });

  it("disables both boxes until the read resolves", () => {
    mine.data = undefined;
    renderSettings();

    for (const box of marketingBoxes()) expect(box.disabled).toBe(true);
  });

  // --- A read that failed, which is NOT the same state as one still loading ---
  //
  // Both arrive as `undefined` data, and treating them alike left a parent
  // looking at two boxes disabled forever with nothing saying why. A dead
  // control is a worse answer than a usable one showing an assumed baseline, so
  // a failed read renders unticked and enabled and the ordinary change-only
  // save runs against "nothing granted".

  describe("when the consent read fails", () => {
    it("renders both boxes enabled and unticked", () => {
      mine.data = undefined;
      mine.isError = true;
      renderSettings();

      for (const box of marketingBoxes()) {
        expect(box.disabled).toBe(false);
        expect(box.checked).toBe(false);
      }
    });

    // **The guardrail that makes the assumed baseline safe.** A parent who
    // granted a consent months ago, hits a network blip today and saves an
    // unrelated name change must not be silently withdrawn — and they are not,
    // because an untouched box equals the assumed baseline and is never sent.
    it("writes no consent at all when the boxes are left alone", async () => {
      mine.data = undefined;
      mine.isError = true;
      renderSettings();

      fireEvent.click(saveButton());

      await screen.findByText(PROFILE_SAVED);
      expect(updateProfileAsync).toHaveBeenCalledTimes(1);
      expect(setConsentAsync).not.toHaveBeenCalled();
    });

    // A box the parent actually moved is written as shown: submitting the form
    // is them saying the state in front of them is what they want on file. If
    // they already held it, the RPC no-ops and appends no event.
    it("writes exactly the consent the parent ticked", async () => {
      mine.data = undefined;
      mine.isError = true;
      renderSettings();

      fireEvent.click(marketingBoxes()[0]);
      fireEvent.click(saveButton());

      await screen.findByText(PROFILE_SAVED);
      expect(setConsentAsync).toHaveBeenCalledTimes(1);
      expect(setConsentAsync.mock.calls[0][0]).toEqual({
        consentType: "school_of_gaming",
        granted: true,
        source: "settings",
      });
    });
  });

  it("keeps a tick as an unsaved edit — nothing is written until Save", () => {
    mine.data = [];
    renderSettings();

    fireEvent.click(marketingBoxes()[1]);

    expect(marketingBoxes()[1].checked).toBe(true);
    expect(setConsentAsync).not.toHaveBeenCalled();
    expect(updateProfileAsync).not.toHaveBeenCalled();
  });

  it("writes only the consents that changed, naming the answer and the source", async () => {
    // Ours is already on and untouched; the partner's is switched on. One write.
    mine.data = [consentRow("school_of_gaming", true)];
    renderSettings();

    fireEvent.click(marketingBoxes()[1]);
    fireEvent.click(saveButton());

    await waitFor(() => expect(setConsentAsync).toHaveBeenCalledTimes(1));
    expect(setConsentAsync.mock.calls[0][0]).toEqual({
      consentType: "lynx_educate",
      granted: true,
      // `settings` is one of the two sources the RPC accepts; `registration` is
      // refused there and must never be sent from a signed-in surface.
      source: "settings",
    });
  });

  it("writes an untick as an explicit no", async () => {
    mine.data = [consentRow("school_of_gaming", true)];
    renderSettings();

    fireEvent.click(marketingBoxes()[0]);
    fireEvent.click(saveButton());

    await waitFor(() => expect(setConsentAsync).toHaveBeenCalledTimes(1));
    expect(setConsentAsync.mock.calls[0][0]).toEqual({
      consentType: "school_of_gaming",
      granted: false,
      source: "settings",
    });
  });

  it("writes nothing at all when no box was touched", async () => {
    mine.data = [consentRow("school_of_gaming", true)];
    renderSettings();

    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    expect(updateProfileAsync).toHaveBeenCalledTimes(1);
    expect(setConsentAsync).not.toHaveBeenCalled();
  });

  it("saves the profile and the consents on one click, profile first", async () => {
    const order: string[] = [];
    updateProfileAsync.mockImplementation(async () => {
      order.push("profile");
    });
    setConsentAsync.mockImplementation(async () => {
      order.push("consent");
    });
    mine.data = [];
    renderSettings();

    fireEvent.click(marketingBoxes()[0]);
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    // The consent RPCs are separate writes and go after the profile row, so a
    // refused consent cannot roll back a profile update that already landed —
    // and cannot stop one from being attempted.
    expect(order).toEqual(["profile", "consent"]);
  });

  it("shows our own translated failure — never the database's English — and no success line", async () => {
    // A consent write is an `.rpc()`, so a refusal arrives as a PostgrestError
    // carrying raw Postgres English ("new row violates row-level security
    // policy"). The card prints an error's `message` verbatim, so the loop
    // re-throws its own translated sentence rather than letting that through:
    // it is untranslated, it means nothing to a parent, and it leaks the shape
    // of the schema.
    setConsentAsync.mockRejectedValue(
      new Error("new row violates row-level security policy"),
    );
    mine.data = [];
    renderSettings();

    fireEvent.click(marketingBoxes()[0]);
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVE_FAILED);
    expect(
      screen.queryByText(/row-level security/i),
      "raw Postgres English reached the page",
    ).toBeNull();
    // The profile half did land; saying "saved" would be the card claiming more
    // than happened.
    expect(updateProfileAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PROFILE_SAVED)).toBeNull();
    // The edit is local and the failed write left it alone, so Save again
    // re-attempts exactly the consent that is still outstanding.
    expect(marketingBoxes()[0].checked).toBe(true);
  });

  it("retries only what still differs after a partial failure", async () => {
    // Ours is switched ON and the partner's OFF in one edit, so the save has
    // two writes to make. The first lands; the second is refused.
    mine.data = [consentRow("lynx_educate", true)];
    setConsentAsync
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("refused"));
    const view = renderSettings();

    fireEvent.click(marketingBoxes()[0]); // school_of_gaming → true
    fireEvent.click(marketingBoxes()[1]); // lynx_educate → false
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVE_FAILED);
    expect(setConsentAsync).toHaveBeenCalledTimes(2);

    // **The retry is the claim under test.** The first write landed, so the
    // query invalidation it triggered brings that consent back as the saved
    // value — and the loop compares against the saved value, not against a
    // "dirty" flag. So pressing Save again must re-send the failed one alone;
    // re-sending the successful one would cost a round trip and stamp a second
    // "source: settings" touch the parent never made.
    mine.data = [
      consentRow("school_of_gaming", true),
      consentRow("lynx_educate", true),
    ];
    reseed(view);
    setConsentAsync.mockClear();
    setConsentAsync.mockResolvedValue(undefined);
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    expect(setConsentAsync).toHaveBeenCalledTimes(1);
    expect(setConsentAsync.mock.calls[0][0]).toEqual({
      consentType: "lynx_educate",
      granted: false,
      source: "settings",
    });
  });

  it("disables the boxes while a save is in flight", async () => {
    // Never resolves: this is the window a second click would land in.
    updateProfileAsync.mockImplementation(() => new Promise(() => {}));
    mine.data = [];
    renderSettings();

    fireEvent.click(saveButton());

    await waitFor(() => expect(marketingBoxes()[0].disabled).toBe(true));
    expect(marketingBoxes()[1].disabled).toBe(true);
  });
});

describe("who gets the marketing preferences group", () => {
  it("renders it for a parent", () => {
    renderSettings();

    expect(screen.getByText(GROUP_TITLE)).toBeTruthy();
    expect(screen.getByText(SOG_LABEL)).toBeTruthy();
  });

  it("renders none for a gedu, whose consents the database refuses to hold", () => {
    auth.profile = createMockProfile({ role: "gedu" });
    renderIntl(<SettingsSectionContent />);

    expect(screen.queryByText(GROUP_TITLE)).toBeNull();
  });

  it("renders none for a gamer, whose address reaches nobody", () => {
    auth.profile = createMockProfile({ role: "gamer" });
    renderIntl(<SettingsSectionContent />);

    expect(screen.queryByText(GROUP_TITLE)).toBeNull();
  });
});

// --- The admin block ------------------------------------------------------

/** What the overwhelming majority of accounts carry: nothing. */
const NO_ATTRIBUTION: UtmAttribution = {
  source: null,
  medium: null,
  campaign: null,
};

const ATTRIBUTION_LABELS = messages.admin.users.marketing.utm;

describe("the admin marketing block", () => {
  // The admin details-page rule, made a test: every stored property is visible
  // on the details page. An attribution block that hid its empty fields made
  // "this account has no medium" and "this page does not show mediums" look
  // identical, which is the audit this card exists to allow failing silently.
  it("shows all three attribution fields, empty ones included", () => {
    forCustomer.data = [];
    renderIntl(
      <UserMarketingCard
        attribution={{ source: "lynx", medium: null, campaign: "lynx-summer-a" }}
        customerId={CUSTOMER_ID}
      />,
    );

    expect(screen.getByText(ATTRIBUTION_LABELS.source)).toBeTruthy();
    expect(screen.getByText(ATTRIBUTION_LABELS.medium)).toBeTruthy();
    expect(screen.getByText(ATTRIBUTION_LABELS.campaign)).toBeTruthy();
    expect(screen.getByText("lynx")).toBeTruthy();
    expect(screen.getByText("lynx-summer-a")).toBeTruthy();
    // The one field this account never carried says so, rather than vanishing.
    expect(screen.getByText(messages.common.notSet)).toBeTruthy();
  });

  // A gedu can arrive through a campaign link and can hold no marketing
  // consent, so their card is the attribution block alone. An empty pair of
  // tiles would report a question we never asked them as an answer they never
  // gave.
  it("shows attribution but no preferences when there is no customer", () => {
    forCustomer.data = [];
    renderIntl(
      <UserMarketingCard
        attribution={{ source: "lynx", medium: null, campaign: null }}
        customerId={null}
      />,
    );

    expect(screen.getByText(ATTRIBUTION_LABELS.source)).toBeTruthy();
    expect(
      screen.queryByText(messages.admin.users.marketing.preferences),
    ).toBeNull();
    expect(
      screen.queryByText(messages.admin.users.marketing.schoolOfGaming),
    ).toBeNull();
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
  });

  it("reports both consents as not granted for a customer with no rows", () => {
    forCustomer.data = [];
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

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
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

    expect(screen.getByText(GRANTED)).toBeTruthy();
    expect(screen.getByText(NOT_GRANTED)).toBeTruthy();
    // Two rows, two stamps. The date is formatted in the viewer's zone
    // (Europe/Helsinki, from the mocked provider) rather than the runtime
    // default, which is what the timestamptz rule requires.
    expect(screen.getAllByText(/^since /)).toHaveLength(2);
  });

  it("states nothing at all until the read lands", () => {
    forCustomer.data = undefined;
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

    // Saying "not granted" and correcting it a round trip later would be the
    // card stating a fact it did not have. The labels are already on screen.
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
    expect(screen.queryByText(GRANTED)).toBeNull();
    expect(
      screen.getByText(messages.admin.users.marketing.lynxEducate),
    ).toBeTruthy();
  });
});

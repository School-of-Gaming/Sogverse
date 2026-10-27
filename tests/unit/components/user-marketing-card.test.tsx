import { describe, it, expect, vi, beforeEach } from "vitest";
// First among the imports, and load-bearing: the `vi.mock` factories below run
// during this file's import phase and read their module bodies out of here.
import {
  notificationPreferencesCardModule,
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
import enSettings from "@/../messages/en/settings.json";
import enCommon from "@/../messages/en/common.json";
import enAdmin from "@/../messages/en/admin.json";
import { UserMarketingCard } from "@/components/admin/user-marketing-card";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";
import { createMockProfile } from "../../mocks/supabase";
import type { UtmAttribution } from "@/lib/utm";
import type { MarketingConsent, MarketingConsentType, Profile } from "@/types";

const messages = { settings: enSettings, common: enCommon, admin: enAdmin };

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
 * of this: it must render the partner's consent whatever the database holds,
 * and a customer with no row has to read as *not granted* rather than a blank.
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

vi.mock("@/services/marketing-consents/marketing-consents.queries", () => ({
  useMyMarketingConsents: () => ({ data: mine.data, isError: mine.isError }),
  useMarketingConsentsForCustomer: () => ({ data: forCustomer.data }),
  useSetMarketingConsent: () => ({ mutateAsync: setConsentAsync }),
}));

// School of Gaming's own list, read from Klaviyo. Not the shared factory: this
// file asserts on what a Save sends there.
const emailMarketing: { data: { subscribed: boolean } | undefined } = {
  data: { subscribed: false },
};
const setEmailMarketingAsync = vi.fn();
vi.mock("@/services/email-marketing/email-marketing.queries", () => ({
  useMyEmailMarketing: () => ({
    data: emailMarketing.data,
    isError: false,
    isFetching: emailMarketing.data === undefined,
    refetch: vi.fn(),
  }),
  useSetMyEmailMarketing: () => ({ mutateAsync: setEmailMarketingAsync }),
}));

// Not the shared factory: this file asserts on the profile write itself, and
// the factory hands out a fresh spy per render.
vi.mock("@/services/users/users.queries", () => ({
  useUpdateProfile: () => ({ mutateAsync: updateProfileAsync }),
  useSendVerificationEmail: () => ({ mutate: vi.fn() }),
}));

const auth: { profile: Profile } = { profile: createMockProfile() };
vi.mock("@/providers", () => providersModule(() => auth.profile));
vi.mock("@/components/settings/notification-preferences-card", () =>
  notificationPreferencesCardModule(),
);
vi.mock("@/services/locations/locations.queries", () => locationsServiceModule());
vi.mock("@/services/minecraft/minecraft.queries", () => minecraftServiceModule());
vi.mock("@/services/roblox/roblox.queries", () => robloxServiceModule());
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
 * The marketing group's boxes, ours and then the partner's.
 *
 * Read off the DOM rather than by test id, and deliberately *not* by taking
 * every checkbox on the page: the spoken-language group above renders its own,
 * so the marketing boxes are found inside the group its legend names — and the
 * group holding exactly these two is part of the claim.
 */
function marketingBoxes() {
  const legend = screen.getByText(messages.settings.marketing.title);
  const group = legend.closest("fieldset");
  if (!group) throw new Error("the marketing group rendered no fieldset");
  const boxes = Array.from(
    group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  );
  expect(boxes).toHaveLength(2);
  return boxes;
}

const schoolOfGamingBox = () => marketingBoxes()[0];
const lynxBox = () => marketingBoxes()[1];

const saveButton = () => screen.getByRole("button", { name: /save changes/i });

const GROUP_TITLE = messages.settings.marketing.title;
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
  emailMarketing.data = { subscribed: false };
  setEmailMarketingAsync.mockResolvedValue({ subscribed: true });
});

// --- The marketing group inside the Profile card --------------------------

describe("the marketing preferences group", () => {
  it("asks our own question from Klaviyo's answer, then the partner's from Sogverse's", () => {
    mine.data = [consentRow("lynx_educate", true)];
    emailMarketing.data = { subscribed: true };
    renderSettings();

    expect(schoolOfGamingBox().labels?.[0]?.textContent).toBe(
      messages.settings.marketing.schoolOfGaming,
    );
    expect(schoolOfGamingBox().checked).toBe(true);
    const box = lynxBox();
    expect(box.closest("label")?.textContent).toContain("Lynx Educate");
    expect(box.checked).toBe(true);
  });

  it("sends a moved School of Gaming box to Klaviyo on Save, after the profile", async () => {
    renderSettings();

    fireEvent.click(schoolOfGamingBox());
    expect(setEmailMarketingAsync).not.toHaveBeenCalled();
    fireEvent.click(saveButton());

    await waitFor(() => expect(setEmailMarketingAsync).toHaveBeenCalledWith(true));
    expect(updateProfileAsync).toHaveBeenCalled();
    expect(setConsentAsync).not.toHaveBeenCalled();
  });

  it("sends nothing to Klaviyo when the School of Gaming box was not touched", async () => {
    emailMarketing.data = { subscribed: true };
    renderSettings();

    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByText(PROFILE_SAVED)).not.toBeNull());
    expect(setEmailMarketingAsync).not.toHaveBeenCalled();
  });

  it("renders a consent with no row at all as unticked", () => {
    mine.data = [];
    renderSettings();

    // Never asked and answered no are different states in the database and the
    // same state on screen: both are "we may not share your address".
    expect(lynxBox().checked).toBe(false);
  });

  it("disables the box until the read resolves", () => {
    mine.data = undefined;
    renderSettings();

    expect(lynxBox().disabled).toBe(true);
  });

  // --- A read that failed, which is NOT the same state as one still loading ---
  //
  // Both arrive as `undefined` data, and treating them alike left a parent
  // looking at a box disabled forever with nothing saying why. A dead control
  // is a worse answer than a usable one showing an assumed baseline, so a
  // failed read renders unticked and enabled and the ordinary change-only save
  // runs against "nothing granted".

  describe("when the consent read fails", () => {
    it("renders the box enabled and unticked", () => {
      mine.data = undefined;
      mine.isError = true;
      renderSettings();

      expect(lynxBox().disabled).toBe(false);
      expect(lynxBox().checked).toBe(false);
    });

    // **The guardrail that makes the assumed baseline safe.** A parent who
    // granted a consent months ago, hits a network blip today and saves an
    // unrelated name change must not be silently withdrawn — and they are not,
    // because an untouched box equals the assumed baseline and is never sent.
    it("writes no consent at all when the box is left alone", async () => {
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

      fireEvent.click(lynxBox());
      fireEvent.click(saveButton());

      await screen.findByText(PROFILE_SAVED);
      expect(setConsentAsync).toHaveBeenCalledTimes(1);
      expect(setConsentAsync.mock.calls[0][0]).toEqual({
        consentType: "lynx_educate",
        granted: true,
        source: "settings",
      });
    });
  });

  it("keeps a tick as an unsaved edit — nothing is written until Save", () => {
    mine.data = [];
    renderSettings();

    fireEvent.click(lynxBox());

    expect(lynxBox().checked).toBe(true);
    expect(setConsentAsync).not.toHaveBeenCalled();
    expect(updateProfileAsync).not.toHaveBeenCalled();
  });

  it("writes a tick, naming the answer and the source", async () => {
    mine.data = [];
    renderSettings();

    fireEvent.click(lynxBox());
    fireEvent.click(saveButton());

    await waitFor(() => expect(setConsentAsync).toHaveBeenCalledTimes(1));
    expect(setConsentAsync.mock.calls[0][0]).toEqual({
      consentType: "lynx_educate",
      granted: true,
      // `settings` is one of the two sources the RPC accepts.
      source: "settings",
    });
  });

  it("writes an untick as an explicit no", async () => {
    mine.data = [consentRow("lynx_educate", true)];
    renderSettings();

    fireEvent.click(lynxBox());
    fireEvent.click(saveButton());

    await waitFor(() => expect(setConsentAsync).toHaveBeenCalledTimes(1));
    expect(setConsentAsync.mock.calls[0][0]).toEqual({
      consentType: "lynx_educate",
      granted: false,
      source: "settings",
    });
  });

  it("writes nothing at all when the box was not touched", async () => {
    mine.data = [consentRow("lynx_educate", true)];
    renderSettings();

    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    expect(updateProfileAsync).toHaveBeenCalledTimes(1);
    expect(setConsentAsync).not.toHaveBeenCalled();
  });

  it("saves the profile and the consent on one click, profile first", async () => {
    const order: string[] = [];
    updateProfileAsync.mockImplementation(async () => {
      order.push("profile");
    });
    setConsentAsync.mockImplementation(async () => {
      order.push("consent");
    });
    mine.data = [];
    renderSettings();

    fireEvent.click(lynxBox());
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    // The consent RPC is a separate write and goes after the profile row, so a
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

    fireEvent.click(lynxBox());
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
    expect(lynxBox().checked).toBe(true);
  });

  it("shows the same sentence, not the database's English, when the profile write itself fails", async () => {
    // The profile half is a direct `.update()`, so its refusal is a
    // PostgrestError too — a plain object with a `message`, not an Error.
    updateProfileAsync.mockRejectedValue({
      message: 'new row for relation "profiles" violates check constraint',
      code: "23514",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderSettings();

    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVE_FAILED);
    expect(
      screen.queryByText(/violates check constraint/i),
      "raw Postgres English reached the page",
    ).toBeNull();
    expect(setConsentAsync).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("compares against the saved answer, so a landed write is not sent again", async () => {
    mine.data = [];
    const view = renderSettings();

    fireEvent.click(lynxBox());
    fireEvent.click(saveButton());

    await screen.findByText(PROFILE_SAVED);
    expect(setConsentAsync).toHaveBeenCalledTimes(1);

    // **The claim under test.** The write landed, so the query invalidation it
    // triggered brings the consent back as the saved value — and the loop
    // compares against the saved value, not against a "dirty" flag. So a second
    // Save must send nothing; re-sending would cost a round trip and stamp a
    // second "source: settings" touch the parent never made.
    mine.data = [consentRow("lynx_educate", true)];
    reseed(view);
    setConsentAsync.mockClear();
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateProfileAsync).toHaveBeenCalledTimes(2));
    expect(setConsentAsync).not.toHaveBeenCalled();
  });

  it("disables the box while a save is in flight", async () => {
    // Never resolves: this is the window a second click would land in.
    updateProfileAsync.mockImplementation(() => new Promise(() => {}));
    mine.data = [];
    renderSettings();

    fireEvent.click(saveButton());

    await waitFor(() => expect(lynxBox().disabled).toBe(true));
  });
});

describe("who gets the marketing preferences group", () => {
  it("renders it for a parent", () => {
    renderSettings();

    expect(screen.getByText(GROUP_TITLE)).toBeTruthy();
    expect(lynxBox()).toBeTruthy();
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
  content: null,
  term: null,
};

describe("the admin marketing block", () => {
  // The admin details-page rule, made a test: every stored property is visible
  // on the details page. An attribution block that hid its empty fields made
  // "this account has no medium" and "this page does not show mediums" look
  // identical, which is the audit this card exists to allow failing silently.
  it("shows all five attribution fields, empty ones included", () => {
    forCustomer.data = [];
    renderIntl(
      <UserMarketingCard
        attribution={{
          ...NO_ATTRIBUTION,
          source: "lynx",
          campaign: "lynx-summer-a",
          term: "minecraft",
        }}
        customerId={CUSTOMER_ID}
      />,
    );

    expect(screen.getByText("lynx")).toBeTruthy();
    expect(screen.getByText("lynx-summer-a")).toBeTruthy();
    expect(screen.getByText("minecraft")).toBeTruthy();
    // The two fields this account never carried say so, rather than vanishing.
    expect(screen.getAllByText(messages.common.notSet)).toHaveLength(2);
  });

  // The labels are the tags themselves, never translated: the name a marketer
  // types into a link is the one they look for here, in every locale.
  it("labels each field with its tag, in the order a campaign link spells them", () => {
    forCustomer.data = [];
    const { container } = renderIntl(
      <UserMarketingCard attribution={NO_ATTRIBUTION} customerId={null} />,
    );

    expect(
      Array.from(container.querySelectorAll("dt"), (dt) => dt.textContent),
    ).toEqual([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ]);
  });

  // A gedu can arrive through a campaign link and can hold no marketing
  // consent, so their card is the attribution block alone. An empty tile would
  // report a question we never asked them as an answer they never gave.
  it("shows attribution but no preferences when there is no customer", () => {
    forCustomer.data = [];
    renderIntl(
      <UserMarketingCard
        attribution={{ ...NO_ATTRIBUTION, source: "lynx" }}
        customerId={null}
      />,
    );

    expect(screen.getByText("utm_source")).toBeTruthy();
    expect(
      screen.queryByText(messages.admin.users.marketing.preferences),
    ).toBeNull();
    expect(
      screen.queryByText(messages.admin.users.marketing.lynxEducate),
    ).toBeNull();
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
  });

  it("reports the partner's consent as not granted for a customer with no row", () => {
    forCustomer.data = [];
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

    expect(screen.getAllByText(NOT_GRANTED)).toHaveLength(1);
    expect(screen.queryByText(GRANTED)).toBeNull();
    // Still named — an admin reads the answer off a fixed row rather than off
    // whichever rows happen to exist.
    expect(
      screen.getByText(messages.admin.users.marketing.lynxEducate),
    ).toBeTruthy();
  });

  it("reports the consent's own state, with the moment a stored row carries", () => {
    forCustomer.data = [
      consentRow("lynx_educate", true, "2026-04-09T10:15:00.000Z"),
    ];
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

    expect(screen.getByText(GRANTED)).toBeTruthy();
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
    // The date is formatted in the viewer's zone (Europe/Helsinki, from the
    // mocked provider) rather than the runtime default, which is what the
    // timestamptz rule requires.
    expect(screen.getAllByText(/^since /)).toHaveLength(1);
  });

  it("states nothing at all until the read lands", () => {
    forCustomer.data = undefined;
    renderIntl(<UserMarketingCard attribution={NO_ATTRIBUTION} customerId={CUSTOMER_ID} />);

    // Saying "not granted" and correcting it a round trip later would be the
    // card stating a fact it did not have. The label is already on screen.
    expect(screen.queryByText(NOT_GRANTED)).toBeNull();
    expect(screen.queryByText(GRANTED)).toBeNull();
    expect(
      screen.getByText(messages.admin.users.marketing.lynxEducate),
    ).toBeTruthy();
  });
});

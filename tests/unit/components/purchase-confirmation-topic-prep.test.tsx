import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { ProductBrowseRow, ProductTopic } from "@/types";

/**
 * The "Before the first session" guide on the confirmation page.
 *
 * What is under test is the page's own decision — whether the card is drawn at
 * all — rather than what the guide says, which is the registry's and the
 * catalog's business and is tested there. Three answers have to hold: an
 * enrolled family with a guide gets the card, a waitlisted one never does
 * (there is no seat yet, so there is no first session to be ready for), and a
 * render with nothing to say leaves no empty card behind — which is now an
 * in-person answer alone, since every remote product ends its guide on the
 * shared voice-room step.
 *
 * The translations are stubbed to echo the key, so the assertions are about
 * which keys the page reaches for and not about the wording in `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

// The overview card inside the summary reads the viewer's clock and zone from
// the providers the real page mounts it under.
vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

/** A step of the Minecraft Java guide, and the key its title is composed from. */
const ACCOUNT_STEP = "steps.minecraftJavaAccount.title";
const INSTALL_STEP = "steps.minecraftJavaInstall.title";
/** The accounts-only form, on a topic whose account is the family's own. */
const ROBLOX_ACCOUNT_STEP = "steps.robloxStudioAccount.title";
const ROBLOX_INSTALL_STEP = "steps.robloxStudioInstall.title";
const ACCOUNTS_ONLY_INTRO = "accountsOnlyIntro.roblox_studio";
/** The step every remote guide ends on, whatever its topic. */
const REMOTE_STEP = "steps.remoteSession.title";

/**
 * One fixture product, re-topiced per case. Taking the row from the shared
 * scenario fixture keeps it a complete `ProductBrowseRow` with no casts; only
 * the two columns the guide reads are overridden.
 */
function productWith(topic: ProductTopic, isRemote: boolean): ProductBrowseRow {
  const { product } = buildScenarioFixture("consumer-club-full-waitlist");
  return { ...product, topic, is_remote: isRemote };
}

function renderConfirmation(
  topic: ProductTopic,
  { isRemote = true, waitlisted = false }: { isRemote?: boolean; waitlisted?: boolean } = {},
) {
  return render(
    <PurchaseConfirmationView
      product={productWith(topic, isRemote)}
      participantName="Aino"
      outcome={waitlisted ? "waitlisted" : "enrolled"}
      waitlistPosition={waitlisted ? 3 : null}
    />,
  );
}

describe("the confirmation page's “Before the first session” card", () => {
  it("draws the guide on an enrolled signup", () => {
    const { getByText } = renderConfirmation("minecraft_java");
    getByText(ACCOUNT_STEP);
    getByText(INSTALL_STEP);
  });

  it("draws nothing on a waitlist join", () => {
    const { queryByText } = renderConfirmation("minecraft_java", { waitlisted: true });
    expect(queryByText(ACCOUNT_STEP)).toBeNull();
  });

  it("draws nothing for a label-only topic on an in-person product", () => {
    const { queryByText } = renderConfirmation("programming", { isRemote: false });
    expect(queryByText(ACCOUNT_STEP)).toBeNull();
    expect(queryByText(REMOTE_STEP)).toBeNull();
    // The rest of the page is untouched — this is an absent card, not a
    // broken render.
    expect(queryByText("summaryTitle")).not.toBeNull();
  });

  it("draws the one-step guide for a label-only topic on a remote product", () => {
    // The topic brings no steps, but the product does: the room is browser-
    // based and the mic has to work, so the card is the shared step under the
    // generic intro rather than a topic's.
    const { getByText, queryByText } = renderConfirmation("programming");
    getByText(REMOTE_STEP);
    getByText("remoteOnlyIntro");
    expect(queryByText(ACCOUNT_STEP)).toBeNull();
  });

  /**
   * In person School of Gaming brings the machines with everything installed,
   * so the card shortens to the account steps under the intro written for that
   * form. Roblox Studio is the shape: the account is the family's own, so it
   * survives the filter while the install and test steps do not.
   */
  it("draws the accounts-only form for an in-person product", () => {
    const { getByText, queryByText } = renderConfirmation("roblox_studio", {
      isRemote: false,
    });
    getByText(ROBLOX_ACCOUNT_STEP);
    getByText(ACCOUNTS_ONLY_INTRO);
    expect(queryByText(ROBLOX_INSTALL_STEP)).toBeNull();
  });

  /**
   * A topic whose every step belongs to something we supply — the machine, and
   * for Minecraft the login on it — has nothing to say in person, and the card
   * must not be drawn empty around it. That is why the page asks the shared
   * resolver rather than trusting the content component's own early return.
   */
  it("leaves no empty card where the filter removes every step", () => {
    const { container } = renderConfirmation("minecraft_education", {
      isRemote: false,
    });
    expect(container.textContent).not.toContain("steps.minecraftEducationInstall");
    expect(container.textContent).not.toContain("closing");
  });

  /**
   * The Minecraft topics are the same case: at our own venues the gamers use
   * School of Gaming's Minecraft accounts and in municipality clubs School of
   * Gaming's Minecraft Education accounts, so the login is not the family's to
   * arrange either and nothing renders.
   */
  it("draws nothing in person for a Minecraft topic", () => {
    const { container, queryByText } = renderConfirmation("minecraft_java", {
      isRemote: false,
    });
    expect(queryByText(ACCOUNT_STEP)).toBeNull();
    expect(queryByText(INSTALL_STEP)).toBeNull();
    expect(container.textContent).not.toContain("closing");
    // The rest of the page is untouched — an absent card, not a broken render.
    expect(queryByText("summaryTitle")).not.toBeNull();
  });
});

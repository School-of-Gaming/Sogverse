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
 * topic with nothing to say leaves no empty card behind.
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
const ACCOUNTS_ONLY_INTRO = "accountsOnlyIntro.minecraft_java";

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

  it("draws nothing for a topic that carries no guide", () => {
    const { queryByText } = renderConfirmation("programming");
    expect(queryByText(ACCOUNT_STEP)).toBeNull();
    // The rest of the page is untouched — this is an absent card, not a
    // broken render.
    expect(queryByText("summaryTitle")).not.toBeNull();
  });

  /**
   * In person School of Gaming brings the machines with everything installed,
   * so the card shortens to the account steps under the intro written for that
   * form.
   */
  it("draws the accounts-only form for an in-person product", () => {
    const { getByText, queryByText } = renderConfirmation("minecraft_java", {
      isRemote: false,
    });
    getByText(ACCOUNT_STEP);
    getByText(ACCOUNTS_ONLY_INTRO);
    expect(queryByText(INSTALL_STEP)).toBeNull();
  });

  /**
   * A topic whose every step belongs to a machine we supply has nothing to say
   * in person — and the card must not be drawn empty around it, which is why
   * the page asks the shared resolver rather than trusting the content
   * component's own early return.
   */
  it("leaves no empty card where the filter removes every step", () => {
    const { container } = renderConfirmation("minecraft_education", {
      isRemote: false,
    });
    expect(container.textContent).not.toContain("steps.minecraftEducationInstall");
    expect(container.textContent).not.toContain("closing");
  });
});

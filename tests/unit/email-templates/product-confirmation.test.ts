import { describe, it, expect, beforeAll } from "vitest";
import { buildProductConfirmationEmail } from "@/lib/email-templates/product-confirmation";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const DASHBOARD_URL = "https://sogverse.sog.gg/parent";

const base = {
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  productType: "consumer_club",
  mode: "subscription",
  priceAmount: "€40.00",
  dashboardUrl: DASHBOARD_URL,
} as const;

describe("buildProductConfirmationEmail", () => {
  it("names the participant, the product and its type", () => {
    const html = buildProductConfirmationEmail(t, "en", base);
    expect(html).toContain("Aino");
    expect(html).toContain("Minecraft 101");
    expect(html).toContain("Club");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("links My SOG", () => {
    const html = buildProductConfirmationEmail(t, "en", base);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Go to My SOG");
  });

  it("uses the verb the product type calls for", () => {
    const club = buildProductConfirmationEmail(t, "en", base);
    const event = buildProductConfirmationEmail(t, "en", { ...base, productType: "event" });
    expect(club).toContain("is enrolled in");
    expect(event).toContain("is joining");
    expect(event).toContain("Event");
  });

  it("escapes HTML in every value it is handed", () => {
    const html = buildProductConfirmationEmail(t, "en", {
      ...base,
      participantName: "<script>xss</script>",
      productName: "<b>Club</b>",
      priceAmount: "<i>€40.00</i>",
    });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
    expect(html).not.toContain("<b>Club</b>");
    expect(html).not.toContain("<i>€40.00</i>");
  });

  /**
   * The four modes are the whole shape of this mail: three price shapes and one
   * outcome with no price at all. Each case asserts what its own variant says
   * *and* what it must not — a waitlist mail that still carries a monthly price
   * would render perfectly and tell a parent they are being billed for a seat
   * they do not have.
   */
  describe("modes", () => {
    it("states a monthly price on a subscription", () => {
      const html = buildProductConfirmationEmail(t, "en", base);
      expect(html).toContain("€40.00 / month");
      expect(html).toContain("billed every month");
      expect(html).not.toContain("one-time");
    });

    it("states a one-time price on an upfront purchase", () => {
      const html = buildProductConfirmationEmail(t, "en", { ...base, mode: "upfront" });
      expect(html).toContain("€40.00 (one-time)");
      expect(html).toContain("nothing more to pay");
      expect(html).not.toContain("billed every month");
    });

    it("says free rather than showing a blank price", () => {
      const html = buildProductConfirmationEmail(t, "en", { ...base, mode: "free", priceAmount: null });
      expect(html).toContain("Price: Free");
      expect(html).toContain("nothing to pay");
    });

    it("prints no price line at all on a waitlist join", () => {
      const html = buildProductConfirmationEmail(t, "en", { ...base, mode: "waitlist", priceAmount: null });
      expect(html).toContain("on the waitlist");
      expect(html).not.toContain("Price");
      expect(html).not.toContain("billed every month");
    });

    /** No frozen queue number — it goes stale and the reader can't tell. */
    it("points at My SOG for the live waitlist position instead of stating one", () => {
      const html = buildProductConfirmationEmail(t, "en", { ...base, mode: "waitlist", priceAmount: null });
      expect(html).toContain("where you stand in My SOG");
      expect(html).not.toContain("position");
    });

    /**
     * A paid mode with no amount in hand: the price line disappears rather than
     * rendering an empty one, because a blank beside a product name reads as
     * "free".
     */
    it("omits the price line when a paid mode has no amount", () => {
      const html = buildProductConfirmationEmail(t, "en", { ...base, priceAmount: null });
      expect(html).not.toContain("Price:");
      expect(html).toContain("billed every month");
    });
  });

  /**
   * The self seat, same reasoning as the enrollment mails: the recipient and the
   * participant are one person, so the copy moves to the second person by
   * swapping whole keys — reading your own name back at you in the third person
   * is the shape of a mail sent about somebody else.
   */
  describe("the parent's own seat", () => {
    it("swaps the whole sentence rather than naming the reader", () => {
      const html = buildProductConfirmationEmail(t, "en", {
        ...base,
        participantName: "Marja",
        isSelfSeat: true,
      });
      expect(html).toContain("You’re enrolled in");
      expect(html).not.toContain("is enrolled in");
      // The self variant names nobody: the reader *is* the participant, so the
      // name appearing anywhere means a third-person sentence survived.
      expect(html).not.toContain("Marja");
    });

    it("moves the placement line into the second person too", () => {
      const html = buildProductConfirmationEmail(t, "en", {
        ...base,
        participantName: "Marja",
        isSelfSeat: true,
      });
      expect(html).toContain("We’ll place you in a group");
      expect(html).not.toContain("Marja");
    });

    it("takes the second person on the waitlist as well", () => {
      const html = buildProductConfirmationEmail(t, "en", {
        ...base,
        participantName: "Marja",
        isSelfSeat: true,
        mode: "waitlist",
        priceAmount: null,
      });
      expect(html).toContain("You’re on the waitlist for");
      expect(html).not.toContain("Marja");
    });
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import {
  buildProductConfirmationEmail,
  productConfirmationAttachments,
  productConfirmationText,
  resolveProductConfirmation,
  type ProductConfirmationEmailOptions,
} from "@/lib/email-templates/product-confirmation";
import type { ProductConfirmationInvitationInput } from "@/lib/email-templates/product-confirmation-invitation";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

const DASHBOARD_URL = "https://sogverse.sog.gg/parent";
const PARTICIPATION_ID = "3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15";

/** Monday 4 January 2027, 10:00 in Helsinki. */
const NOW = new Date("2027-01-04T08:00:00Z");

/**
 * A schedule that composes a real invitation, for the cases that are about the
 * invitation. Everything else runs with `invitation: null`, which is the mail
 * this template sent before the calendar existed and still sends for a product
 * with no schedule.
 */
const SCHEDULE: ProductConfirmationInvitationInput = {
  participationId: PARTICIPATION_ID,
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  productType: "consumer_club",
  shortDescription: null,
  timezone: "Europe/Helsinki",
  startDate: "2027-01-04",
  endDate: null,
  slots: [{ weekday: 0, startTime: "16:00", durationMinutes: 60 }],
  isRemote: true,
  siteName: null,
  siteAddress: null,
  siteNote: null,
  attendeeName: "Marja Virtanen",
  attendeeEmail: "marja@example.com",
  dashboardUrl: DASHBOARD_URL,
  now: NOW,
};

const base: ProductConfirmationEmailOptions = {
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  productType: "consumer_club",
  mode: "subscription",
  priceAmount: "€40.00",
  dashboardUrl: DASHBOARD_URL,
  invitation: null,
};

/** One render's content, resolved exactly as the registry and the sender do. */
function resolve(overrides: Partial<ProductConfirmationEmailOptions> = {}) {
  return resolveProductConfirmation(t, "en", { ...base, ...overrides });
}

function render(overrides: Partial<ProductConfirmationEmailOptions> = {}): string {
  return buildProductConfirmationEmail(t, "en", resolve(overrides));
}

describe("buildProductConfirmationEmail", () => {
  it("names the participant, the product and its type", () => {
    const html = render(base);
    expect(html).toContain("Aino");
    expect(html).toContain("Minecraft 101");
    expect(html).toContain("Club");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("links My SOG", () => {
    const html = render(base);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Go to My SOG");
  });

  it("uses the verb the product type calls for", () => {
    const club = render(base);
    const event = render({ ...base, productType: "event" });
    expect(club).toContain("is enrolled in");
    expect(event).toContain("is joining");
    expect(event).toContain("Event");
  });

  /**
   * The product name is emphasised by weight, not by the brand secondary it used
   * to carry: Gmail's dark-theme rewriting left that purple unreadable against
   * the card, and weight is the emphasis every client renders the same way.
   * Brand color survives only where the layout defends it — the header and the
   * button fills — so a colored product name reaching the body is a regression.
   */
  it("emphasises the product name by weight, in the body's own color", () => {
    const html = render(base);
    expect(html).toContain(`<strong style="color:${DARK_THEME.foreground};">Minecraft 101</strong>`);
    expect(html).not.toContain(BRAND.secondary);
    expect(html).not.toContain("brand-secondary");
  });

  it("escapes HTML in every value it is handed", () => {
    const html = render({
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
   * The five modes are the whole shape of this mail: four price shapes and one
   * outcome with no price at all. Each case asserts what its own variant says
   * *and* what it must not — a waitlist mail that still carries a monthly price
   * would render perfectly and tell a parent they are being billed for a seat
   * they do not have.
   */
  describe("modes", () => {
    it("states a monthly price on a subscription", () => {
      const html = render(base);
      expect(html).toContain("€40.00 / month");
      expect(html).toContain("billed every month");
      expect(html).not.toContain("one-time");
    });

    it("states a one-time price on an upfront purchase", () => {
      const html = render({ ...base, mode: "upfront" });
      expect(html).toContain("€40.00 (one-time)");
      expect(html).toContain("nothing more to pay");
      expect(html).not.toContain("billed every month");
    });

    it("says free rather than showing a blank price", () => {
      const html = render({ ...base, mode: "free", priceAmount: null });
      expect(html).toContain("Price: Free");
      expect(html).toContain("nothing to pay");
    });

    /**
     * A municipality registration costs the family nothing at our till, which
     * is not the same statement as "Free": some municipalities charge a small
     * fee of their own, and the family has already been told so by their
     * council. The mail says who bears the cost on the price line and adds
     * nothing to the "what happens next" list, so the negative assertions are
     * the load-bearing half of this case — including the absent bullet, which
     * is the only place a second, wordier version of the same claim could
     * creep back in.
     */
    it("says who bears the cost of a municipality registration, never 'Free'", () => {
      const html = render({ ...base, mode: "external", priceAmount: null });
      expect(html).toContain("Price: Paid for by your municipality");
      expect(html).not.toContain("Price: Free");
      expect(html).not.toContain("nothing to pay for this one");
      // Placement only — no cost bullet of any wording.
      expect(html).not.toContain("invoice");
      expect(html).toContain("in a group with a Gedu");
    });

    it("prints no price line at all on a waitlist join", () => {
      const html = render({ ...base, mode: "waitlist", priceAmount: null });
      expect(html).toContain("on the waitlist");
      expect(html).not.toContain("Price");
      expect(html).not.toContain("billed every month");
    });

    /** No frozen queue number — it goes stale and the reader can't tell. */
    it("points at My SOG for the live waitlist position instead of stating one", () => {
      const html = render({ ...base, mode: "waitlist", priceAmount: null });
      expect(html).toContain("where you stand in My SOG");
      expect(html).not.toContain("position");
    });

    /**
     * A paid mode with no amount in hand: the price line disappears rather than
     * rendering an empty one, because a blank beside a product name reads as
     * "free".
     */
    it("omits the price line when a paid mode has no amount", () => {
      const html = render({ ...base, priceAmount: null });
      expect(html).not.toContain("Price:");
      expect(html).toContain("billed every month");
    });
  });

  /**
   * The self seat: the recipient and the participant are one person, so the
   * copy moves to the second person by
   * swapping whole keys — reading your own name back at you in the third person
   * is the shape of a mail sent about somebody else.
   */
  describe("the parent's own seat", () => {
    it("swaps the whole sentence rather than naming the reader", () => {
      const html = render({
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
      const html = render({
        ...base,
        participantName: "Marja",
        isSelfSeat: true,
      });
      expect(html).toContain("We’ll place you in a group");
      expect(html).not.toContain("Marja");
    });

    it("takes the second person on the waitlist as well", () => {
      const html = render({
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

/**
 * The three artifacts a signup mail can carry, and the one thing that decides
 * all three: whether a calendar object could be composed at all.
 *
 * They are asserted together because they have to agree. A section describing a
 * schedule with no file to accept, or a file with nothing in the mail saying it
 * is there, is worse than the plain mail either would replace.
 */
describe("the calendar invitation", () => {
  it("states the session times where the schedule composes an entry", () => {
    const html = render({ invitation: SCHEDULE });

    expect(html).toContain("Session times");
    expect(html).toContain("Every Monday, 16:00–17:00");
    // The same sentences the calendar entry's own notes carry, so the mail and
    // the entry cannot disagree about when a club meets or where.
    expect(html).toContain("Sessions run online in My SOG");
    expect(html).toContain("A calendar invitation is attached");
  });

  it("renders none of it when there is no schedule to state", () => {
    const html = render();

    expect(html).not.toContain("Session times");
    expect(html).not.toContain("A calendar invitation is attached");
  });

  /**
   * A waitlist join is a place in a queue rather than a seat, so it composes no
   * entry however complete the product's schedule is — the resolver refuses it
   * before the composer is asked.
   */
  it("composes nothing for a waitlist join, schedule or no schedule", () => {
    const content = resolve({
      mode: "waitlist",
      priceAmount: null,
      invitation: SCHEDULE,
    });

    expect(content.invitation).toBeNull();
    expect(productConfirmationAttachments(content)).toEqual([]);
    expect(buildProductConfirmationEmail(t, "en", content)).not.toContain("Session times");
  });

  it("attaches the document as invite.ics, carrying the seat's own identifier", () => {
    const [attachment] = productConfirmationAttachments(resolve({ invitation: SCHEDULE }));

    expect(attachment.name).toBe("invite.ics");
    expect(attachment.text).toContain(`UID:${PARTICIPATION_ID}@sogverse`);
    expect(attachment.text).toContain("BEGIN:VCALENDAR");
    // What is sent is the base64; the decoded copy exists for the preview.
    expect(atob(attachment.contentBase64)).toContain("BEGIN:VCALENDAR");
  });

  /**
   * The text body is not a courtesy fallback — on a Microsoft mailbox it is
   * where the calendar entry's own notes come from — so it exists exactly when
   * a calendar part travels with the mail, and states the mail's own words.
   */
  it("states a plain-text body only when it carries the calendar part", () => {
    expect(productConfirmationText(t, resolve())).toBeUndefined();

    const text = productConfirmationText(t, resolve({ invitation: SCHEDULE }));
    expect(text).toContain("You’re all set!");
    expect(text).toContain("Aino is enrolled in Minecraft 101.");
    expect(text).toContain("Club: Minecraft 101");
    expect(text).toContain("Price: €40.00 / month");
    expect(text).toContain("Every Monday, 16:00–17:00");
    expect(text).toContain("What happens next");
    expect(text).toContain(DASHBOARD_URL);
    // The mail's words, not its markup: an entry's notes are read as text.
    expect(text).not.toContain("<");
  });
});

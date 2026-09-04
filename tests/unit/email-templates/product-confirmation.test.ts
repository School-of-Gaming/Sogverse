import { describe, it, expect, beforeAll } from "vitest";
import {
  buildProductConfirmationEmail,
  productConfirmationAttachments,
  productConfirmationSubject,
  productConfirmationText,
  resolveProductConfirmation,
  type ProductConfirmationEmailOptions,
  type ProductConfirmationOverviewInput,
} from "@/lib/email-templates/product-confirmation";
import type { ProductConfirmationInvitationInput } from "@/lib/email-templates/product-confirmation-invitation";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { loadMessages } from "@/i18n/messages";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
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
 * invitation. Everything else runs with `invitation: null`, which is the mail a
 * waitlist join gets and the mail a product with no schedule gets.
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

/** The same product, as the "Good to know" card reads it. */
const OVERVIEW: ProductConfirmationOverviewInput = {
  timezone: "Europe/Helsinki",
  startDate: "2027-01-04",
  endDate: "2027-05-31",
  slots: [{ weekday: 0, start_time: "16:00", duration_minutes: 60 }],
  isRemote: true,
  location: null,
  minAge: 8,
  maxAge: 12,
  forGamers: true,
  forParents: false,
  spokenLanguageCode: "fi",
  now: NOW,
};

const base: ProductConfirmationEmailOptions = {
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Minecraft 101",
  productType: "consumer_club",
  mode: "subscription",
  priceAmount: "€40.00",
  firstChargeDate: null,
  dashboardUrl: DASHBOARD_URL,
  overview: OVERVIEW,
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

  /**
   * One button, and it is the page's own primary. The page also offers a "keep
   * browsing" beside it, because a reader who has just checked out is still
   * standing in the shop; a reader in their inbox is not, so the mail carries
   * only the action it is asking for — and, being alone, takes the primary
   * brand fill a two-button row forbids.
   */
  it("offers one way onward, filled in the brand primary", () => {
    const html = render(base);
    expect(html).toContain(`href="${DASHBOARD_URL}"`);
    expect(html).toContain("Go to My SOG");
    expect(html).toContain(BRAND.primary);
    expect(html).not.toContain("Keep browsing");
    expect(html).not.toContain("/shop");
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
   * The brand purple is still in the mail — it fills the My SOG button — so the
   * assertion is on the name's own markup rather than on the colour's absence.
   */
  it("emphasises the product name by weight, in the body's own color", () => {
    const html = render(base);
    expect(html).toContain(`<strong style="color:${DARK_THEME.foreground};">Minecraft 101</strong>`);
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
   * The order summary is the page's summary card, minus its picture. The row
   * that used to carry the photograph carries the type and the name alone —
   * there are no stored dimensions and no enforced aspect to size a box from,
   * and the accept list admits three formats Outlook's desktop engine will not
   * render — so the mail states the two lines that sat beside it and leaves no
   * hole where a picture would have been.
   */
  describe("the order summary", () => {
    it("states the type, the name, who the seat is for, and the price", () => {
      const html = render(base);
      expect(html).toContain("Your order");
      expect(html).toContain("Enrolled");
      expect(html).toContain("Aino");
      expect(html).toContain("Price");
    });

    it("names the participant even on the parent's own seat", () => {
      const html = render({ participantName: "Marja", isSelfSeat: true });
      // The sentences move to the second person; the summary row does not — a
      // reader's own first name beside "Enrolled" is what they recognise.
      expect(html).toContain("You’re enrolled in");
      expect(html).toContain("Marja");
    });

    it("carries no product picture", () => {
      expect(render(base)).not.toContain("product-images");
    });

    it("takes the waitlist's own title and label", () => {
      const html = render({ mode: "waitlist", priceAmount: null });
      expect(html).toContain("Your waitlist spot");
      expect(html).toContain("Waitlisted");
      expect(html).not.toContain("Your order");
    });
  });

  /**
   * The page's "Good to know" card, composed by the page's own formatters, in
   * the page's order and under the page's labels.
   */
  describe("the Good to know facts", () => {
    it("states the schedule, where, who it is for, and the language", () => {
      const html = render(base);

      expect(html).toContain("Good to know");
      expect(html).toContain("Schedule");
      expect(html).toContain("Mon");
      expect(html).toContain("16:00–17:00");
      // A club's term range is folded in as an extra schedule line, exactly as
      // the page folds it — the weekly line never says when the term runs.
      expect(html).toContain("May 31, 2027");
      expect(html).toContain("Format");
      expect(html).toContain("Online");
      expect(html).toContain("Age range");
      expect(html).toContain("Ages 8–12");
      expect(html).toContain("Language");
      expect(html).toContain("Finnish");
    });

    /**
     * The mail renders in the *product's* zone, because there is no viewer zone
     * to render in — parents store none. So the reader cannot infer which zone
     * the times are in, and the abbrev that names it is always appended. The
     * page appends the same abbrev through the same formatter, but only when
     * the viewer's zone differs from the product's; one option, one line.
     */
    it("appends the product zone's abbrev to the time-bearing line", () => {
      expect(render(base)).toContain("16:00–17:00 (GMT+2)");
    });

    it("appends no abbrev where the schedule states no time", () => {
      const html = render({
        overview: { ...OVERVIEW, slots: [], startDate: null, endDate: null },
      });
      expect(html).not.toContain("(GMT+");
    });

    it("names a site and its parent under Where", () => {
      const html = render({
        overview: {
          ...OVERVIEW,
          isRemote: false,
          location: { kind: "site", site: "Kallion kirjasto", parent: "Helsinki" },
        },
      });
      expect(html).toContain("Where");
      expect(html).toContain("Kallion kirjasto, Helsinki");
      expect(html).not.toContain("Format");
    });

    it("leads with the audience word where the product is sold to parents", () => {
      const html = render({
        overview: { ...OVERVIEW, forGamers: false, forParents: true, minAge: null, maxAge: null },
      });
      expect(html).toContain("Audience");
      expect(html).toContain("For parents");
      expect(html).not.toContain("Age range");
    });

    it("composes the family audience and its ages as one sentence", () => {
      const html = render({ overview: { ...OVERVIEW, forParents: true } });
      expect(html).toContain("For families, ages 8–12");
    });

    /** A send that could not read the product's facts states none of them. */
    it("is absent entirely when the send had no facts", () => {
      const html = render({ overview: null });
      expect(html).not.toContain("Good to know");
      expect(html).toContain("What happens next");
    });
  });

  /**
   * The five modes are the whole shape of this mail: four price shapes and one
   * outcome with no price at all. Each case asserts what its own variant says
   * *and* what it must not — a waitlist mail that still carried a monthly price
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
      const html = render({ mode: "upfront" });
      expect(html).toContain("€40.00 (one-time)");
      expect(html).toContain("nothing more to pay");
      expect(html).not.toContain("billed every month");
    });

    /**
     * A free signup says "Free" on the price row and adds no bullet, which is
     * exactly the page's shape — the row has already said what there is to say,
     * and a second sentence about a cost of nothing is a sentence about
     * nothing.
     */
    it("says free rather than showing a blank price, and adds no bullet", () => {
      const html = render({ mode: "free", priceAmount: null });
      expect(html).toContain("Free");
      expect(html).not.toContain("nothing to pay for this one");
    });

    /**
     * A municipality registration costs the family nothing at our till, which
     * is not the same statement as "Free": some municipalities charge a small
     * fee of their own, and the family has already been told so by their
     * council. The mail says who bears the cost on the price line and adds
     * nothing to the "what happens next" list, so the negative assertions are
     * the load-bearing half of this case.
     */
    it("says who bears the cost of a municipality registration, never 'Free'", () => {
      const html = render({ mode: "external", priceAmount: null });
      expect(html).toContain("Paid for by your municipality");
      expect(html).not.toContain("Free");
      expect(html).not.toContain("invoice");
      expect(html).toContain("in a group with a Gedu");
    });

    it("prints no price row at all on a waitlist join", () => {
      const html = render({ mode: "waitlist", priceAmount: null });
      expect(html).toContain("on the waitlist");
      expect(html).not.toContain("€40.00");
      expect(html).not.toContain("billed every month");
    });

    /** No frozen queue number — it goes stale and the reader can't tell. */
    it("points at My SOG for the live waitlist position instead of stating one", () => {
      const html = render({ mode: "waitlist", priceAmount: null });
      expect(html).toContain("keep track of your waitlist spot");
      expect(html).not.toContain("position");
    });

    /** The page's three waitlist bullets, the middle one keyed by type. */
    it("keeps a waitlisted place in the words the type calls for", () => {
      const club = render({ mode: "waitlist", priceAmount: null });
      // The name arrives styled, so the assertion is on the sentence around it.
      expect(club).toContain("Aino</span> keeps their place in line for the whole term.");
      expect(
        render({ mode: "waitlist", priceAmount: null, productType: "camp" }),
      ).toContain("keeps their place in line for the camp.");
    });

    /**
     * A paid mode with no amount in hand: the price row disappears rather than
     * rendering an empty one, because a blank beside a product name reads as
     * "free".
     */
    it("omits the price row when a paid mode has no amount", () => {
      const html = render({ priceAmount: null });
      expect(html).not.toContain("€");
      expect(html).toContain("billed every month");
    });
  });

  /**
   * A club bought before it starts completes Checkout at €0, and the parent is
   * owed the real date in the same breath — the page states it and so does the
   * mail, from the same rule, above the general billing line.
   */
  describe("the deferred first charge", () => {
    it("states the date it was given, before the billing line", () => {
      const html = render({ firstChargeDate: "13 Jan 2027" });
      expect(html).toContain("Nothing was charged today.");
      expect(html).toContain("13 Jan 2027");
      expect(html.indexOf("13 Jan 2027")).toBeLessThan(
        html.indexOf("billed every month"),
      );
    });

    it("says nothing where none was given", () => {
      expect(render(base)).not.toContain("Nothing was charged today.");
    });

    /** Only a subscription defers a charge; nothing else may state one. */
    it("says nothing on a one-time purchase, whatever it was handed", () => {
      const html = render({ mode: "upfront", firstChargeDate: "13 Jan 2027" });
      expect(html).not.toContain("Nothing was charged today.");
    });
  });

  /**
   * The self seat: the recipient and the participant are one person, so the
   * copy moves to the second person by swapping whole keys — reading your own
   * name back at you in the third person is the shape of a mail sent about
   * somebody else.
   */
  describe("the parent's own seat", () => {
    it("swaps the whole sentence rather than naming the reader", () => {
      const html = render({ participantName: "Marja", isSelfSeat: true });
      expect(html).toContain("You’re enrolled in");
      expect(html).not.toContain("is enrolled in");
    });

    it("moves the placement line into the second person too", () => {
      const html = render({ participantName: "Marja", isSelfSeat: true });
      expect(html).toContain("We’ll place you in a group");
      expect(html).not.toContain("We’ll place Marja");
    });

    it("takes the second person on the waitlist as well", () => {
      const html = render({
        participantName: "Marja",
        isSelfSeat: true,
        mode: "waitlist",
        priceAmount: null,
      });
      expect(html).toContain("You’re on the waitlist for");
      expect(html).toContain("You keep your place in line for the whole term.");
    });
  });

  /**
   * The child's own copy: the reader is the participant, so it takes the self
   * seat's second person — and it drops everything only a parent can act on.
   * The negative assertions are the load-bearing half: a child told they will
   * be billed monthly has been sent their parent's mail under another name.
   */
  describe("the child's own copy", () => {
    const GAMER_DASHBOARD_URL = "https://sogverse.sog.gg/gamer";
    /** What the sender hands the child's render: their root, and no price. */
    const child: Partial<ProductConfirmationEmailOptions> = {
      gamerCopy: true,
      priceAmount: null,
      dashboardUrl: GAMER_DASHBOARD_URL,
    };

    it("greets the child by name and speaks in the second person", () => {
      const html = render(child);
      expect(html).toContain("Aino");
      expect(html).toContain("Hi ");
      expect(html).toContain("You’re enrolled in");
      expect(html).not.toContain("is enrolled in");
      expect(html).toContain("We’ll place you in a group");
    });

    it("states no price and no billing line on any mode", () => {
      for (const mode of ["subscription", "upfront", "free", "external"] as const) {
        const html = render({ ...child, mode });
        expect(html).not.toContain("Price");
        expect(html).not.toContain("billed every month");
        expect(html).not.toContain("nothing more to pay");
        expect(html).not.toContain("Nothing was charged today");
      }
    });

    it("ignores a price and a first-charge date it is handed", () => {
      const html = render({
        ...child,
        priceAmount: "€40.00",
        firstChargeDate: "13 Jan 2027",
      });
      expect(html).not.toContain("€40.00");
      expect(html).not.toContain("13 Jan 2027");
    });

    /**
     * The card records a signup rather than a purchase, because there is no
     * purchase in this copy — no price row, and nothing the reader paid.
     */
    it("titles the summary after the signup rather than after an order", () => {
      const html = render(child);
      expect(html).toContain("Your signup");
      expect(html).not.toContain("Your order");
      // Still the same card otherwise: who the seat is for, under the page's
      // own label.
      expect(html).toContain("Enrolled");
    });

    it("keeps the Good to know facts, which are nobody's to withhold", () => {
      const html = render(child);
      expect(html).toContain("Good to know");
      expect(html).toContain("Ages 8–12");
      expect(html).toContain("Finnish");
    });

    it("links the child's own My SOG root", () => {
      const html = render(child);
      expect(html).toContain(`href="${GAMER_DASHBOARD_URL}"`);
      expect(html).not.toContain("/parent");
    });

    it("takes the second person on the waitlist and keeps the live-position pointer", () => {
      const html = render({ ...child, mode: "waitlist" });
      expect(html).toContain("You’re on the waitlist for");
      expect(html).toContain("You keep your place in line for the whole term.");
      expect(html).not.toContain("is on the waitlist for");
    });

    it("subjects the copy in the second person, whatever the seat flag says", () => {
      expect(productConfirmationSubject(t, resolve(child))).toBe(
        "You are enrolled in Minecraft 101",
      );
      expect(
        productConfirmationSubject(t, resolve({ ...child, mode: "waitlist" })),
      ).toBe("You are on the waitlist for Minecraft 101");
    });

    /**
     * **The calendar file is in both copies, and it is one calendar object.** A
     * child with a mailbox has a calendar, and the sessions in it are theirs;
     * the identifier is the seat's, so the two documents are one event seen by
     * two people rather than two events nobody can reconcile. What differs is
     * the attendee, because a client offers the RSVP only to the mailbox it
     * matches.
     */
    describe("its calendar invitation", () => {
      const CHILD_SCHEDULE: ProductConfirmationInvitationInput = {
        ...SCHEDULE,
        attendeeName: "Aino Virtanen",
        attendeeEmail: "aino@example.test",
      };

      it("carries the same invite.ics under the same identifier as the parent's", () => {
        const [parent] = productConfirmationAttachments(resolve({ invitation: SCHEDULE }));
        const [mine] = productConfirmationAttachments(
          resolve({ ...child, invitation: CHILD_SCHEDULE }),
        );

        expect(mine.name).toBe("invite.ics");
        expect(parent.name).toBe("invite.ics");
        expect(mine.text).toContain(`UID:${PARTICIPATION_ID}@sogverse`);
        expect(parent.text).toContain(`UID:${PARTICIPATION_ID}@sogverse`);
      });

      it("names the child as the attendee, and only the child", () => {
        const [mine] = productConfirmationAttachments(
          resolve({ ...child, invitation: CHILD_SCHEDULE }),
        );

        expect(mine.text).toContain("aino@example.test");
        expect(mine.text).toContain("Aino Virtanen");
        expect(mine.text).not.toContain("marja@example.com");
      });

      /**
       * The same rule the mail's sentences follow: name the participant only
       * when the reader is not the participant. In the child's own calendar
       * that is their own name, which is the shape of an entry about somebody
       * else.
       */
      it("titles the entry by the product alone", () => {
        const [mine] = productConfirmationAttachments(
          resolve({ ...child, invitation: CHILD_SCHEDULE }),
        );
        const [parent] = productConfirmationAttachments(resolve({ invitation: SCHEDULE }));

        expect(mine.text).toContain("SUMMARY:Minecraft 101\r\n");
        expect(parent.text).toContain("SUMMARY:Minecraft 101 – Aino");
      });

      it("states the text twin the entry's notes are filled from", () => {
        const text = productConfirmationText(
          t,
          resolve({ ...child, invitation: CHILD_SCHEDULE }),
        )!;

        expect(text).toContain("Hi Aino!");
        expect(text).toContain("You’re enrolled in Minecraft 101.");
        expect(text).toContain("Your signup");
        expect(text).toContain(GAMER_DASHBOARD_URL);
        expect(text).not.toContain("Price");
        expect(text).not.toContain("billed every month");
      });
    });
  });
});

/**
 * The two artifacts a signup mail can carry — the file and its plain-text twin
 * — and the one thing that decides both: whether a calendar object could be
 * composed at all.
 *
 * **The mail says nothing about the file, deliberately.** A client that can act
 * on an `invite.ics` shows the invitation itself, with its own buttons, and a
 * sentence announcing it underneath is the mail narrating its own attachment
 * list. So the pins here are on the artifacts, not on any copy.
 */
describe("the calendar invitation", () => {
  it("announces the attachment nowhere in the body", () => {
    const html = render({ invitation: SCHEDULE });

    expect(html).not.toContain("calendar invitation");
    expect(html).not.toContain("invite.ics");
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
    expect(productConfirmationText(t, content)).toBeUndefined();
  });

  it("attaches the document as invite.ics, carrying the seat's own identifier", () => {
    const [attachment] = productConfirmationAttachments(resolve({ invitation: SCHEDULE }));

    expect(attachment.name).toBe("invite.ics");
    expect(attachment.text).toContain(`UID:${PARTICIPATION_ID}@sogverse`);
    expect(attachment.text).toContain("BEGIN:VCALENDAR");
    // What is sent is the base64; the decoded copy exists for the preview.
    expect(atob(attachment.contentBase64)).toContain("BEGIN:VCALENDAR");
  });
});

/**
 * The text body is not a courtesy fallback — on a Microsoft mailbox it is where
 * the calendar entry's own notes come from — so it exists exactly when a
 * calendar part travels with the mail, and it states the mail's own words in
 * the mail's own order.
 */
describe("the plain-text twin", () => {
  it("is stated only when the mail carries the calendar part", () => {
    expect(productConfirmationText(t, resolve())).toBeUndefined();
    expect(productConfirmationText(t, resolve({ invitation: SCHEDULE }))).toBeDefined();
  });

  it("walks the same sections in the same order, as plain lines", () => {
    const text = productConfirmationText(t, resolve({ invitation: SCHEDULE }))!;

    const order = [
      "You’re all set!",
      "Aino is enrolled in Minecraft 101.",
      "Your order",
      "Club: Minecraft 101",
      "Enrolled: Aino",
      "Price: €40.00 / month",
      "Good to know",
      "Schedule: ",
      "Language: Finnish",
      "What happens next",
      "- We’ll place Aino in a group",
      DASHBOARD_URL,
    ];
    let cursor = -1;
    for (const fragment of order) {
      const at = text.indexOf(fragment);
      expect(at, fragment).toBeGreaterThan(cursor);
      cursor = at;
    }
    // The mail's words, not its markup: an entry's notes are read as text.
    expect(text).not.toContain("<");
    expect(text).not.toContain("&#");
  });

  it("carries the deferred first-charge date unescaped", () => {
    const text = productConfirmationText(
      t,
      resolve({ invitation: SCHEDULE, firstChargeDate: "13 Jan 2027" }),
    )!;
    expect(text).toContain("- Nothing was charged today. Your first payment is on 13 Jan 2027.");
  });
});

/**
 * **The mail is a second copy of the purchase confirmation page, so every
 * sentence they share has to be one sentence.**
 *
 * They cannot share a message key: the email translator is scoped to the
 * `email` namespace and the page reads `purchaseConfirmation`, `productDetail`
 * and `productAudience`. So the strings are genuine duplicates, and this table
 * is what stops them becoming two answers — an edit to either side fails here
 * rather than in an inbox, in every locale at once.
 *
 * **The placeholder names differ on purpose and are normalised before the
 * comparison.** The page's props are `gamer` and `product`; the mail's params
 * are `participantName` and `productName`, which is the vocabulary the whole
 * email directory uses. Renaming either side to match the other would be a
 * churn across five files to make a test simpler, so the test does the mapping
 * and states it here.
 *
 * A key that is deliberately the mail's alone — the subject lines, the
 * municipality price line the page states nothing for, everything under
 * `invite` — is simply absent from the table.
 */
describe("copy parity with the confirmation page", () => {
  const TYPES = ["consumer_club", "municipality_club", "camp", "event"] as const;

  /** `[email key, page key]`, both relative to their own namespace roots. */
  const PAIRS: [emailKey: string, pageKey: string][] = [
    ["heading", "purchaseConfirmation.heading"],
    ...TYPES.map(
      (tp): [string, string] => [
        `subheading.${tp}`,
        `purchaseConfirmation.subheading.${tp}`,
      ],
    ),
    ...TYPES.map(
      (tp): [string, string] => [
        `self.subheading.${tp}`,
        `purchaseConfirmation.self.subheading.${tp}`,
      ],
    ),
    ["waitlist.heading", "purchaseConfirmation.waitlist.heading"],
    ["waitlist.subheading", "purchaseConfirmation.waitlist.subheading"],
    ["self.waitlist.subheading", "purchaseConfirmation.self.waitlist.subheading"],
    ["summaryTitle", "purchaseConfirmation.summaryTitle"],
    ["waitlist.summaryTitle", "purchaseConfirmation.waitlist.summaryTitle"],
    ...TYPES.map(
      (tp): [string, string] => [
        `forLabel.${tp}`,
        `purchaseConfirmation.forLabel.${tp}`,
      ],
    ),
    ["waitlist.forLabel", "purchaseConfirmation.waitlist.forLabel"],
    ["priceLabel", "purchaseConfirmation.priceLabel"],
    ["price.subscription", "purchaseConfirmation.price.subscription"],
    ["price.upfront", "purchaseConfirmation.price.upfront"],
    ["price.free", "purchaseConfirmation.price.free"],
    ["overview.title", "productDetail.sections.overview"],
    ["overview.schedule", "productDetail.info.schedule"],
    ["overview.where", "productDetail.info.where"],
    ["overview.format", "productDetail.info.format"],
    ["overview.online", "productDetail.info.online"],
    ["overview.tbd", "productDetail.info.tbd"],
    ["overview.ageRange", "productDetail.info.ageRange"],
    ["overview.audience", "productDetail.info.audience"],
    ["overview.language", "productDetail.info.language"],
    ["overview.ages", "productDetail.info.ages"],
    ["overview.audienceParents", "productAudience.parents"],
    ["overview.audienceFamilies", "productAudience.families"],
    ["overview.audienceFamiliesWithAges", "productAudience.familiesWithAges"],
    ["nextTitle", "purchaseConfirmation.nextTitle"],
    ["next.placement", "purchaseConfirmation.next.placement"],
    ["next.placementSelf", "purchaseConfirmation.self.nextPlacement"],
    ["next.firstCharge", "purchaseConfirmation.next.firstCharge"],
    ["next.subscription", "purchaseConfirmation.next.subscription"],
    ["next.upfront", "purchaseConfirmation.next.oneTime"],
    ["waitlist.next1", "purchaseConfirmation.waitlist.next1"],
    ...TYPES.map(
      (tp): [string, string] => [
        `waitlist.next2.${tp}`,
        `purchaseConfirmation.waitlist.next2.${tp}`,
      ],
    ),
    ...TYPES.map(
      (tp): [string, string] => [
        `self.waitlist.next2.${tp}`,
        `purchaseConfirmation.self.waitlist.next2.${tp}`,
      ],
    ),
    ["waitlist.next3", "purchaseConfirmation.waitlist.next3"],
    // No `keepBrowsing` pair: the page's second button is a way back into the
    // shop a reader is still standing in, and the mail carries one button.
    ["dashboardButton", "purchaseConfirmation.goToDashboard"],
    // The order summary's own row label. Both surfaces name the product by its
    // type before naming it, so the two spellings of "Club"/"Camp" have to
    // agree as hard as the sentences around them do.
    ...TYPES.map(
      (tp): [string, string] => [`typeLabel.${tp}`, `productDetail.typeLabel.${tp}`],
    ),
  ];

  /** The page's placeholder names, in the email's spelling. */
  const PLACEHOLDERS: Record<string, string> = {
    gamer: "participantName",
    product: "productName",
  };

  /** One dotted path through a messages tree, refused unless it lands on copy. */
  function read(messages: object, dotted: string): string {
    let node: unknown = messages;
    for (const key of dotted.split(".")) {
      if (typeof node !== "object" || node === null) break;
      node = Object.getOwnPropertyDescriptor(node, key)?.value;
    }
    if (typeof node !== "string") throw new Error(`${dotted} is not a string`);
    return node;
  }

  function normalise(pageCopy: string): string {
    return Object.entries(PLACEHOLDERS).reduce(
      (acc, [from, to]) => acc.split(`{${from}}`).join(`{${to}}`),
      pageCopy,
    );
  }

  it.each(SUPPORTED_LOCALES)("says the same things in %s", async (locale) => {
    const messages = await loadMessages(locale);
    for (const [emailKey, pageKey] of PAIRS) {
      expect(
        read(messages, `email.productConfirmation.${emailKey}`),
        `${locale}: ${emailKey}`,
      ).toBe(normalise(read(messages, pageKey)));
    }
  });
});

/**
 * The zone the mail's times are in, named the way every other mail already
 * names one: the short `Intl` abbrev, appended to the line that carries the
 * clock face.
 *
 * **It is the product's zone, not the viewer's**, and that is the whole reason
 * the abbrev is unconditional here. A page renders in the viewer's own zone and
 * decorates the line only when that differs from the product's; a mail has no
 * viewer zone to render in, so the times are in a zone the reader has no way to
 * infer and the abbrev is the whole statement.
 *
 * The values are **measured, not guessed** — CLDR gives different abbrevs for
 * one zone in different languages, and the point of the pin is that the abbrev
 * is locale-formatted rather than a string we wrote. `tlh` is skipped for the
 * reason its clock face is: `Intl` has no data for it, so it resolves to the
 * runtime default locale and nothing about its output is stable across
 * machines.
 */
describe("the zone the times are given in", () => {
  /** Europe/Helsinki in January (EET, UTC+2), as each locale's `Intl` sets it. */
  const ABBREV = [
    ["en", "GMT+2"],
    ["fi", "UTC+2"],
    ["sv", "EET"],
    ["fr", "UTC+2"],
  ] as const;

  it.each(ABBREV)("appends %s's own abbrev for the product zone", async (locale, abbrev) => {
    const translator = await getEmailTranslator(locale);
    const html = buildProductConfirmationEmail(
      translator,
      locale,
      resolveProductConfirmation(translator, locale, base),
    );

    expect(html).toContain(`(${abbrev})`);
    // The raw IANA identifier is the fallback `viewerTzAbbrev` returns when
    // `Intl` throws; seeing it here would mean no abbrev was resolved at all.
    expect(html).not.toContain("Europe/Helsinki");
  });

  /**
   * The abbrev is read off the run's own first occurrence, so a summer term
   * says EEST where a winter one says EET. That is correct rather than a
   * seasonal-name bug: unlike a long name spanning a whole run, this decorates
   * one line of times that were themselves rendered at that instant.
   */
  it("reads the abbrev at the occurrence the times are rendered for", () => {
    const winter = render({ overview: { ...OVERVIEW, startDate: "2027-01-04" } });
    const summer = render({
      overview: {
        ...OVERVIEW,
        startDate: "2027-07-05",
        endDate: "2027-08-31",
        now: new Date("2027-06-01T08:00:00Z"),
      },
    });

    expect(winter).toContain("(GMT+2)");
    expect(summer).toContain("(GMT+3)");
  });
});

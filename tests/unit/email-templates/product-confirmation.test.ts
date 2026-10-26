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
import {
  invitationPlanWindow,
  type ProductConfirmationInvitationInput,
} from "@/lib/email-templates/product-confirmation-invitation";
import { planSessions } from "../../mocks/planned-sessions";
import {
  getEmailTranslator,
  getTopicPrepTranslator,
  type EmailTranslator,
  type TopicPrepTranslator,
} from "@/lib/email-templates/translator";
import { BRAND, DARK_THEME } from "@/lib/constants/colors";
import { SUPPORT_EMAIL } from "@/lib/constants/brand";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { defuseAutolinks, styledName } from "@/lib/email-templates/utils";

let t: EmailTranslator;
/** The guide's own translator — the second namespace this mail reads. */
let tPrep: TopicPrepTranslator;

beforeAll(async () => {
  [t, tPrep] = await Promise.all([
    getEmailTranslator("en"),
    getTopicPrepTranslator("en"),
  ]);
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
  endDate: null,
  slots: [{ weekday: 0, startTime: "16:00", durationMinutes: 60 }],
  // What the database plans for it over the composer's window: every Monday.
  plannedSessions: planSessions({
    slots: [{ weekday: 0, startTime: "16:00", durationMinutes: 60 }],
    startDate: "2027-01-04",
    endDate: null,
    timezone: "Europe/Helsinki",
    ...invitationPlanWindow({ now: NOW, timezone: "Europe/Helsinki", endDate: null }),
  }),
  deliveryMode: "online",
  siteName: null,
  siteAddress: null,
  siteNote: null,
  attendeeName: "Marja Virtanen",
  attendeeEmail: "marja@example.com",
  dashboardUrl: DASHBOARD_URL,
  now: NOW,
};

/** The same product, as the page's overview card reads it. */
const OVERVIEW: ProductConfirmationOverviewInput = {
  timezone: "Europe/Helsinki",
  startDate: "2027-01-04",
  endDate: "2027-05-31",
  slots: [{ weekday: 0, start_time: "16:00", duration_minutes: 60 }],
  deliveryMode: "online",
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
  // A topic that carries a guide, on a remote product — the mail a family
  // actually receives for this fixture, rather than one with the section
  // silently missing.
  topic: "minecraft_java",
  deliveryMode: "online",
  mode: "subscription",
  priceAmount: "€40.00",
  firstChargeDate: null,
  dashboardUrl: DASHBOARD_URL,
  overview: OVERVIEW,
  holidayBreaks: [],
  invitation: null,
};

/** One render's content, resolved exactly as the registry and the sender do. */
function resolve(overrides: Partial<ProductConfirmationEmailOptions> = {}) {
  return resolveProductConfirmation(t, tPrep, "en", { ...base, ...overrides });
}

function render(overrides: Partial<ProductConfirmationEmailOptions> = {}): string {
  return buildProductConfirmationEmail(t, "en", resolve(overrides));
}

/**
 * The mail's one facts list, cut out of the rendered document: everything
 * between the label that opens it and the label that opens what happens next.
 * The shell around it draws borders and corners of its own, so an assertion
 * about how the *list* is drawn has to be made on the list.
 */
function factsList(html: string): string {
  const upTo = html.slice(0, html.indexOf("What happens next"));
  return upTo.slice(upTo.lastIndexOf("<table"));
}

/** The closing line as the body prints it: the support address defused. */
const CLOSING = `Questions? Just reply to this email, or write to ${defuseAutolinks(SUPPORT_EMAIL)}.`;

describe("buildProductConfirmationEmail", () => {
  it("names the participant and the product in the sentence under the heading", () => {
    const html = render(base);
    expect(html).toContain(`${styledName("Aino")} is enrolled in`);
    expect(html).toContain("Minecraft 101");
    expect(html).toContain("<!DOCTYPE html>");
  });

  /**
   * One heading for every enrolled mail. "All set" overclaimed on a mail whose
   * guide then lists the setup still to do; the waitlist keeps its own.
   */
  it("opens an enrolled mail with “You’re in!” and a waitlist join with its own heading", () => {
    for (const overrides of [{}, { gamerCopy: true }, { deliveryMode: "in_person" as const }, { mode: "free" as const }]) {
      const html = render(overrides);
      expect(html).toContain("You’re in!");
      expect(html).not.toContain("all set");
    }
    expect(render({ mode: "waitlist", priceAmount: null })).not.toContain("You’re in!");
  });

  /**
   * The inbox preview. Left alone, a client previews the first words of the
   * document, which in every mail is the header lockup; this one hands it the
   * first "what happens next" line instead, hidden, as the very first thing in
   * the body — the subject beside it has already said who joined what.
   */
  describe("the inbox preview", () => {
    function preheader(html: string): string {
      const body = html.slice(html.indexOf("<body"));
      const opened = body.slice(body.indexOf(">") + 1);
      expect(opened.startsWith("<div style=\"display:none;"), opened.slice(0, 80)).toBe(true);
      return opened.slice(0, opened.indexOf("</div>"));
    }

    /** The text inside the block, before its padding. */
    function previewText(html: string): string {
      const block = preheader(html);
      const text = block.slice(block.indexOf(">") + 1);
      return text.slice(0, text.indexOf("&#847;")).trim();
    }

    it("is the first-session line as plain text, hidden, before anything else in the body", () => {
      const html = render({ invitation: SCHEDULE });
      const block = preheader(html);
      expect(previewText(html)).toBe(
        "Aino’s first session is on Monday, 4 January 2027 at 16:00 (EET).",
      );
      expect(block).not.toContain("<strong");
      for (const hidden of ["max-height:0", "overflow:hidden", "opacity:0", "mso-hide:all"]) {
        expect(block).toContain(hidden);
      }
      // Padded, so a client does not pull the lockup in after the sentence.
      expect(block).toContain("&#847;&zwnj;&nbsp;");
    });

    it("is the text twin's first item, word for word", () => {
      const content = resolve({ invitation: SCHEDULE });
      const html = buildProductConfirmationEmail(t, "en", content);
      const text = productConfirmationText(t, content)!;
      const firstItem = text.split("\n").find((line) => line.startsWith("- "))!;
      expect(firstItem).toBe(`- ${previewText(html)}`);
    });

    it("says when the event is, on an event", () => {
      expect(
        previewText(
          render({
            productType: "event",
            mode: "upfront",
            invitation: { ...SCHEDULE, productType: "event" },
          }),
        ),
      ).toBe("The event is on Monday, 4 January 2027 at 16:00 (EET).");
    });

    it("falls back to the sessions line where no first session is named", () => {
      expect(previewText(render(base))).toBe(
        `Aino joins the sessions online in My SOG. The voice room opens ${VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES} minutes before each session starts.`,
      );
    });

    it("is the first waitlist line on a waitlist join", () => {
      expect(previewText(render({ mode: "waitlist", priceAmount: null }))).toBe(
        "We’ll email you the moment a seat opens.",
      );
    });

    it("follows the reader", () => {
      expect(
        previewText(render({ invitation: SCHEDULE, participantName: "Marja", isSelfSeat: true })),
      ).toBe("Your first session is on Monday, 4 January 2027 at 16:00 (EET).");
    });

    it("escapes the values in it", () => {
      const block = preheader(render({ participantName: "<b>Aino</b>" }));
      expect(block).toContain("&lt;b&gt;Aino&lt;/b&gt;");
      expect(block).not.toContain("<b>");
    });
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
    expect(html).toContain(BRAND.act);
    expect(html).not.toContain("Keep browsing");
    expect(html).not.toContain("/shop");
  });

  /**
   * The one line the page has no use for. It is an instruction rather than a
   * pleasantry: this send's Reply-To is the support inbox, so a reply reaches a
   * person. It names the support address too, because a forwarded copy's reply
   * goes to whoever forwarded it — displayed and defused, like every address a
   * mail here prints, so no client invents a link of its own. It is the last
   * thing in the mail, under the button and the guide.
   */
  it("closes by inviting a reply and naming the support address, last", () => {
    const html = render(base);
    expect(html).toContain(CLOSING);
    expect(html).not.toContain("mailto:");
    expect(html.indexOf("Go to My SOG")).toBeLessThan(html.indexOf(CLOSING));
    expect(html.indexOf("Before the first session")).toBeLessThan(html.indexOf(CLOSING));
  });

  it("uses the verb the product type calls for", () => {
    const club = render(base);
    const event = render({ ...base, productType: "event" });
    expect(club).toContain("is enrolled in");
    expect(event).toContain("is joining");
  });

  /**
   * The product name is emphasised by weight, not by the brand's world colour it
   * used to carry: Gmail's dark-theme rewriting left that purple unreadable against
   * the card, and weight is the emphasis every client renders the same way.
   * The brand purple is still in the mail — it fills the My SOG button — so the
   * assertion is on the name's own markup rather than on the colour's absence.
   */
  it("emphasises the product name by weight, in the body's own color", () => {
    const html = render(base);
    expect(html).toContain(`<strong style="color:${DARK_THEME.foreground};">Minecraft 101</strong>`);
    expect(html).not.toContain("brand-world");
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
   * The mail's one facts list. It opens on the schedule, under no label: the
   * subject and the sentence directly above have already said who is signed up
   * for what, and that sentence is what introduces the list.
   */
  describe("the facts list", () => {
    /**
     * One list, and the order is the order a parent needs: when and where it
     * runs, who it is for, and last what it costs.
     */
    it("runs from the schedule to the price, in one list", () => {
      const html = render(base);
      const list = factsList(html);
      const order = ["Schedule", "Language", "Price"];
      let cursor = -1;
      for (const fragment of order) {
        const at = list.indexOf(fragment);
        expect(at, fragment).toBeGreaterThan(cursor);
        cursor = at;
      }
      // One table between the sentence over the list and what happens next.
      const between = html.slice(
        html.lastIndexOf("is enrolled in"),
        html.indexOf("What happens next"),
      );
      expect(between.match(/<table/g)).toHaveLength(1);
    });

    /**
     * No row names the product or the participant, and no label sits over the
     * list — on any outcome and for either reader.
     */
    it("states no identity rows and no label, on any mode or copy", () => {
      const renders = [
        render(base),
        render({ participantName: "Marja", isSelfSeat: true }),
        render({ mode: "waitlist", priceAmount: null }),
        render({ gamerCopy: true, priceAmount: null }),
        render({ productType: "event" }),
      ];
      for (const html of renders) {
        const between = html.slice(
          html.lastIndexOf("Minecraft 101"),
          html.indexOf("What happens next"),
        );
        for (const gone of [
          "Aino",
          "Marja",
          "Club",
          "Event",
          "Enrolled",
          "Joined",
          "Waitlisted",
          "Your order",
          "Your signup",
          "Your waitlist spot",
        ]) {
          expect(between, gone).not.toContain(gone);
        }
        expect(between).toContain("Schedule");
      }
    });

    /**
     * No box. The list is ruled — a top rule and a hairline under every row,
     * the last one included — and nothing draws an edge around it: a card
     * inside the shell's card spent a border, a radius and 16px a side out of a
     * column a phone has not got.
     */
    it("rules the rows rather than boxing them", () => {
      const list = factsList(render(base));
      expect(list).toContain("border-top:1px solid");
      expect(list).toContain("border-bottom:1px solid");
      expect(list).not.toContain("border:1px solid");
      expect(list).not.toContain("border-radius");
    });

    it("carries no product picture", () => {
      expect(render(base)).not.toContain("product-images");
    });

  });

  /**
   * The product's own facts, composed by the page's own formatters, under the
   * page's labels — rows of the one list rather than a card of their own, and
   * with no heading over them.
   */
  describe("the product's own facts", () => {
    it("states the schedule, where, who it is for, and the language", () => {
      const html = render(base);

      expect(html).not.toContain("Good to know");
      expect(html).toContain("Schedule");
      expect(html).toContain("Mon");
      expect(html).toContain("16:00–17:00");
      // A club's term range is folded in as an extra schedule line, exactly as
      // the page folds it — the weekly line never says when the term runs.
      expect(html).toContain("31 May 2027");
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
      expect(render(base)).toContain("16:00–17:00 (EET)");
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
          deliveryMode: "in_person",
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

    /**
     * A send that could not read the product's facts states none of them — the
     * list is simply shorter, with nothing left behind to look empty.
     */
    it("leaves a shorter list when the send had no facts", () => {
      const html = render({ overview: null });
      expect(html).not.toContain("Schedule");
      expect(html).not.toContain("Language");
      expect(html).toContain("Price");
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
      expect(html).toContain("joins the sessions online in My SOG");
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
      expect(club).toContain(`${styledName("Aino")} keeps their place in line for the whole term.`);
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
   * The first "what happens next" bullet. A remote seat is told how it joins —
   * online in My SOG, through a voice room that opens a set number of minutes
   * before each session, read off the constant the room itself uses — and an
   * in-person seat where its sessions are listed.
   */
  describe("the sessions bullet", () => {
    const minutes = VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES;

    it("says how a remote seat joins, and when the voice room opens", () => {
      expect(render(base)).toContain(
        `${styledName("Aino")} joins the sessions online in My SOG. The voice room opens ${minutes} minutes before each session starts.`,
      );
    });

    it("takes the second person for the reader who is the participant", () => {
      const self = `You join the sessions online in My SOG. The voice room opens ${minutes} minutes before each session starts.`;
      expect(render({ participantName: "Marja", isSelfSeat: true })).toContain(self);
      expect(render({ gamerCopy: true, priceAmount: null })).toContain(self);
    });

    it("tells a hybrid seat both where it attends and how the room is joined", () => {
      const html = render({ deliveryMode: "hybrid" });
      expect(html).toContain(
        `${styledName("Aino")} attends the sessions in person at the site. The sessions are also joined online through the voice room in My SOG, which opens ${minutes} minutes before each session starts.`,
      );
      expect(render({ deliveryMode: "hybrid", isSelfSeat: true })).toContain(
        `You attend the sessions in person at the site. The sessions are also joined online through the voice room in My SOG, which opens ${minutes} minutes before each session starts.`,
      );
    });

    it("keeps the in-person bullet where the product is not remote", () => {
      const html = render({ deliveryMode: "in_person" });
      expect(html).toContain(`You’ll find ${styledName("Aino")}’s sessions under My SOG.`);
      expect(html).not.toContain("voice room");
      expect(render({ deliveryMode: "in_person", isSelfSeat: true })).toContain(
        "You’ll find your sessions under My SOG.",
      );
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
   * The first session, stated outright rather than left to be worked out from
   * the schedule row — and it is this seat's first session, which is the
   * product's start only for a seat taken before the run begins.
   */
  describe("the first-session bullet", () => {
    /** The weekly Monday 16:00 club, planned from `startDate`, composed at `now`. */
    function scheduleAt(startDate: string, now: Date): ProductConfirmationInvitationInput {
      return {
        ...SCHEDULE,
        now,
        plannedSessions: planSessions({
          slots: SCHEDULE.slots,
          startDate,
          endDate: null,
          timezone: "Europe/Helsinki",
          ...invitationPlanWindow({ now, timezone: "Europe/Helsinki", endDate: null }),
        }),
      };
    }

    const FUTURE_START = scheduleAt("2027-01-11", NOW);

    it("names the start, first in the list, for a seat taken before the run begins", () => {
      const html = render({ invitation: FUTURE_START });
      const bullet = `${styledName("Aino")}’s first session is on Monday, 11 January 2027 at 16:00 (EET).`;
      expect(html).toContain(bullet);
      const next = html.indexOf("What happens next");
      expect(html.indexOf(bullet)).toBeGreaterThan(next);
      expect(html.indexOf(bullet)).toBeLessThan(html.indexOf("joins the sessions online"));
    });

    it("names the next session for a seat taken mid-term", () => {
      // A Wednesday two weeks into a club that began on 4 January.
      const midTerm = scheduleAt("2027-01-04", new Date("2027-01-13T10:00:00Z"));
      expect(render({ invitation: midTerm })).toContain(
        "first session is on Monday, 18 January 2027 at 16:00 (EET).",
      );
    });

    it("skips a session that has already begun today", () => {
      // Monday 11 January, 17:00 in Helsinki: that day's 16:00 is under way.
      const begun = scheduleAt("2027-01-04", new Date("2027-01-11T15:00:00Z"));
      expect(render({ invitation: begun })).toContain(
        "first session is on Monday, 18 January 2027 at 16:00 (EET).",
      );
    });

    it("names the day the calendar entry opens on", () => {
      const content = resolve({ invitation: scheduleAt("2027-01-04", new Date("2027-01-13T10:00:00Z")) });
      expect(content.invitation?.ics).toContain("DTSTART;TZID=Europe/Helsinki:20270118T160000");
      expect(content.firstSession?.date).toBe("Monday, 18 January 2027");
    });

    it("takes the second person for the reader who is the participant", () => {
      const self = "Your first session is on Monday, 11 January 2027 at 16:00 (EET).";
      expect(render({ invitation: FUTURE_START, isSelfSeat: true })).toContain(self);
      expect(render({ invitation: FUTURE_START, gamerCopy: true, priceAmount: null })).toContain(
        self,
      );
    });

    it("is absent on a waitlist join", () => {
      expect(render({ invitation: FUTURE_START, mode: "waitlist" })).not.toContain(
        "first session is on",
      );
    });

    it("is absent where the mail has no plan to read", () => {
      expect(render({ invitation: null })).not.toContain("first session is on");
      expect(render({ invitation: { ...FUTURE_START, plannedSessions: [] } })).not.toContain(
        "first session is on",
      );
      expect(render({ invitation: { ...FUTURE_START, slots: [] } })).not.toContain(
        "first session is on",
      );
    });

    it("states the same bullet, unescaped, in the text twin", () => {
      const text = productConfirmationText(t, resolve({ invitation: FUTURE_START }))!;
      const bullet = "- Aino’s first session is on Monday, 11 January 2027 at 16:00 (EET).";
      expect(text).toContain(bullet);
      expect(text.indexOf(bullet)).toBeLessThan(text.indexOf("- Aino joins the sessions"));
    });

    /** The Finnish render of `overrides` over the future-start club. */
    async function renderFi(overrides: Partial<ProductConfirmationEmailOptions> = {}) {
      const [tFi, tPrepFi] = await Promise.all([
        getEmailTranslator("fi"),
        getTopicPrepTranslator("fi"),
      ]);
      return buildProductConfirmationEmail(
        tFi,
        "fi",
        resolveProductConfirmation(tFi, tPrepFi, "fi", {
          ...base,
          invitation: FUTURE_START,
          ...overrides,
        }),
      );
    }

    it("writes the date the way the reader's locale does, and the time as the schedule row does", async () => {
      const html = await renderFi();
      expect(html).toContain(
        `${styledName("Aino")} aloittaa maanantaina 11. tammikuuta 2027 klo 16:00 (UTC+2).`,
      );
      // One clock style in one mail: the schedule row's, not the locale's "16.00".
      expect(html).toContain("16:00–17:00 (UTC+2)");
      expect(html).not.toContain("16.00");
    });

    /** An event is one occasion, so it is told when the event is. */
    describe("on an event", () => {
      const EVENT = {
        productType: "event",
        mode: "upfront",
        invitation: { ...FUTURE_START, productType: "event" },
      } as const satisfies Partial<ProductConfirmationEmailOptions>;
      const LINE = "The event is on Monday, 11 January 2027 at 16:00 (EET).";

      it("says when the event is, first in the list, in place of the first-session line", () => {
        const html = render(EVENT);
        // Searched from the list's label on, past the inbox preview that
        // states the same line at the top of the body.
        const list = html.slice(html.indexOf("What happens next"));
        expect(list.indexOf(LINE)).toBeGreaterThan(-1);
        expect(list.indexOf(LINE)).toBeLessThan(list.indexOf("joins the sessions online"));
        expect(html).not.toContain("first session is on");
      });

      it("is one form for every reader, since it names nobody", () => {
        expect(render({ ...EVENT, isSelfSeat: true, participantName: "Marja" })).toContain(LINE);
        expect(render({ ...EVENT, gamerCopy: true, priceAmount: null })).toContain(LINE);
      });

      it("states the same line in the text twin", () => {
        const text = productConfirmationText(t, resolve(EVENT))!;
        expect(text).toContain(`- ${LINE}`);
      });

      it("reads in Finnish", async () => {
        expect(await renderFi(EVENT)).toContain(
          "Tapahtuma järjestetään maanantaina 11. tammikuuta 2027 klo 16:00 (UTC+2).",
        );
      });
    });
  });

  /**
   * The terms' 30-day money-back guarantee, which every club carries and only
   * a club is ever bought on a subscription — so it rides on the mode, after
   * the billing line, and never reaches a child, since money is the parent's.
   */
  describe("the money-back guarantee", () => {
    const GUARANTEE = `If the club isn’t right for ${styledName("Aino")}, write to us within 30 days of their first session and we’ll refund everything you’ve paid towards it.`;

    it("follows the billing line on a subscription", () => {
      const html = render(base);
      expect(html).toContain(GUARANTEE);
      expect(html.indexOf(GUARANTEE)).toBeGreaterThan(html.indexOf("billed every month"));
    });

    it("takes the second person on the parent's own seat", () => {
      expect(render({ participantName: "Marja", isSelfSeat: true })).toContain(
        "If the club isn’t right for you, write to us within 30 days of your first session and we’ll refund everything you’ve paid towards it.",
      );
    });

    it("is absent on every other mode and on the child's copy", () => {
      for (const mode of ["upfront", "free", "external", "waitlist"] as const) {
        expect(render({ mode }), mode).not.toContain("within 30 days");
      }
      expect(render({ gamerCopy: true, priceAmount: null })).not.toContain("within 30 days");
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

    it("moves the sessions line into the second person too", () => {
      const html = render({ participantName: "Marja", isSelfSeat: true });
      expect(html).toContain("You join the sessions online in My SOG.");
      expect(html).not.toContain("Marja joins");
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
      expect(html).toContain("You join the sessions online in My SOG.");
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

    it("keeps the product's own facts, which are nobody's to withhold", () => {
      const html = render(child);
      expect(html).toContain("Schedule");
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
        expect(text).not.toContain("Your signup");
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
      "You’re in!",
      "Aino is enrolled in Minecraft 101.",
      "Schedule: ",
      "Language: Finnish",
      "Price: €40.00 / month",
      "What happens next",
      `- Aino joins the sessions online in My SOG. The voice room opens ${VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES} minutes before each session starts.`,
      `Go to My SOG: ${DASHBOARD_URL}`,
      "Before the first session",
      `Questions? Just reply to this email, or write to ${SUPPORT_EMAIL}.`,
    ];
    let cursor = -1;
    for (const fragment of order) {
      const at = text.indexOf(fragment);
      expect(at, fragment).toBeGreaterThan(cursor);
      cursor = at;
    }
    // The list opens on the schedule with no label and no identity rows,
    // exactly as it does in the HTML.
    expect(text).not.toContain("Good to know");
    expect(text).not.toContain("Your order");
    expect(text).not.toContain("Club: ");
    expect(text).not.toContain("Enrolled: ");
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
    ["en", "EET"],
    ["fi", "UTC+2"],
    ["sv", "EET"],
    ["fr", "UTC+2"],
  ] as const;

  it.each(ABBREV)("appends %s's own abbrev for the product zone", async (locale, abbrev) => {
    const translator = await getEmailTranslator(locale);
    const html = buildProductConfirmationEmail(
      translator,
      locale,
      // No guide in this one: the case is about the zone abbrev on the
      // schedule line, and the four catalogs need not agree on anything else
      // for it.
      resolveProductConfirmation(translator, null, locale, base),
    );

    expect(html).toContain(`(${abbrev})`);
    // The raw IANA identifier is the fallback `zoneAbbrev` returns when
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

    expect(winter).toContain("(EET)");
    expect(summer).toContain("(EEST)");
  });
});

/**
 * The "Before the first session" guide, as this mail's section.
 *
 * The words themselves belong to the guide's own tests; what is asserted here
 * is what the *mail* decides about it — that it is stated at all, on which
 * renders, to which readers, and in both of the forms this mail states its
 * content in. The two negatives are the load-bearing half: a waitlist join has
 * no seat and therefore no first session to be ready for, and an in-person
 * product whose topic brings no steps has to leave the mail exactly as it was
 * before the guide existed.
 */
describe("the “Before the first session” guide", () => {
  const HEADING = "Before the first session";
  /** Two of the Java guide's steps: an account step, and an install step. */
  const ACCOUNT_STEP = "Get a Microsoft account with Minecraft on it";
  const INSTALL_STEP = "Install the Minecraft Launcher";
  /**
   * The Roblox guide's account and install steps. The in-person cases read
   * this topic rather than Java, because in person the Minecraft login is
   * ours along with the machine, so Java has nothing to say there at all —
   * Roblox is the guide that keeps an account step for the family to do.
   */
  const ROBLOX_ACCOUNT_STEP = "Create a Roblox account";
  const ROBLOX_INSTALL_STEP = "Install Roblox Studio";
  /** The step every remote guide ends on, whatever its topic. */
  const REMOTE_STEP = "Set up the microphone and camera";

  it("states the guide on an enrolled signup", () => {
    const html = render();
    expect(html).toContain(HEADING);
    expect(html).toContain(ACCOUNT_STEP);
    expect(html).toContain(INSTALL_STEP);
    expect(html).toContain("you’re ready for the session!");
  });

  /**
   * One text, written to read the same to a parent and to a teenage gamer — so
   * the copy that drops the price row and the billing bullets keeps this whole.
   */
  it("states the same guide in the child's own copy", () => {
    const html = render({
      gamerCopy: true,
      priceAmount: null,
      dashboardUrl: "https://sogverse.sog.gg/gamer",
    });
    expect(html).toContain(HEADING);
    expect(html).toContain(ACCOUNT_STEP);
    expect(html).toContain(INSTALL_STEP);
  });

  it("states none on a waitlist join, whatever the topic carries", () => {
    for (const overrides of [{}, { gamerCopy: true }]) {
      const html = render({ ...overrides, mode: "waitlist", priceAmount: null });
      expect(html).not.toContain(HEADING);
      expect(html).not.toContain(ACCOUNT_STEP);
    }
  });

  it("states none for a label-only topic on an in-person product", () => {
    // Nothing to install, nothing to sign into, and no voice room either — so
    // the mail is exactly the mail it was before the guide existed.
    const html = render({ topic: "esports", deliveryMode: "in_person" });
    expect(html).not.toContain(HEADING);
    expect(html).not.toContain(ACCOUNT_STEP);
  });

  it("states the one-step guide for a label-only topic on a remote product", () => {
    // The room is the thing to get ready for, and it belongs to the product
    // rather than to the topic.
    const html = render({ topic: "esports" });
    expect(html).toContain(HEADING);
    expect(html).toContain(REMOTE_STEP);
    expect(html).not.toContain(ACCOUNT_STEP);
  });

  /**
   * In person School of Gaming brings the machines with everything installed,
   * so the guide shortens to its account steps — under the intro written for
   * that form, because the ordinary one promises software to install.
   */
  it("states the accounts-only form for an in-person product", () => {
    const html = render({ topic: "roblox_studio", deliveryMode: "in_person" });
    expect(html).toContain(HEADING);
    expect(html).toContain(ROBLOX_ACCOUNT_STEP);
    expect(html).not.toContain(ROBLOX_INSTALL_STEP);
    expect(html).toContain("We bring the computers to the session");
  });

  it("states no guide for an in-person Minecraft product, whose login is ours", () => {
    expect(render({ deliveryMode: "in_person" })).not.toContain(HEADING);
  });

  /**
   * Where the section sits: after what happens next and the button, before the
   * closing — so the one action the mail asks for is not pushed to the bottom
   * of a phone screen by a few hundred words of guide.
   */
  it("places the guide after the next steps and the My SOG button", () => {
    const html = render();
    expect(html.indexOf("What happens next")).toBeLessThan(
      html.indexOf(`href="${DASHBOARD_URL}"`),
    );
    expect(html.indexOf(`href="${DASHBOARD_URL}"`)).toBeLessThan(html.indexOf(HEADING));
    expect(html.indexOf(HEADING)).toBeLessThan(html.indexOf(CLOSING));
  });

  /**
   * The plain-text twin — which on a Microsoft mailbox is the calendar entry's
   * own notes, so a family reading the session in their calendar weeks later
   * finds the same guide the mail stated.
   */
  describe("the plain-text twin", () => {
    function text(overrides: Partial<ProductConfirmationEmailOptions> = {}): string {
      return productConfirmationText(
        t,
        resolve({ invitation: SCHEDULE, ...overrides }),
      )!;
    }

    it("states the guide, in the mail's own order", () => {
      const body = text();
      expect(body).toContain(HEADING);
      expect(body).toContain(`1. ${ACCOUNT_STEP}`);
      expect(body).toContain(`2. ${INSTALL_STEP}`);
      expect(body).toContain(`4. ${REMOTE_STEP}`);
      expect(body.indexOf("What happens next")).toBeLessThan(body.indexOf(DASHBOARD_URL));
      expect(body.indexOf(DASHBOARD_URL)).toBeLessThan(body.indexOf(HEADING));
      expect(body.indexOf(HEADING)).toBeLessThan(body.indexOf(SUPPORT_EMAIL));
    });

    it("states the same guide in the child's own copy", () => {
      expect(text({ gamerCopy: true, priceAmount: null })).toContain(ACCOUNT_STEP);
    });

    it("shortens with the HTML rather than separately", () => {
      const inPerson = text({ topic: "roblox_studio", deliveryMode: "in_person" });
      expect(inPerson).toContain(ROBLOX_ACCOUNT_STEP);
      expect(inPerson).not.toContain(ROBLOX_INSTALL_STEP);
      expect(inPerson).not.toContain(REMOTE_STEP);
      expect(text({ topic: "esports", deliveryMode: "in_person" })).not.toContain(HEADING);
    });
  });

  /**
   * A caller with only the mail's own translator composes the mail without the
   * guide — the admin harness's path when nothing loaded the second namespace.
   * It is an absent section, never a half-rendered one.
   */
  it("states none when no guide translator was handed over", () => {
    const html = buildProductConfirmationEmail(
      t,
      "en",
      resolveProductConfirmation(t, null, "en", base),
    );
    expect(html).not.toContain(HEADING);
    expect(html).toContain("Minecraft 101");
  });
});

/**
 * The club's holiday breaks: one row of the facts list, as the confirmation
 * page draws them as the last row of its "Good to know" card — chosen and
 * worded by the caller through the shared rule, so the template only lays the
 * lines out.
 */
describe("the holiday breaks row", () => {
  const BREAKS = [
    { name: "Winter break", range: "22–26 Feb" },
    { name: "Easter <3", range: "26–29 Mar" },
  ];

  it("states each break under one label, its name in bold and its dates on the line under it, escaped", () => {
    const html = render({ holidayBreaks: BREAKS });
    expect(html).toContain("Holiday breaks");
    expect(html).toMatch(/<strong[^>]*>Winter break<\/strong><br \/>22–26 Feb/);
    // An admin-written name is a value off a row like any other.
    expect(html).toMatch(/<strong[^>]*>Easter &lt;3<\/strong><br \/>26–29 Mar/);
    expect(html).not.toContain("Easter <3");
  });

  it("states them in the text twin too, on one line", () => {
    const body = productConfirmationText(
      t,
      resolve({ holidayBreaks: BREAKS, invitation: SCHEDULE }),
    );
    expect(body).toContain("Holiday breaks: Winter break, 22–26 Feb — Easter <3, 26–29 Mar");
  });

  it("states no row at all when there are none", () => {
    expect(render({ holidayBreaks: [] })).not.toContain("Holiday breaks");
    expect(
      productConfirmationText(t, resolve({ holidayBreaks: [], invitation: SCHEDULE })),
    ).not.toContain("Holiday breaks");
  });

  it("states them on the child's copy as well, since they are not a parent's fact", () => {
    expect(render({ holidayBreaks: BREAKS, gamerCopy: true })).toMatch(
      /<strong[^>]*>Winter break<\/strong><br \/>22–26 Feb/,
    );
  });
});

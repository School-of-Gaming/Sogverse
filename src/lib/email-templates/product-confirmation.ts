import { wrapInLayout } from "./layout";
import {
  defuseAutolinks,
  escapeHtml,
  heading,
  paragraph,
  styledName,
  styledProductName,
} from "./utils";
import { bulletList, ctaButton, factList, sectionLabel } from "./blocks";
import { buildTopicPrepSection, topicPrepText } from "./topic-prep";
import { resolveTopicPrep } from "@/lib/products/topics";
import { textAttachment, type RenderedAttachment } from "./attachments";
import {
  composeProductConfirmationInvitation,
  type ProductConfirmationInvitation,
  type ProductConfirmationInvitationInput,
} from "./product-confirmation-invitation";
import { languageNameIn } from "@/lib/i18n/language-name";
import {
  productLocationLabelIsFormat,
  renderProductLocationLine,
  type ProductLocationDisplay,
} from "@/lib/products/format-product-location";
import {
  productScheduleDisplayLines,
  productWhoItsFor,
} from "@/lib/products/product-overview-facts";
import type { EmailTranslator, TopicPrepTranslator } from "./translator";
import type { ProductTopic, ProductType } from "@/types";

/**
 * The mail that follows a signup: **the emailed twin of the purchase
 * confirmation page, plus the calendar invitation the page cannot carry.**
 *
 * **What the two surfaces owe each other is their *facts*, not their layout.** A
 * parent must be able to learn everything about what they have just joined from
 * either one: what it is, who holds the seat, when and where it runs, who it is
 * for, what language it is in, what it costs and what happens next. Neither may
 * state a fact the other lacks. How those facts are *laid out* is each medium's
 * own business — the page has two cards, a picture and a pair of buttons in a
 * shop the reader is still standing in; the mail has one list of rows, because
 * a boxed card spends side padding a phone's column does not have to give.
 *
 * Sentences the two share should still read the same, and where a fact has a
 * composition rule that rule is one function under `src/lib/products/` that
 * both call. But equality of wording is kept by care rather than by a test:
 * the parity table that used to hold every shared key pair equal, locale by
 * locale, was retired as overkill for what it caught.
 *
 * **The foot is where the two deliberately differ, and it is one button here.**
 * The page offers My SOG beside a "keep browsing", because a reader who has
 * just checked out is still standing in the shop and the second button is the
 * way back into it. A reader in their inbox is not standing anywhere, so the
 * mail carries the one action it is asking for — and, being alone, it takes the
 * primary brand fill that a two-button row forbids. Under it the mail says one
 * more thing the page has no use for: that a reply to it reaches a person,
 * which is true because this send's Reply-To is the support inbox.
 *
 * (The email translator is scoped to the `email` namespace and cannot reach the
 * page's `purchaseConfirmation` keys, so a sentence both surfaces state is two
 * strings in the message files. Editing one is editing half of it.)
 *
 * **The one thing both surfaces state from the same words is the "Before the
 * first session" guide**, which is why this builder takes a second translator:
 * the guide is a document rather than a line, and copying it under `email`
 * would put the same paragraphs in five catalogs twice with nothing holding
 * them equal. It renders on the enrolled outcome only — a waitlist join has no
 * seat and therefore no first session — and on both copies, because the guide
 * is one text written to read the same to a parent and to a gamer.
 *
 * **The four places the mail deliberately differs from the page**, each because
 * the medium differs rather than because the copy drifted:
 *
 *   - It closes by inviting a reply, which is an affordance rather than a fact:
 *     a mail can be answered and a page cannot. The line is true because this
 *     send's Reply-To is the support inbox, so it goes wherever that does.
 *   - It carries an `invite.ics`, and says nothing about it. The page has
 *     nothing to attach; the mail has nothing to announce, because a client
 *     that can act on the file renders the invitation itself and a sentence
 *     underneath would be narrating the attachment list to somebody already
 *     looking at it.
 *   - It states the schedule in the *product's* own zone and always appends
 *     that zone's short abbrev to the time-bearing line, because a mail has no
 *     viewer zone: the page reads one from the signed-in profile, renders the
 *     clock faces in it, and appends the same abbrev only where the two zones
 *     differ. Same lines, same formatter, one option.
 *   - It drops the waitlist position, and it prints no product picture. A queue
 *     number frozen into an inbox goes stale the moment somebody ahead drops
 *     out and a parent cannot tell a stale one from a live one; the picture is
 *     the image rule's doing and is explained where the summary is built.
 *
 * The language fact is the small one: the page shows a flag chip and a code,
 * which a mail has no component for, so the mail names the language instead.
 *
 * **The child's own copy is the same mail with the parent's half taken out.**
 * When a child holds a mailbox of their own they receive their own render
 * beside the parent's: the reader is the participant, so every sentence takes
 * the second person the way a self seat does, and the price row and the billing
 * bullets — the only lines addressed to whoever pays — are gone. Everything
 * else is the same document, the calendar file included: a child with an inbox
 * has a calendar, and the sessions are theirs to be reminded of.
 */

/**
 * The one axis this mail branches on. Four of the five are price shapes and
 * the fifth is an outcome, which is not an oversight: a waitlist join has no
 * price to state, so the mode that has no price is the mode that changes the
 * whole mail.
 *
 * **`external` and `free` are two different price shapes, not one.** Both cost
 * the family nothing at our till, and the mail used to collapse them into
 * `free` on exactly that reasoning. It was wrong in the reader's hands: most
 * municipalities run their clubs at no charge to families, but some levy a
 * small fee of their own, and a parent who has already been told that by their
 * municipality reads our "Free" as a contradiction of something they know.
 * `external` names who bears the cost and stays silent on everything either
 * side of it: what the municipality then asks of the family is not ours to
 * answer and is not news to them, and how we settle up with the municipality is
 * our arrangement rather than theirs to read.
 */
export const PRODUCT_CONFIRMATION_MODES = [
  "subscription",
  "upfront",
  "free",
  "external",
  "waitlist",
] as const;

export type ProductConfirmationMode = (typeof PRODUCT_CONFIRMATION_MODES)[number];

/**
 * The product facts behind the "Good to know" card, exactly the columns the
 * page's own overview card reads — because the mail renders them through that
 * card's formatters rather than through a second set of its own.
 *
 * `null` on the whole thing is a send that could not read them (see the
 * waitlist note at the sender), and those rows are then simply absent from the
 * mail's list. That is the one shape where the mail states fewer facts than the
 * page, and it is preferred to rows with holes in them.
 */
export interface ProductConfirmationOverviewInput {
  timezone: string;
  /** Product-local `YYYY-MM-DD`, or `null` on a product with no declared start. */
  startDate: string | null;
  /** Product-local `YYYY-MM-DD`, or `null` on an open-ended run. */
  endDate: string | null;
  /** The schedule rows as the database holds them. */
  slots: readonly {
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }[];
  isRemote: boolean;
  /**
   * Where it happens, already resolved to display names in the reader's locale
   * by the shared location rule — the same value the page hands its card.
   */
  location: ProductLocationDisplay | null;
  minAge: number | null;
  maxAge: number | null;
  forGamers: boolean;
  forParents: boolean;
  /** The `spoken_language` enum value; named for the reader by `Intl`. */
  spokenLanguageCode: string;
  /** When the mail is being composed — anchors a recurring schedule. */
  now: Date;
}

export interface ProductConfirmationEmailOptions {
  /** The participant's first name — a child's, or the buyer's own on a self seat. */
  participantName: string;
  /**
   * True when the parent took the seat themselves. Every sentence naming the
   * participant then moves to the second person, and it moves by swapping the
   * *whole key* rather than interpolating a pronoun — a possessive that agrees
   * with a name in English does not in Finnish or Swedish.
   *
   * The order summary still names them either way, exactly as the page does:
   * there the name is a value rather than a subject, and a reader's own first
   * name beside "Enrolled" is what they recognise.
   */
  isSelfSeat: boolean;
  productName: string;
  productType: ProductType;
  /**
   * The product's topic, which is what decides whether this mail carries the
   * "Before the first session" guide and which guide it carries. Seven topics
   * have one; the rest state none and the mail is the mail it always was.
   */
  topic: ProductTopic;
  /**
   * The product's `is_remote`, and the guide's filter: in person we bring the
   * machines with everything installed, so an in-person product states only the
   * account steps and a topic whose every step belongs to our machines states
   * nothing at all.
   *
   * **Carried here rather than read out of `overview`, though that bundle holds
   * the same column.** `overview` is the "Good to know" card's input and is
   * allowed to be `null` on a send that could not read those facts — a mail
   * with a shorter list, which is a presentation degradation. Which steps a
   * family is told to take is not a fact about that card: telling an in-person
   * family to install software they will never need is a wrong instruction
   * rather than a missing row, so the filter does not travel inside an optional
   * bundle. Both come off the one `products.is_remote` at each call site, which
   * is what keeps them from disagreeing.
   */
  isRemote: boolean;
  mode: ProductConfirmationMode;
  /**
   * The price, already formatted in the reader's locale and currency by the
   * caller. Formatting lives with the caller because it needs the product's
   * prices and the currency config; the builder stays a pure string composer.
   * Null on the modes that state no amount (`free`, `external`, `waitlist`).
   */
  priceAmount: string | null;
  /**
   * The deferred first charge's date, already formatted through the shared
   * first-charge rule the page renders it with, or `null` where nothing was
   * deferred. Only a subscription ever states one.
   */
  firstChargeDate: string | null;
  /** App-generated My SOG link — the mail's one button. */
  dashboardUrl: string;
  /** The "Good to know" facts, or `null` where the send could not read them. */
  overview: ProductConfirmationOverviewInput | null;
  /**
   * Everything the calendar invitation is composed from, or `null` where the
   * mail is not to carry one at all.
   *
   * **`null` is the waitlist**, and it is a different absence from a schedule
   * that yields no calendar object: a place in a queue is not a seat, and an
   * entry in somebody's calendar for sessions they may never attend would be
   * the wrong promise. Everything else hands the schedule over and lets the
   * composer decide, which is where the "product has no slots yet" and "product
   * is over" answers are made.
   */
  invitation: ProductConfirmationInvitationInput | null;
  /**
   * The child's own copy, sent beside the parent's when the child holds a
   * mailbox of their own. The reader *is* the participant, so it speaks in the
   * second person exactly as a self seat does — and it drops everything only a
   * parent can act on: the price row and the billing bullets.
   *
   * It is **not** an axis of the calendar file. The child's copy carries the
   * same `invite.ics` as the parent's, addressed to the child as its attendee;
   * see the composer for what that changes and what it deliberately does not.
   *
   * `isSelfSeat` is ignored under it, because the child's copy of an adult's
   * own seat does not exist.
   */
  gamerCopy?: boolean;
}

/**
 * Whether the reader of this render is the participant it is about.
 *
 * Two different facts answer it — the parent took the seat themselves, or the
 * render is the child's own copy — and every sentence naming the participant
 * turns on the answer rather than on either fact, by swapping the *whole key*
 * as the self seat has always done. One function, so the subject, the body and
 * the text twin cannot decide it three ways.
 */
function readerIsParticipant({
  isSelfSeat,
  gamerCopy,
}: Pick<ProductConfirmationEmailOptions, "isSelfSeat" | "gamerCopy">): boolean {
  return isSelfSeat || gamerCopy === true;
}

/** One already-translated fact: a label, and one or more lines of value. */
export interface ProductConfirmationFact {
  label: string;
  lines: string[];
}

/**
 * One render's worth of resolved content: the options it was given, the
 * calendar object composed from them exactly once, and the overview facts
 * formatted exactly once.
 *
 * **Once is the point**, and it is the same reason the calendar explorer
 * resolves once. The body, the plain-text twin and the attached file all state
 * the same things, and a composition that ran per callback would let the mail
 * say one thing and the file beside it say another — with nothing about the
 * disagreement visible from inside any one of them.
 */
export interface ProductConfirmationContent {
  options: ProductConfirmationEmailOptions;
  /** `null` where no calendar object could be composed. See the composer. */
  invitation: ProductConfirmationInvitation | null;
  /** `null` where the send had no product facts to state. */
  overview: ProductConfirmationFact[] | null;
  /**
   * The "Before the first session" guide, rendered **once** into both of the
   * forms this mail states it in, or `null` where the mail carries none.
   *
   * The pair is resolved together for the same reason the calendar object is:
   * the HTML body and the plain-text twin state the same document, and a guide
   * composed once per callback could be shortened in one and not in the other
   * — an in-person family reading "install the launcher" in their calendar
   * entry's notes and not in the mail above it. One composition cannot do that.
   */
  topicPrep: { html: string; text: string[] } | null;
}

/**
 * The options, plus the calendar object and the overview facts every part of
 * the render reads.
 *
 * A waitlist join never composes a calendar object — there is no seat behind it
 * — and neither does a product whose schedule states nothing a calendar can
 * hold. Both come back as `null`, and every part of the render then produces
 * the mail with no file and no plain-text twin.
 */
export function resolveProductConfirmation(
  t: EmailTranslator,
  /**
   * The second translator, scoped to the top-level `topicPrep` namespace —
   * because the guide is one document shared word for word with pages the app
   * renders, and `t` here cannot reach outside `email`. See `translator.ts`.
   *
   * `null` is a caller that has none to give, and it composes the mail without
   * the guide. The live sends always hand one over; the admin harness's render
   * path is where the absence is reachable at all.
   */
  tPrep: TopicPrepTranslator | null,
  locale: string,
  options: ProductConfirmationEmailOptions,
): ProductConfirmationContent {
  const invitation =
    options.invitation === null || options.mode === "waitlist"
      ? null
      : composeProductConfirmationInvitation(t, locale, {
          ...options.invitation,
          // The one thing the child's copy changes about the document beyond
          // its attendee: the entry's title stops naming the reader. The flag
          // travels rather than being re-derived, so the mail and the file
          // cannot disagree about who is reading them.
          gamerCopy: options.gamerCopy ?? false,
        });
  return {
    options,
    invitation,
    overview:
      options.overview === null
        ? null
        : resolveOverview(t, locale, options.productType, options.overview),
    topicPrep: resolveTopicPrepSection(tPrep, options),
  };
}

/**
 * The guide's two forms, or nothing.
 *
 * **Never on a waitlist join**, whatever the topic says: there is no seat yet,
 * so there is no first session to be ready for, and a guide telling a family to
 * buy the game and install it beside a mail saying they are in a queue is the
 * one thing this mail must not do.
 *
 * The resolver answers `null` on a topic with no guide and on an in-person
 * product whose every step belongs to a machine we are supplying — the same
 * answer from a mail's point of view, and this passes it straight on as `null`
 * so the body and its twin each have one thing to check.
 */
function resolveTopicPrepSection(
  tPrep: TopicPrepTranslator | null,
  options: ProductConfirmationEmailOptions,
): ProductConfirmationContent["topicPrep"] {
  if (tPrep === null || options.mode === "waitlist") return null;
  // Resolved **once**, here, and handed to both builders — which is what makes
  // the docblock above true: one plan cannot shorten the body and leave the
  // plain-text twin long.
  const plan = resolveTopicPrep(options.topic, options.isRemote);
  if (plan === null) return null;
  return {
    html: buildTopicPrepSection(tPrep, plan),
    text: topicPrepText(tPrep, plan),
  };
}

/**
 * The four facts of the page's "Good to know" card, in the page's order and
 * under the page's labels, each composed by the rule that page uses.
 *
 * Nothing here is escaped: these are values a caller renders into HTML or into
 * text, and each destination escapes for itself — the directory's usual rule.
 */
function resolveOverview(
  t: EmailTranslator,
  locale: string,
  productType: ProductType,
  input: ProductConfirmationOverviewInput,
): ProductConfirmationFact[] {
  const facts: ProductConfirmationFact[] = [];

  facts.push({
    label: t("productConfirmation.overview.schedule"),
    lines: productScheduleDisplayLines({
      product: {
        product_type: productType,
        start_date: input.startDate,
        end_date: input.endDate,
        timezone: input.timezone,
        schedule_slots: input.slots,
      },
      locale,
      // The product's own zone, because a mail has no viewer zone — parents
      // store none. So the times are in a zone the reader cannot infer, and the
      // abbrev that names it is always appended rather than only when the
      // viewer's zone differs, which is what the page keys on.
      timeZone: input.timezone,
      now: input.now,
      nameZone: "always",
    }),
  });

  const labelIsFormat = productLocationLabelIsFormat(input.isRemote, input.location);
  facts.push({
    label: labelIsFormat
      ? t("productConfirmation.overview.format")
      : t("productConfirmation.overview.where"),
    lines: [
      renderProductLocationLine({
        location: input.location,
        isRemote: input.isRemote,
        online: t("productConfirmation.overview.online"),
        tbd: t("productConfirmation.overview.tbd"),
      }),
    ],
  });

  const whoItsFor = productWhoItsFor({
    for_gamers: input.forGamers,
    for_parents: input.forParents,
    min_age: input.minAge,
    max_age: input.maxAge,
  });
  if (whoItsFor !== null) {
    facts.push({
      label:
        whoItsFor.label === "ageRange"
          ? t("productConfirmation.overview.ageRange")
          : t("productConfirmation.overview.audience"),
      lines: [
        whoItsFor.value.kind === "ages"
          ? t("productConfirmation.overview.ages", whoItsFor.value)
          : whoItsFor.value.kind === "parents"
            ? t("productConfirmation.overview.audienceParents")
            : whoItsFor.value.kind === "families"
              ? t("productConfirmation.overview.audienceFamilies")
              : t(
                  "productConfirmation.overview.audienceFamiliesWithAges",
                  whoItsFor.value,
                ),
      ],
    });
  }

  facts.push({
    label: t("productConfirmation.overview.language"),
    // The page paints a flag chip with the uppercase code; a mail has no flag
    // component and would need a second hosted image for each language to get
    // one, so it names the language instead — in the reader's own locale, which
    // is what the chip's `title` says on the page.
    lines: [languageNameIn(input.spokenLanguageCode, locale)],
  });

  return facts;
}

/**
 * The subject line, from the same params the body is built from.
 *
 * It lives beside the builder rather than at either call site because there are
 * two of them — the live sends and the admin testing harness — and a subject
 * that disagrees with its body is the failure this prevents. All three axes of
 * the body reach it: the waitlist/enrolled split, the self seat, and — like the
 * confirmation page — the verb the product type calls for. A subject saying
 * "Aino is signed up" over a body saying "you are on the waitlist" is two wrong
 * answers in one line, and the inbox list is where the reader meets it first.
 *
 * Waitlist stays type-generic on purpose: waiting for a seat is the same
 * sentence whichever kind of seat it is, and a per-type waitlist verb would be
 * four ways of writing one fact.
 */
export function productConfirmationSubject(
  t: EmailTranslator,
  { options }: ProductConfirmationContent,
): string {
  const { participantName, productName, productType, mode } = options;
  // The child reading their own copy is the participant, so the subject takes
  // the second person exactly as a self seat does.
  const secondPerson = readerIsParticipant(options);
  if (mode === "waitlist") {
    return secondPerson
      ? t("productConfirmation.waitlist.subjectSelf", { productName })
      : t("productConfirmation.waitlist.subject", { participantName, productName });
  }
  return secondPerson
    ? t(`productConfirmation.self.subject.${productType}`, { productName })
    : t(`productConfirmation.subject.${productType}`, { participantName, productName });
}

export function buildProductConfirmationEmail(
  t: EmailTranslator,
  locale: string,
  content: ProductConfirmationContent,
): string {
  const {
    options: { participantName, productName, productType, mode, dashboardUrl, gamerCopy },
    // No `invitation` here: the body says nothing about the file, so whether
    // one was composed changes the attachment and the text twin and no byte of
    // the HTML.
    overview,
  } = content;
  const isWaitlist = mode === "waitlist";
  const name = styledName(participantName);
  const product = styledProductName(productName);
  // The reader is the participant on a self seat and on the child's own copy,
  // and every sentence naming the participant moves to the second person on
  // both — by swapping whole keys, as the self seat already does.
  const secondPerson = readerIsParticipant(content.options);

  const title = isWaitlist
    ? t("productConfirmation.waitlist.heading")
    : t("productConfirmation.heading");

  const subheading = isWaitlist
    ? secondPerson
      ? t("productConfirmation.self.waitlist.subheading", { productName: product })
      : t("productConfirmation.waitlist.subheading", { participantName: name, productName: product })
    : secondPerson
      ? t(`productConfirmation.self.subheading.${productType}`, { productName: product })
      : t(`productConfirmation.subheading.${productType}`, { participantName: name, productName: product });

  // The child's copy is the one variant that greets the reader by name: the
  // second-person sentences under it name nobody, and a mail to a child that
  // never says who it is for reads as one that was meant for their parent.
  const greeting = gamerCopy
    ? paragraph(t("productConfirmation.gamer.greeting", { participantName: name }))
    : "";

  // **One facts list, and it is the whole middle of the mail.** What the page
  // lays out as two cards — the order summary, then "Good to know" — is one run
  // of rows here, in the order a parent needs them: what they joined, who it is
  // for, when and where it happens, and what it costs. Two boxed cards was the
  // page's arrangement rather than the mail's, and on a phone each one spent
  // its own border and padding out of a column that had none to give.
  //
  // **No picture, and that is the image rule rather than an omission.** The
  // page paints the product's photograph at a 96×64 crop; a mail cannot,
  // because an image's box here has to be arithmetic from dimensions the sender
  // already holds, and there are none: `product_images` stores an id, a label,
  // a hash and a path, no aspect is enforced on upload, and the accept list
  // admits `webp`, `avif` and `svg`, none of which Outlook's desktop engine
  // renders. A fixed 96×64 box would stretch a portrait and a width-only `<img>`
  // would reserve nothing and reflow the mail when it loaded. So the row is the
  // type and the name alone, which leaves no hole — the picture was never
  // carrying a fact the two lines beside it do not.
  const factRows: [string, string][] = [
    [t(`productConfirmation.typeLabel.${productType}`), product],
    [
      isWaitlist
        ? t("productConfirmation.waitlist.forLabel")
        : t(`productConfirmation.forLabel.${productType}`),
      escapeHtml(participantName),
    ],
    ...overviewRows(overview),
  ];
  // The child's copy states no price whatever it was handed: what a seat cost
  // is between us and whoever paid for it.
  const price = gamerCopy ? null : plainPriceLine(t, mode, content.options.priceAmount);
  if (price !== null) {
    // Last, because it is the row a reader checks rather than the one they read
    // the mail for — and because the money is the half of this document a child
    // never sees, which makes it the cleanest row to be able to drop.
    factRows.push([t("productConfirmation.priceLabel"), escapeHtml(price)]);
  }

  const body = `
    ${heading(title)}
    ${greeting}
    ${paragraph(subheading)}
    ${sectionLabel(summaryTitle(t, content.options))}
    ${factList(factRows)}
    ${sectionLabel(t("productConfirmation.nextTitle"))}
    ${bulletList(
      nextItems(t, content.options, {
        participantName: name,
        firstChargeDate: escapeHtml(content.options.firstChargeDate ?? ""),
      }),
    )}
    ${
      // The guide comes after "what happens next" and before the button,
      // because that list is where the mail says *when* the first session is
      // and this is what to do before it — the same reason it sits under that
      // card on the confirmation page. Both readers get it: the steps are one
      // text written to read the same to a parent and to a gamer, so the
      // child's copy carries the guide the parent's does.
      //
      // Already composed HTML from the section builder, spliced whole: it is
      // empty on a topic with no guide, on an in-person product with nothing
      // left to do, and on every waitlist join, and an empty string costs the
      // mail nothing — no wrapper left behind, no gap to close.
      content.topicPrep?.html ?? ""
    }
    ${ctaButton({
      // One button, and it is the page's own primary. The page also offers a
      // "keep browsing" beside it, because a reader still standing in the shop
      // has somewhere obvious to go back to; a reader in their inbox does not,
      // so the mail carries the one action it is actually asking for and takes
      // the brand fill a two-button row would forbid it.
      href: dashboardUrl,
      label: t("productConfirmation.dashboardButton"),
      variant: "primary",
    })}
    ${
      // "Just reply to this email" is a true instruction on this mail and not a
      // figure of speech: every product send carries an explicit Reply-To, and
      // this one's is the support inbox (the directory's default, and the send
      // site says so at its call). A mail that invited a reply into the
      // unattended sending address would be the void this line exists to prove
      // is not there — so if this send ever takes a Reply-To of its own, this
      // sentence goes with it.
      paragraph(t("productConfirmation.closing"))
    }
  `;
  return wrapInLayout({ title, content: body, locale, t });
}

/**
 * The label over the facts list — the page's order-summary title, doing the
 * same job over a longer run of rows.
 *
 * **"Your order" is a buyer's word, and the child's copy has no buyer in it.**
 * That copy states no price and asks for no payment, so the list under it is a
 * record of a signup rather than of a purchase, and naming it after an order a
 * child did not place is the one line where the parent's mail would show
 * through. The waitlist's own title needs no such variant: waiting for a seat
 * is the same fact for whoever is waiting.
 */
function summaryTitle(
  t: EmailTranslator,
  { mode, gamerCopy }: ProductConfirmationEmailOptions,
): string {
  if (mode === "waitlist") return t("productConfirmation.waitlist.summaryTitle");
  return gamerCopy
    ? t("productConfirmation.gamer.summaryTitle")
    : t("productConfirmation.summaryTitle");
}

/**
 * The product's own facts as rows of the one list, or none at all where the
 * send could not read them.
 *
 * **They carry no section label of their own.** The page heads them "Good to
 * know" because they are a second card there, standing apart from the order
 * summary above; here they are the middle of one list, and a label inside a run
 * of rows would be announcing a break the layout does not make. A send with no
 * facts to state simply has a shorter list — which is the same degradation the
 * card used to make by being absent, with nothing left behind to look empty.
 */
function overviewRows(
  overview: ProductConfirmationFact[] | null,
): [string, string][] {
  if (overview === null) return [];
  return overview.map(({ label, lines }): [string, string] => [
    label,
    // A site name can be address-shaped, and every mail client linkifies
    // anything that looks like one — so a value off a row is defused as
    // well as escaped.
    lines.map((line) => defuseAutolinks(escapeHtml(line))).join("<br />"),
  ]);
}

/**
 * What happens next, in the page's order and with the page's omissions.
 *
 * Placement first; then the deferred first charge, on the one signup that has
 * one — the parent has just seen €0 at checkout and is owed the real date in
 * the same breath; then the price-shape line. `free` and `external` state no
 * third bullet at all, exactly as the page states none: the price row above has
 * already said what there is to say about the cost, and every honest expansion
 * of it was some version of who we invoice, which is our arrangement with a
 * municipality rather than a thing a parent has any use for.
 */
function nextItems(
  t: EmailTranslator,
  options: ProductConfirmationEmailOptions,
  /**
   * The two interpolated values, already prepared for the destination that is
   * about to render them — marked-up and escaped for the HTML body, bare for
   * the text twin. Passing them in is what lets one composition serve both:
   * escaping inside would put `&#39;` into a calendar entry's notes.
   */
  values: { participantName: string; firstChargeDate: string },
): string[] {
  const { productType, mode, firstChargeDate, gamerCopy } = options;
  const secondPerson = readerIsParticipant(options);
  if (mode === "waitlist") {
    return [
      t("productConfirmation.waitlist.next1"),
      secondPerson
        ? t(`productConfirmation.self.waitlist.next2.${productType}`)
        : t(`productConfirmation.waitlist.next2.${productType}`, {
            participantName: values.participantName,
          }),
      t("productConfirmation.waitlist.next3"),
    ];
  }

  const items = [
    secondPerson
      ? t("productConfirmation.next.placementSelf")
      : t("productConfirmation.next.placement", {
          participantName: values.participantName,
        }),
  ];
  // **The child's copy stops here, on every mode.** What is left is the money:
  // when the first charge falls, and that a subscription bills monthly or a
  // one-time payment is done with. All of it is addressed to whoever pays, and
  // a child told they will be billed every month has been sent their parent's
  // mail under their own name.
  if (gamerCopy === true) return items;
  if (mode === "subscription" && firstChargeDate !== null) {
    items.push(
      t("productConfirmation.next.firstCharge", { date: values.firstChargeDate }),
    );
  }
  if (mode === "subscription" || mode === "upfront") {
    items.push(t(`productConfirmation.next.${mode}`));
  }
  return items;
}

/**
 * The whole mail as plain text, in the same sections and the same order.
 *
 * **Not a courtesy fallback — on a Microsoft mailbox it is the calendar entry's
 * notes.** Exchange fills the entry from the message body, and with only HTML
 * to work from it flattens the markup into them: a parent opening the session
 * in their calendar finds the mail's table structure and the provider's
 * tracking pixel rendered as text. So it is the mail's own words, in the mail's
 * own order.
 *
 * It is stated only when the mail carries the calendar part, because that is
 * the only reason it exists. Every other send is HTML alone, as it always was.
 */
export function productConfirmationText(
  t: EmailTranslator,
  content: ProductConfirmationContent,
): string | undefined {
  const { invitation, overview } = content;
  if (invitation === null) return undefined;

  const {
    options: {
      participantName,
      productName,
      productType,
      mode,
      priceAmount,
      dashboardUrl,
      gamerCopy,
    },
  } = content;
  // The same reader test the HTML makes, so the entry's notes speak in the
  // voice the mail above them does.
  const secondPerson = readerIsParticipant(content.options);

  // The enrolled keys throughout, with no waitlist branch: a waitlist join
  // composes no calendar object, so this function has already returned for it.
  const lines: string[] = [
    t("productConfirmation.heading"),
    "",
    ...(gamerCopy ? [t("productConfirmation.gamer.greeting", { participantName }), ""] : []),
    secondPerson
      ? t(`productConfirmation.self.subheading.${productType}`, { productName })
      : t(`productConfirmation.subheading.${productType}`, { participantName, productName }),
    "",
    summaryTitle(t, content.options),
    `${t(`productConfirmation.typeLabel.${productType}`)}: ${productName}`,
    `${t(`productConfirmation.forLabel.${productType}`)}: ${participantName}`,
  ];

  // The same one list the HTML states, in the same order and with no heading
  // over its middle: the product's facts run on from the two rows above them.
  if (overview !== null) {
    for (const { label, lines: values } of overview) {
      lines.push(`${label}: ${values.join(" — ")}`);
    }
  }

  const price = gamerCopy ? null : plainPriceLine(t, mode, priceAmount);
  if (price !== null) {
    lines.push(`${t("productConfirmation.priceLabel")}: ${price}`);
  }

  lines.push(
    "",
    t("productConfirmation.nextTitle"),
    ...nextItems(t, content.options, {
      participantName,
      firstChargeDate: content.options.firstChargeDate ?? "",
    }).map((item) => `- ${item}`),
    // The same guide the HTML states, at the same place in the document and
    // from the same resolution — so the calendar entry's notes cannot hold a
    // longer or shorter guide than the mail they were filled from.
    ...(content.topicPrep === null ? [] : ["", ...content.topicPrep.text]),
    "",
    `${t("productConfirmation.dashboardButton")}: ${dashboardUrl}`,
    "",
    t("productConfirmation.closing"),
  );

  return lines.join("\n");
}

/**
 * The `invite.ics`, or nothing at all.
 *
 * **The file name is load-bearing.** The provider infers the media type from
 * the extension, and `invite.ics` is what makes a client read the part as an
 * invitation it can act on rather than as a file to download — which is the
 * difference between an entry that lands in a calendar and one a parent has to
 * add by hand.
 */
export function productConfirmationAttachments(
  content: ProductConfirmationContent,
): RenderedAttachment[] {
  return content.invitation === null
    ? []
    : [textAttachment("invite.ics", content.invitation.ics)];
}

/**
 * The price line's value, or nothing. A waitlist join has no price, and a paid
 * mode with no amount in hand states nothing rather than a blank figure — an
 * empty price beside a product name reads as "free", which is the one thing it
 * must never be mistaken for.
 *
 * Shared by the HTML and the text body so the two cannot state different
 * prices. The caller escapes for its own destination.
 */
function plainPriceLine(
  t: EmailTranslator,
  mode: ProductConfirmationMode,
  priceAmount: string | null,
): string | null {
  switch (mode) {
    case "subscription":
    case "upfront":
      return priceAmount === null
        ? null
        : t(`productConfirmation.price.${mode}`, { amount: priceAmount });
    case "free":
      return t("productConfirmation.price.free");
    case "external":
      return t("productConfirmation.price.external");
    case "waitlist":
      return null;
  }
}

import { wrapInLayout } from "./layout";
import {
  defuseAutolinks,
  escapeHtml,
  heading,
  paragraph,
  styledName,
  styledProductName,
} from "./utils";
import { bulletList, ctaButton, factTable, sectionLabel } from "./blocks";
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
import type { EmailTranslator } from "./translator";
import type { ProductType } from "@/types";

/**
 * The mail that follows a signup: **the emailed twin of the purchase
 * confirmation page, plus the calendar invitation the page cannot carry.**
 *
 * Section for section it is that page — the same heading and opening sentence,
 * the same order summary, the same "Good to know" facts, the same "what happens
 * next" bullets — composed in the mail's own idiom of tables and inline CSS.
 *
 * **The foot is where the two deliberately differ, and it is one button here.**
 * The page offers My SOG beside a "keep browsing", because a reader who has
 * just checked out is still standing in the shop and the second button is the
 * way back into it. A reader in their inbox is not standing anywhere, so the
 * mail carries the one action it is asking for — and, being alone, it takes the
 * primary brand fill that a two-button row forbids. That sentence is therefore
 * not shared and not in the parity table.
 *
 * A parent who paid on their phone and then
 * opened the mail on a laptop is not told two different stories, and the copy
 * cannot drift: every sentence the two share is held equal, locale by locale, by
 * the parity test in `tests/unit/email-templates/product-confirmation.test.ts`.
 * (The email translator is scoped to the `email` namespace and cannot reach the
 * page's `purchaseConfirmation` keys, so the two sets of strings are real
 * duplicates and the test is what keeps them from becoming two answers.)
 *
 * **The three places the mail deliberately differs from the page**, each because
 * the medium differs rather than because the copy drifted:
 *
 *   - It carries an `invite.ics` and a sentence saying so. The page has nothing
 *     to attach.
 *   - It states the schedule in the *product's* own zone and names that zone in
 *     words, because a mail has no viewer zone: the page reads one from the
 *     signed-in profile and renders the clock faces in it. Same lines, same
 *     formatter — a different zone, said out loud.
 *   - It drops the waitlist position, and it prints no product picture. A queue
 *     number frozen into an inbox goes stale the moment somebody ahead drops
 *     out and a parent cannot tell a stale one from a live one; the picture is
 *     the image rule's doing and is explained where the summary is built.
 *
 * The language fact is the small one: the page shows a flag chip and a code,
 * which a mail has no component for, so the mail names the language instead.
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
 * waitlist note at the sender), and the card is then simply absent. That is the
 * one shape where the mail is a shorter page rather than the same one, and it
 * is preferred to a card with holes in it.
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
}

/**
 * The options, plus the calendar object and the overview facts every part of
 * the render reads.
 *
 * A waitlist join never composes a calendar object — there is no seat behind it
 * — and neither does a product whose schedule states nothing a calendar can
 * hold. Both come back as `null`, and every part of the render then produces
 * the mail with no file, no attachment sentence and no plain-text twin.
 */
export function resolveProductConfirmation(
  t: EmailTranslator,
  locale: string,
  options: ProductConfirmationEmailOptions,
): ProductConfirmationContent {
  const invitation =
    options.invitation === null || options.mode === "waitlist"
      ? null
      : composeProductConfirmationInvitation(t, locale, options.invitation);
  return {
    options,
    invitation,
    overview:
      options.overview === null
        ? null
        : resolveOverview(t, locale, options.productType, options.overview),
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
  {
    options: { participantName, isSelfSeat, productName, productType, mode },
  }: ProductConfirmationContent,
): string {
  if (mode === "waitlist") {
    return isSelfSeat
      ? t("productConfirmation.waitlist.subjectSelf", { productName })
      : t("productConfirmation.waitlist.subject", { participantName, productName });
  }
  return isSelfSeat
    ? t(`productConfirmation.self.subject.${productType}`, { productName })
    : t(`productConfirmation.subject.${productType}`, { participantName, productName });
}

export function buildProductConfirmationEmail(
  t: EmailTranslator,
  locale: string,
  content: ProductConfirmationContent,
): string {
  const {
    options: {
      participantName,
      isSelfSeat,
      productName,
      productType,
      mode,
      dashboardUrl,
    },
    invitation,
    overview,
  } = content;
  const isWaitlist = mode === "waitlist";
  const name = styledName(participantName);
  const product = styledProductName(productName);

  const title = isWaitlist
    ? t("productConfirmation.waitlist.heading")
    : t("productConfirmation.heading");

  const subheading = isWaitlist
    ? isSelfSeat
      ? t("productConfirmation.self.waitlist.subheading", { productName: product })
      : t("productConfirmation.waitlist.subheading", { participantName: name, productName: product })
    : isSelfSeat
      ? t(`productConfirmation.self.subheading.${productType}`, { productName: product })
      : t(`productConfirmation.subheading.${productType}`, { participantName: name, productName: product });

  // The order summary, in the page's order: the type and the product's name,
  // then who the seat is for, then what it costs.
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
  const summaryRows: [string, string][] = [
    [t(`productConfirmation.typeLabel.${productType}`), product],
    [
      isWaitlist
        ? t("productConfirmation.waitlist.forLabel")
        : t(`productConfirmation.forLabel.${productType}`),
      escapeHtml(participantName),
    ],
  ];
  const price = plainPriceLine(t, mode, content.options.priceAmount);
  if (price !== null) {
    summaryRows.push([t("productConfirmation.priceLabel"), escapeHtml(price)]);
  }

  const body = `
    ${heading(title)}
    ${paragraph(subheading)}
    ${sectionLabel(
      isWaitlist
        ? t("productConfirmation.waitlist.summaryTitle")
        : t("productConfirmation.summaryTitle"),
    )}
    ${factTable(summaryRows)}
    ${overviewSection(t, overview)}
    ${sectionLabel(t("productConfirmation.nextTitle"))}
    ${bulletList(
      nextItems(t, content.options, {
        participantName: name,
        firstChargeDate: escapeHtml(content.options.firstChargeDate ?? ""),
      }),
    )}
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
    ${invitation === null ? "" : paragraph(t("productConfirmation.invite.attached"))}
  `;
  return wrapInLayout({ title, content: body, locale, t });
}

/** The "Good to know" card, or nothing where the send had no facts to state. */
function overviewSection(
  t: EmailTranslator,
  overview: ProductConfirmationFact[] | null,
): string {
  if (overview === null) return "";
  return `
    ${sectionLabel(t("productConfirmation.overview.title"))}
    ${factTable(
      overview.map(({ label, lines }): [string, string] => [
        label,
        // A site name can be address-shaped, and every mail client linkifies
        // anything that looks like one — so a value off a row is defused as
        // well as escaped.
        lines.map((line) => defuseAutolinks(escapeHtml(line))).join("<br />"),
      ]),
    )}
  `;
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
  const { isSelfSeat, productType, mode, firstChargeDate } = options;
  if (mode === "waitlist") {
    return [
      t("productConfirmation.waitlist.next1"),
      isSelfSeat
        ? t(`productConfirmation.self.waitlist.next2.${productType}`)
        : t(`productConfirmation.waitlist.next2.${productType}`, {
            participantName: values.participantName,
          }),
      t("productConfirmation.waitlist.next3"),
    ];
  }

  const items = [
    isSelfSeat
      ? t("productConfirmation.next.placementSelf")
      : t("productConfirmation.next.placement", {
          participantName: values.participantName,
        }),
  ];
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
      isSelfSeat,
      productName,
      productType,
      mode,
      priceAmount,
      dashboardUrl,
    },
  } = content;

  // The enrolled keys throughout, with no waitlist branch: a waitlist join
  // composes no calendar object, so this function has already returned for it.
  const lines: string[] = [
    t("productConfirmation.heading"),
    "",
    isSelfSeat
      ? t(`productConfirmation.self.subheading.${productType}`, { productName })
      : t(`productConfirmation.subheading.${productType}`, { participantName, productName }),
    "",
    t("productConfirmation.summaryTitle"),
    `${t(`productConfirmation.typeLabel.${productType}`)}: ${productName}`,
    `${t(`productConfirmation.forLabel.${productType}`)}: ${participantName}`,
  ];

  const price = plainPriceLine(t, mode, priceAmount);
  if (price !== null) {
    lines.push(`${t("productConfirmation.priceLabel")}: ${price}`);
  }

  if (overview !== null) {
    lines.push("", t("productConfirmation.overview.title"));
    for (const { label, lines: values } of overview) {
      lines.push(`${label}: ${values.join(" — ")}`);
    }
  }

  lines.push(
    "",
    t("productConfirmation.nextTitle"),
    ...nextItems(t, content.options, {
      participantName,
      firstChargeDate: content.options.firstChargeDate ?? "",
    }).map((item) => `- ${item}`),
    "",
    `${t("productConfirmation.dashboardButton")}: ${dashboardUrl}`,
    "",
    t("productConfirmation.invite.attached"),
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

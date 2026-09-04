import { z } from "zod";
import { buildFeedbackEmail } from "./feedback";
import { buildPasswordResetEmail } from "./password-reset";
import { buildWelcomeParentEmail, buildWelcomeGeduEmail } from "./welcome";
import {
  buildProductConfirmationEmail,
  productConfirmationAttachments,
  productConfirmationSubject,
  productConfirmationText,
  resolveProductConfirmation,
  PRODUCT_CONFIRMATION_MODES,
  type ProductConfirmationEmailOptions,
} from "./product-confirmation";
import type { InvitationSlot } from "./product-confirmation-invitation";
import {
  fail,
  optionalDate,
  requireEmail,
  requireTime,
  requireWeekday,
  requireWholeNumber,
  textareaLines,
  FORM_YES_NO,
} from "./form-fields";
import { buildVerifyEmailEmail } from "./verify-email";
import { buildSeatOfferEmail, seatOfferSubject } from "./seat-offer";
import {
  buildSeatOfferStaffEmail,
  seatOfferStaffSubject,
  SEAT_OFFER_STAFF_REASONS,
} from "./seat-offer-staff";
import { buildComponentsReferenceEmail } from "./components-reference";
import {
  buildCalendarInvitationEmail,
  calendarExplorerAlarmOffsets,
  calendarInvitationAttachment,
  calendarInvitationSubject,
  calendarInvitationText,
  resolveCalendarInvitation,
  CALENDAR_EXPLORER_ALARM_ACTIONS,
  CALENDAR_EXPLORER_ALARM_ANCHORS,
  CALENDAR_EXPLORER_ALARM_OFFSETS,
  CALENDAR_EXPLORER_BODY,
  CALENDAR_EXPLORER_METHODS,
  CALENDAR_EXPLORER_PARTSTATS,
  CALENDAR_EXPLORER_RECURRENCES,
  CALENDAR_EXPLORER_ROLES,
  CALENDAR_EXPLORER_SHOW_AS,
  CALENDAR_EXPLORER_STATUSES,
  CALENDAR_EXPLORER_TIMEZONES,
  CALENDAR_EXPLORER_TIME_FORMS,
  CALENDAR_EXPLORER_TITLE,
  CALENDAR_EXPLORER_WEEKDAY_PRESETS,
  CALENDAR_EXPLORER_YES_NO,
  calendarInvitationStartDate,
  calendarInvitationUntilDate,
  type CalendarExplorerAlarmOffset,
  type CalendarExplorerWeekdayPreset,
} from "./calendar-invitation";
import {
  buildSessionReportEmail,
  sessionReportSubject,
  type SessionReportEmailOptions,
} from "./session-report";
import { SESSION_REPORT_SAMPLES } from "./fixtures/session-report-samples";
import {
  SESSION_REPORT_PHOTO_COUNTS,
  SESSION_REPORT_PHOTO_COUNT_LABELS,
  sessionReportPhotoFixtures,
} from "./fixtures/session-report-photos";
import type { EmailRenderContext } from "./render-context";
import type { RenderedAttachment } from "./attachments";
import type { EmailTranslator } from "./translator";
import { SUPPORTED_TIMEZONES } from "@/lib/calendar-invitations/ics-primitives";
import { DEFAULT_PRODUCT_TIMEZONE } from "@/lib/constants/location-hierarchies";
import { formatDate, formatTimeRange } from "@/lib/utils";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { Constants } from "@/types";

// --- Field types for the testing UI ---

/**
 * `type` is the discriminant of the field union, and a text field's is
 * `undefined` — declared, so the union narrows on `field.type` everywhere
 * rather than on whether the key happens to exist, which is what let a
 * "has a type" guard claim the select *and* anything added after it.
 */
interface TextField {
  key: string;
  label: string;
  placeholder: string;
  type?: undefined;
}

interface SelectField {
  key: string;
  label: string;
  type: "select";
  options: { label: string; value: string }[];
}

/**
 * A multi-line value — markdown, mostly. Unlike a text input, an untouched
 * textarea posts what it holds (empty included) rather than its placeholder,
 * so the placeholder is a hint and an empty value can mean "none".
 */
interface TextareaField {
  key: string;
  label: string;
  placeholder: string;
  type: "textarea";
}

export type TemplateField = TextField | SelectField | TextareaField;

// --- Template definition (shared by API route and testing UI) ---

/**
 * A validated param bag. Booleans are in the union because a template can carry
 * a variant flag (see `isSelfSeat`) that the testing UI expresses as a select
 * and the builders take as a boolean; the resolver in between is where the
 * widening happens.
 */
type TemplateParams = Record<string, string | boolean | null>;

export interface RenderedTemplate {
  subject: string;
  html: string;
  /**
   * The same mail as plain text, for the templates that state one.
   *
   * Optional because most mails have nothing to gain from it, and required in
   * practice for one: a mail carrying a calendar part is read by Exchange as
   * the source of the calendar entry's *notes*, and with no text part it
   * flattens the HTML into them. See this directory's `CLAUDE.md`.
   */
  text?: string;
  /** Reply-To this template's real sending route would set. */
  replyTo: string;
  /**
   * Files that travel with the mail. Absent for the templates that carry none,
   * which is all of them but one — an attachment changes how a client reads a
   * mail, so it is a property a template opts into rather than a slot every
   * render has to fill with an empty array.
   */
  attachments?: RenderedAttachment[];
}

export interface TemplateDefinition {
  /** Display label for the template dropdown in the testing UI. */
  label: string;
  /** Form fields rendered in the testing UI. */
  fields: TemplateField[];
  /** Zod schema for API-side param validation. */
  schema: z.ZodType<TemplateParams>;
  /**
   * Validate raw params against `schema`, then build the subject line, HTML
   * email content and Reply-To. Throws a ZodError when params are malformed.
   *
   * `context` says where the render is going, and defaults to the send — the
   * destination that has to be safe when a caller has not thought about it.
   */
  render: (
    rawParams: unknown,
    t: EmailTranslator,
    locale: string,
    context?: EmailRenderContext,
  ) => RenderedTemplate;
  /** Optional: transform UI field values into API params (e.g. a seat select → an `isSelfSeat` boolean). */
  resolveParams?: (params: Record<string, string>) => TemplateParams;
}

/**
 * Captures the correlation between a template's zod schema and its
 * `build`/`subject` callbacks: `params` is the schema's output type, so the
 * callbacks receive fully-typed params with no casts. The pairing of
 * parse + call lives inside the returned `render`, which is what keeps the
 * registry's heterogeneous record sound for dispatch sites.
 */
function defineTemplate<P extends TemplateParams>(entry: {
  label: string;
  fields: TemplateField[];
  schema: z.ZodType<P>;
  /**
   * Build the HTML email content from validated params. The context is there
   * for a template whose markup depends on where the render is going — one
   * does, and it is the fixture photographs, whose URLs are only fetchable
   * from a dev machine by the browser previewing them. A builder that does not
   * care simply declares three parameters and takes the fourth for free.
   */
  build: (params: P, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
  /**
   * Generate the email subject line from validated params and translator. The
   * locale is there for a subject that prints a formatted value of its own —
   * most subjects ignore it, as most ignore the context, which is passed for
   * the same reason `build` takes it: a subject derived from the same resolved
   * options has to resolve them the same way.
   */
  subject: (params: P, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
  /**
   * Reply-To for this template, defaulting to the support inbox — which is the
   * answer for every mail we send *to* a family. Only a template whose real
   * route replies to a person overrides it, and overriding is what makes a test
   * send reproduce the live behaviour instead of a plausible-looking stand-in.
   */
  replyTo?: (params: P) => string;
  /**
   * Files this mail carries, for the rare template whose content is not only
   * the body. Declared beside `build` rather than returned from it because the
   * two are different artifacts with different rules — the body is HTML a
   * client renders, an attachment is bytes a client *acts on* — and because a
   * builder that returned a pair would make every template that carries nothing
   * say so.
   */
  attachments?: (
    params: P,
    t: EmailTranslator,
    locale: string,
    context: EmailRenderContext,
  ) => RenderedAttachment[];
  /**
   * The plain-text body, for a template that states one. See
   * `RenderedTemplate` for why one template must.
   */
  text?: (
    params: P,
    t: EmailTranslator,
    locale: string,
    context: EmailRenderContext,
  ) => string | undefined;
  resolveParams?: TemplateDefinition["resolveParams"];
}): TemplateDefinition {
  // The validated params are the resolution: a template with nothing to derive
  // hands its own params to every part of the render.
  return defineResolvedTemplate({ ...entry, resolve: (params: P) => params });
}

/**
 * A template whose parts are built from something *derived* from the params,
 * resolved exactly once per render.
 *
 * **The once is the whole reason this exists.** With four callbacks each doing
 * their own derivation, a derivation that is not a pure function of the params
 * — one that mints an identifier, say — produces a different answer in each of
 * them, and the mail states one value while the file it carries states another.
 * Nothing about that is visible from any one callback, which is what made it
 * ship: each was correct on its own.
 *
 * Every template that has nothing to derive goes through the identity
 * resolution above rather than through a second code path, so there is one
 * render assembly and not two to keep in step.
 */
function defineResolvedTemplate<P extends TemplateParams, R>(entry: {
  label: string;
  fields: TemplateField[];
  schema: z.ZodType<P>;
  resolve: (params: P, t: EmailTranslator, locale: string, context: EmailRenderContext) => R;
  build: (resolved: R, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
  subject: (resolved: R, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
  /**
   * `undefined` is a real answer, not an omission: a template can owe a text
   * body only on the renders that carry a calendar part, and the signup
   * confirmation is exactly that — it attaches one when the product has a
   * schedule and sends the plain HTML mail when it does not.
   */
  text?: (
    resolved: R,
    t: EmailTranslator,
    locale: string,
    context: EmailRenderContext,
  ) => string | undefined;
  attachments?: (
    resolved: R,
    t: EmailTranslator,
    locale: string,
    context: EmailRenderContext,
  ) => RenderedAttachment[];
  replyTo?: (params: P) => string;
  resolveParams?: TemplateDefinition["resolveParams"];
}): TemplateDefinition {
  const { schema, resolve, build, subject, text, replyTo, attachments, ...rest } = entry;
  return {
    ...rest,
    schema,
    render: (rawParams, t, locale, context = { to: "send" }) => {
      const params = schema.parse(rawParams);
      const resolved = resolve(params, t, locale, context);
      const files = attachments?.(resolved, t, locale, context);
      const plain = text?.(resolved, t, locale, context);
      return {
        subject: subject(resolved, t, locale, context),
        html: build(resolved, t, locale, context),
        ...(plain !== undefined && { text: plain }),
        replyTo: replyTo?.(params) ?? SUPPORT_EMAIL,
        ...(files?.length && { attachments: files }),
      };
    },
  };
}

// --- Select options & resolvers ---

/**
 * Whose seat the mail is about.
 *
 * A select rather than a checkbox because the testing UI's fields are strings
 * and because the two options want naming: "the parent's own seat" is the case
 * a reader would otherwise have to infer from an unlabelled tick.
 */
const SEAT_OPTIONS = [
  { label: "A child's seat (third person)", value: "child" },
  { label: "The parent's own seat (second person)", value: "self" },
];

/**
 * Both derived from their source tuples rather than hand-listed, so a new
 * product type from codegen — or a new confirmation mode — shows up in the
 * testing form without anyone remembering to add it. The labels are the raw
 * values: this form is admin-only developer-facing tooling, and `consumer_club`
 * is the name the person testing this actually works with.
 */
const PRODUCT_TYPE_OPTIONS = Constants.public.Enums.product_type.map((value) => ({
  label: value,
  value,
}));

const PRODUCT_CONFIRMATION_MODE_OPTIONS = PRODUCT_CONFIRMATION_MODES.map((value) => ({
  label: value,
  value,
}));

/**
 * The topics, from codegen, raw. Only two of them ask a family to link a game
 * account, so this select is how the invitation's reminder sentence is reached
 * at all — and the labels are the enum values because this form is developer
 * tooling and `minecraft_java` is the name whoever is testing it works with.
 */
const PRODUCT_TOPIC_OPTIONS = Constants.public.Enums.product_topic.map((value) => ({
  label: value,
  value,
}));

/**
 * The zones a calendar document can be written in, default first.
 *
 * The product zones plus UTC, which is the calendar builder's own list — so a
 * test send cannot ask for a zone the document would carry an unexplained note
 * about. `DEFAULT_PRODUCT_TIMEZONE` leads because an untouched select posts its
 * first option and that is the zone the great majority of products carry.
 */
const INVITATION_TIMEZONE_OPTIONS = [
  DEFAULT_PRODUCT_TIMEZONE,
  ...SUPPORTED_TIMEZONES.filter((zone) => zone !== DEFAULT_PRODUCT_TIMEZONE),
].map((value) => ({ label: value, value }));

/**
 * The product-confirmation form's two derived values. The seat select becomes
 * the boolean the builder takes, defaulting to the child case — which is what an
 * unfilled field in the testing UI means, and what every seat was before
 * for-parents products existed. The price is cleared on the modes that state no
 * amount, so a test render of a free signup, a municipality registration or a
 * waitlist join carries no price at all, which is what the live mail carries.
 *
 * Everything the *invitation* needs stays a string here and is parsed by the
 * template's own resolver below: this function runs in the browser with no
 * translator and no clock, and a blank date means something the form cannot
 * decide on its own.
 */
function resolveProductConfirmationParams(params: Record<string, string>): TemplateParams {
  const { seat, priceAmount, ...rest } = params;
  const statesPrice = rest.mode === "subscription" || rest.mode === "upfront";
  return {
    ...rest,
    isSelfSeat: seat === "self",
    priceAmount: statesPrice ? priceAmount : null,
  };
}

/**
 * One typed schedule line: `mon 16:00 60` — a weekday, a start time, and how
 * many minutes the session runs.
 *
 * The same shape the explorer's override lines take, for the same reason: the
 * testing form's fields are single values, and a schedule is a list. A blank
 * textarea is a product with no slots, which is a real state and the one that
 * sends the plain mail with no invitation at all.
 */
function parseInvitationSlots(value: string): InvitationSlot[] {
  return textareaLines(value).map((line) => {
    const parts = line.split(/\s+/);
    if (parts.length !== 3) {
      fail("Schedule", "a weekday, a start time and a duration in minutes", line);
    }
    const [weekday, startTime, duration] = parts;
    return {
      weekday: requireWeekday(weekday, "Schedule"),
      startTime: requireTime(startTime, "Schedule"),
      durationMinutes: requireWholeNumber(duration, "Schedule duration", 1),
    };
  });
}

/**
 * The form's strings as the options the mail is built from, resolved once.
 *
 * `now` is the resolver's own — the live sends read the clock at the moment
 * they compose, and so does a test send, because which occurrence a `DTSTART`
 * lands on is a fact about when the mail was written. The composer itself never
 * reads a clock; this is the one place the value enters.
 */
function resolveProductConfirmationOptions(
  params: ProductConfirmationParams,
  now: Date,
): ProductConfirmationEmailOptions {
  return {
    participantName: params.participantName,
    isSelfSeat: params.isSelfSeat,
    productName: params.productName,
    productType: params.productType,
    mode: params.mode,
    priceAmount: params.priceAmount,
    dashboardUrl: params.dashboardUrl,
    invitation: {
      // Minted when the form names none, exactly as the explorer mints a UID:
      // the identifier is a function of the seat, and a test send has no seat.
      participationId:
        params.participationId.trim() === ""
          ? crypto.randomUUID()
          : params.participationId.trim(),
      participantName: params.participantName,
      isSelfSeat: params.isSelfSeat,
      productName: params.productName,
      productType: params.productType,
      productTopic: params.topic,
      shortDescription: params.shortDescription.trim() || null,
      timezone: params.timezone,
      startDate: optionalDate(params.startDate, "Start date"),
      endDate: optionalDate(params.endDate, "End date"),
      slots: parseInvitationSlots(params.slots),
      isRemote: params.isRemote === "yes",
      siteName: params.siteName.trim() || null,
      siteAddress: params.siteAddress.trim() || null,
      siteNote: params.siteNote.trim() || null,
      attendeeName: params.attendeeName,
      attendeeEmail: requireEmail(params.attendeeEmail, "Attendee email"),
      // The same link the mail's own button carries: the entry points a parent
      // at My SOG, which resolves for every seat, rather than at a seat page
      // that needs a group the seat may not have yet.
      dashboardUrl: params.dashboardUrl,
      now,
    },
  };
}

/**
 * The session-report form picks which of the send's two mails to render, one of
 * the bundled sample reports, a zone to stand in for the parent's, and may
 * paste a markdown body over the sample.
 * Testing plumbing, not the live send: `POST /api/gedu/sessions/email-report`
 * reads a real session row and formats in the product's zone, so here the
 * fixture stands in for that row and the select stands in for that zone. The instants are formatted for the
 * chosen locale in the chosen zone with the zone always named — a mail is
 * rendered without the reader's own zone, so the live send formats in the
 * product's zone and names it; the select is here to see what each locale
 * calls a zone.
 *
 * The `sample` is posted as an id and resolved here rather than in
 * `resolveParams`, because the formatting needs the locale and the resolver
 * runs in the browser without one.
 */
const SESSION_REPORT_SAMPLE_OPTIONS = SESSION_REPORT_SAMPLES.map((sample) => ({
  label: sample.label,
  value: sample.id,
}));

/**
 * Zones to format the mail in. A live send uses the product's own zone, which
 * an admin now picks per product — so the first entry is labelled as the
 * default that zone starts at rather than as "the product's zone", which was
 * true only while every product was pinned to Helsinki.
 */
const VIEWER_TIMEZONE_OPTIONS = [
  { label: "Europe/Helsinki (the default product zone)", value: "Europe/Helsinki" },
  { label: "Europe/Stockholm", value: "Europe/Stockholm" },
  { label: "Europe/London", value: "Europe/London" },
  { label: "Europe/Paris", value: "Europe/Paris" },
  { label: "America/New_York", value: "America/New_York" },
];

/**
 * Which of the two mails one send produces. The live route sends both — a
 * family's, and one copy to the sender with the admins in CC — and they differ
 * in three places, none of which is visible unless the testing UI can ask for
 * the other mail: the copy opens with the staff banner, it carries the GROUP's
 * name where a family's mail carries the child's (so the intro reads as a
 * record of what the group was sent), and its button points at the sender's own
 * workspace rather than at a family's enrollment page.
 *
 * The first two follow this select. The third stays the tester's to type: the
 * `productUrl` field is a family-page link, and a workspace URL cannot be
 * derived here — the live route picks between the gedu workspace and the admin
 * product page from the sender's role, which this form has no notion of. Change
 * it by hand when the link is what you are checking.
 */
const SESSION_REPORT_COPIES = ["family", "staff"] as const;

const SESSION_REPORT_COPY_LABELS: Record<(typeof SESSION_REPORT_COPIES)[number], string> = {
  family: "The family mail (what a parent receives)",
  staff: "The Gedu and Admin copy (sender, admins in CC)",
};

const SESSION_REPORT_COPY_OPTIONS = SESSION_REPORT_COPIES.map((value) => ({
  label: SESSION_REPORT_COPY_LABELS[value],
  value,
}));

/**
 * How many demo photos to hang on the fixture session.
 *
 * A count rather than a picker: what is worth looking at here is the grid —
 * how a pair sits at a desktop width, what an odd one does with the row it has
 * to itself, and what all of it reserves when a client blocks every image —
 * and which particular screenshots fill it makes no difference to any of that.
 * The order the fixtures come in is chosen so a small count is already mixed.
 */
const SESSION_REPORT_PHOTO_OPTIONS = SESSION_REPORT_PHOTO_COUNTS.map((value) => ({
  label: SESSION_REPORT_PHOTO_COUNT_LABELS[value],
  value,
}));

function resolveSessionReport(
  {
    sample: sampleId,
    viewerTimezone,
    reportMarkdown,
    copy,
    photoCount,
    ...rest
  }: SessionReportParams,
  locale: string,
  context: EmailRenderContext,
): SessionReportEmailOptions {
  const sample =
    SESSION_REPORT_SAMPLES.find((candidate) => candidate.id === sampleId) ??
    SESSION_REPORT_SAMPLES[0];
  const staffCopy = copy === "staff";
  return {
    ...rest,
    // The group's name in the child's slot, as the live send does it — the copy
    // is a record of what the group was mailed, not one child's report.
    gamerName: staffCopy ? rest.groupName : rest.gamerName,
    staffCopy,
    sessionDate: formatDate(sample.startsAt, locale, {
      timeZone: viewerTimezone,
      dateStyle: "full",
    }),
    sessionTime: formatTimeRange(sample.startsAt, sample.endsAt, locale, viewerTimezone),
    reportMarkdown: reportMarkdown.trim() === "" ? sample.markdown : reportMarkdown,
    photos: sessionReportPhotoFixtures(Number(photoCount), context),
  };
}

// --- Zod schemas ---

const passwordResetParamsSchema = z.object({
  resetLink: z.string().url(),
});

const feedbackParamsSchema = z.object({
  userName: z.string().min(1),
  userRole: z.enum(Constants.public.Enums.user_role),
  userEmail: z.string().email(),
  message: z.string().min(1),
});

const welcomeParentParamsSchema = z.object({
  firstName: z.string().min(1),
  verificationUrl: z.string().url(),
  dashboardUrl: z.string().url(),
  shopUrl: z.string().url(),
  settingsUrl: z.string().url(),
});

const welcomeGeduParamsSchema = z.object({
  firstName: z.string().min(1),
  verificationUrl: z.string().url(),
  dashboardUrl: z.string().url(),
  settingsUrl: z.string().url(),
});

/**
 * `priceAmount` is nullable rather than required-per-mode, and that is a
 * deliberate flattening: a discriminated union would encode "subscription
 * implies an amount" in the schema, at the cost of a params type the registry's
 * single param-bag shape can no longer hold. The builder makes the same
 * guarantee where it matters — a paid mode with no amount prints no price line
 * rather than an empty one.
 */
const productConfirmationParamsSchema = z.object({
  participantName: z.string().min(1),
  isSelfSeat: z.boolean(),
  productName: z.string().min(1),
  productType: z.enum(Constants.public.Enums.product_type),
  mode: z.enum(PRODUCT_CONFIRMATION_MODES),
  priceAmount: z.string().nullable(),
  dashboardUrl: z.string().url(),

  // --- What the calendar invitation is composed from. ---
  //
  // Bare strings, like the explorer's, and parsed by the template's own
  // resolver rather than here: that is where a blank means "omit" and where a
  // malformed date earns a sentence naming the field. Duplicating the shapes as
  // regexes would give one mistake two different messages depending on which
  // layer caught it first.
  participationId: z.string(),
  attendeeName: z.string().min(1),
  attendeeEmail: z.string(),
  topic: z.enum(Constants.public.Enums.product_topic),
  shortDescription: z.string(),
  timezone: z.string().refine((zone) => SUPPORTED_TIMEZONES.includes(zone), {
    message: "no VTIMEZONE is written for this zone",
  }),
  startDate: z.string(),
  endDate: z.string(),
  slots: z.string(),
  isRemote: z.enum(FORM_YES_NO),
  siteName: z.string(),
  siteAddress: z.string(),
  siteNote: z.string(),
});

type ProductConfirmationParams = z.infer<typeof productConfirmationParamsSchema>;

const verifyEmailParamsSchema = z.object({
  firstName: z.string().min(1),
  verificationUrl: z.string().url(),
});

/**
 * The deadline arrives already formatted, like every other locale-aware value a
 * builder takes: the live send has the product row and the recipient's locale
 * and does the formatting once. Here the tester types it, which is the point —
 * the thing worth checking about this mail is how a long absolute date sits in
 * the callout beside two half-width buttons, in each locale.
 */
const seatOfferParamsSchema = z.object({
  participantName: z.string().min(1),
  isSelfSeat: z.boolean(),
  productName: z.string().min(1),
  deadline: z.string().min(1),
  acceptUrl: z.string().url(),
  declineUrl: z.string().url(),
  dashboardUrl: z.string().url(),
});

const seatOfferStaffParamsSchema = z.object({
  reason: z.enum(SEAT_OFFER_STAFF_REASONS),
  participantName: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  productName: z.string().min(1),
  /** Empty means "this product has no schedule", which drops the row. */
  productSchedule: z.string().nullable(),
  offeredAt: z.string().min(1),
  adminProductUrl: z.string().url(),
});

/** The seat select, reused from the product-confirmation form's vocabulary. */
function resolveSeatOffer(params: Record<string, string>): TemplateParams {
  const { seat, ...rest } = params;
  return { ...rest, isSelfSeat: seat === "self" };
}

/** An untouched text field posts its placeholder, so "none" has to be typed. */
function resolveSeatOfferStaff(params: Record<string, string>): TemplateParams {
  const { productSchedule, ...rest } = params;
  return { ...rest, productSchedule: productSchedule.trim() || null };
}

const SEAT_OFFER_STAFF_REASON_LABELS: Record<
  (typeof SEAT_OFFER_STAFF_REASONS)[number],
  string
> = {
  declined: "The family said no",
  no_response: "The window ran out with no answer",
};

const SEAT_OFFER_STAFF_REASON_OPTIONS = SEAT_OFFER_STAFF_REASONS.map((value) => ({
  label: SEAT_OFFER_STAFF_REASON_LABELS[value],
  value,
}));

const sessionReportParamsSchema = z.object({
  gamerName: z.string().min(1),
  geduName: z.string().min(1),
  productName: z.string().min(1),
  groupName: z.string().min(1),
  sample: z
    .string()
    .refine((id) => SESSION_REPORT_SAMPLES.some((sample) => sample.id === id), {
      message: "unknown sample report",
    }),
  viewerTimezone: z
    .string()
    .refine((zone) => VIEWER_TIMEZONE_OPTIONS.some((option) => option.value === zone), {
      message: "unknown viewer timezone",
    }),
  /** Empty means "use the sample's own markdown". */
  reportMarkdown: z.string(),
  productUrl: z.string().url(),
  /**
   * Required rather than defaulted: a schema whose parsed output differs from
   * its input no longer satisfies the registry's `ZodType<P>`, and the testing
   * form posts an untouched select's first option anyway, so nothing that
   * reaches this schema through the UI can omit it.
   */
  copy: z.enum(SESSION_REPORT_COPIES),
  /** How many demo photos to attach. Required for the same reason `copy` is. */
  photoCount: z.enum(SESSION_REPORT_PHOTO_COUNTS),
});

type SessionReportParams = z.infer<typeof sessionReportParamsSchema>;

// --- Calendar invite explorer: options, placeholders and schema ---

/**
 * A select whose values are already the tokens the document writes.
 *
 * `ROLE` and `PARTSTAT` are read straight off the calendar file, so the raw
 * value is the clearest possible label: the person picking one is about to go
 * looking for that exact string in the document beneath the form.
 */
function literalOptions(values: readonly string[]): { label: string; value: string }[] {
  return values.map((value) => ({ label: value, value }));
}

/**
 * A yes/no select with `first` as its default, because an untouched select
 * posts its first option — so the order *is* the default, and these four fields
 * do not all default the same way.
 */
function yesNoOptions(
  first: (typeof CALENDAR_EXPLORER_YES_NO)[number],
): { label: string; value: string }[] {
  const rest = CALENDAR_EXPLORER_YES_NO.filter((value) => value !== first);
  return [first, ...rest].map((value) => ({
    label: value === "yes" ? "Yes" : "No",
    value,
  }));
}

const CALENDAR_EXPLORER_METHOD_LABELS: Record<
  (typeof CALENDAR_EXPLORER_METHODS)[number],
  string
> = {
  request: "REQUEST — asks the reader to answer",
  publish: "PUBLISH — states the entry, asks nothing",
  cancel: "CANCEL — withdraws the entry",
};

const CALENDAR_EXPLORER_STATUS_LABELS: Record<
  (typeof CALENDAR_EXPLORER_STATUSES)[number],
  string
> = {
  confirmed: "CONFIRMED",
  tentative: "TENTATIVE",
  cancelled: "CANCELLED",
};

const CALENDAR_EXPLORER_TIME_FORM_LABELS: Record<
  (typeof CALENDAR_EXPLORER_TIME_FORMS)[number],
  string
> = {
  tzid: "Wall clock under a TZID — promises a clock face",
  utc: "Absolute instant (…Z) — promises a moment",
};

const CALENDAR_EXPLORER_RECURRENCE_LABELS: Record<
  (typeof CALENDAR_EXPLORER_RECURRENCES)[number],
  string
> = {
  none: "None — a single occurrence",
  weekly: "Weekly rule (RRULE)",
};

const CALENDAR_EXPLORER_WEEKDAY_LABELS: Record<CalendarExplorerWeekdayPreset, string> = {
  mon: "MO",
  tue: "TU",
  wed: "WE",
  thu: "TH",
  fri: "FR",
  sat: "SA",
  sun: "SU",
  "mon-wed-fri": "MO,WE,FR",
  "tue-thu": "TU,TH",
  "mon-fri": "MO,TU,WE,TH,FR",
  "sat-sun": "SA,SU",
  "every-day": "Every day",
};

const CALENDAR_EXPLORER_ALARM_OFFSET_LABELS: Record<CalendarExplorerAlarmOffset, string> = {
  none: "No alarm",
  "0": "On the trigger point (0 minutes)",
  "5": "5 minutes before",
  "15": "15 minutes before",
  "30": "30 minutes before",
  "60": "60 minutes before (an hour)",
  "120": "120 minutes before (two hours)",
  "1440": "1440 minutes before (a day)",
  "2880": "2880 minutes before (two days)",
};

const CALENDAR_EXPLORER_ALARM_ACTION_LABELS: Record<
  (typeof CALENDAR_EXPLORER_ALARM_ACTIONS)[number],
  string
> = {
  display: "DISPLAY",
  email: "EMAIL — carries a SUMMARY and an ATTENDEE",
  audio: "AUDIO",
};

const CALENDAR_EXPLORER_ALARM_ANCHOR_LABELS: Record<
  (typeof CALENDAR_EXPLORER_ALARM_ANCHORS)[number],
  string
> = {
  start: "Before the start",
  end: "Before the end (RELATED=END)",
};

const CALENDAR_EXPLORER_SHOW_AS_LABELS: Record<
  (typeof CALENDAR_EXPLORER_SHOW_AS)[number],
  string
> = {
  free: "TRANSPARENT — does not block the reader's time",
  busy: "OPAQUE — blocks it",
};

/**
 * One alarm's three selects, built the same way for all three alarms.
 *
 * The alarms are the one place the three clients are *known* to disagree and
 * are kept anyway — Apple keeps what the organiser sent, Google replaces it
 * with the reader's own defaults, Exchange keeps the first and drops the rest —
 * because watching that happen is the point rather than a disqualification.
 */
function alarmFields(
  index: 1 | 2 | 3,
  defaultOffset: CalendarExplorerAlarmOffset,
): TemplateField[] {
  return [
    {
      key: `alert${index}Offset`,
      label: `Alerts – Alarm ${index} offset`,
      type: "select",
      options: calendarExplorerAlarmOffsets(defaultOffset).map((value) => ({
        label: CALENDAR_EXPLORER_ALARM_OFFSET_LABELS[value],
        value,
      })),
    },
    {
      key: `alert${index}Action`,
      label: `Alerts – Alarm ${index} ACTION`,
      type: "select",
      options: CALENDAR_EXPLORER_ALARM_ACTIONS.map((value) => ({
        label: CALENDAR_EXPLORER_ALARM_ACTION_LABELS[value],
        value,
      })),
    },
    {
      key: `alert${index}RelativeTo`,
      label: `Alerts – Alarm ${index} TRIGGER relative to`,
      type: "select",
      options: CALENDAR_EXPLORER_ALARM_ANCHORS.map((value) => ({
        label: CALENDAR_EXPLORER_ALARM_ANCHOR_LABELS[value],
        value,
      })),
    },
  ];
}

/**
 * The explorer's form, grouped by what part of the document a field lands in.
 *
 * The page renders fields in the order this array gives them and has no notion
 * of a group, so the group is carried in the label's own prefix — which is
 * enough, because the fields of one group are adjacent and a reader scanning a
 * column of labels is looking for the prefix rather than for a heading.
 *
 * **A text field with no placeholder is a field whose default is "omit".** An
 * untouched text input posts its placeholder, so a blank placeholder is the
 * only way a text field can default to absent — and the label says what it
 * would write if it were filled in.
 *
 * **Every field is a property all three target clients honour.** Google
 * Calendar, Apple Calendar and Outlook are the whole audience, and a knob one
 * of them drops teaches nothing but its own absence — so this list is shorter
 * than the format is, on purpose.
 */
const CALENDAR_EXPLORER_FIELDS: TemplateField[] = [
  { key: "subject", label: "Mail – Subject", placeholder: CALENDAR_EXPLORER_TITLE },
  {
    key: "body",
    label: "Mail – Body (empty sends the neutral default)",
    type: "textarea",
    placeholder: CALENDAR_EXPLORER_BODY,
  },

  {
    key: "uid",
    label: "Identity – UID (empty mints one per render; type one back for an update)",
    placeholder: "",
  },
  { key: "sequence", label: "Identity – SEQUENCE", placeholder: "0" },
  {
    key: "method",
    label: "Identity – METHOD",
    type: "select",
    options: CALENDAR_EXPLORER_METHODS.map((value) => ({
      label: CALENDAR_EXPLORER_METHOD_LABELS[value],
      value,
    })),
  },
  {
    key: "status",
    label: "Identity – STATUS",
    type: "select",
    options: CALENDAR_EXPLORER_STATUSES.map((value) => ({
      label: CALENDAR_EXPLORER_STATUS_LABELS[value],
      value,
    })),
  },

  {
    key: "timezone",
    label: "Time – TZID (each of these ships its own VTIMEZONE; UTC ships none)",
    type: "select",
    options: literalOptions(CALENDAR_EXPLORER_TIMEZONES),
  },
  {
    key: "startDate",
    label: "Time – DTSTART date",
    // A getter, so the date is read when the field is read rather than when
    // this module loads: the same registry is imported by the admin page and by
    // the send route, and a value frozen at load would differ between the
    // server's render and the browser's hydration of it.
    get placeholder() {
      return calendarInvitationStartDate();
    },
  },
  { key: "startTime", label: "Time – DTSTART time", placeholder: "16:00" },
  { key: "durationMinutes", label: "Time – DURATION (minutes)", placeholder: "120" },
  {
    key: "timeForm",
    label: "Time – How the times are written",
    type: "select",
    options: CALENDAR_EXPLORER_TIME_FORMS.map((value) => ({
      label: CALENDAR_EXPLORER_TIME_FORM_LABELS[value],
      value,
    })),
  },
  {
    key: "allDay",
    label: "Time – All day (DATE-valued DTSTART and DTEND, no zone at all)",
    type: "select",
    options: yesNoOptions("no"),
  },

  {
    key: "recurrence",
    label: "Recurrence – Shape",
    type: "select",
    options: CALENDAR_EXPLORER_RECURRENCES.map((value) => ({
      label: CALENDAR_EXPLORER_RECURRENCE_LABELS[value],
      value,
    })),
  },
  {
    key: "weekdays",
    label: "Recurrence – BYDAY",
    type: "select",
    options: CALENDAR_EXPLORER_WEEKDAY_PRESETS.map((value) => ({
      label: CALENDAR_EXPLORER_WEEKDAY_LABELS[value],
      value,
    })),
  },
  { key: "until", label: "Recurrence – UNTIL date (empty for none)", placeholder: "" },
  {
    key: "count",
    // RFC 5545 forbids stating both, so one has to win, and it is this one: a
    // reader who typed a number of occurrences meant that number.
    label: "Recurrence – COUNT (empty for none; wins over UNTIL when both are set)",
    placeholder: "",
  },
  { key: "interval", label: "Recurrence – INTERVAL (weeks)", placeholder: "1" },
  {
    key: "excludedDates",
    label: "Recurrence – EXDATE, one YYYY-MM-DD per line (written at the start time)",
    type: "textarea",
    // Read-time, for the reason the start date's own getter states.
    get placeholder() {
      return calendarInvitationUntilDate();
    },
  },
  {
    key: "overrides",
    // The mechanism a mixed-time product needs and the one a single moved
    // session needs are the same: an occurrence that happens at another clock
    // face becomes its own VEVENT under the same UID, naming the occurrence it
    // replaces. A rule states one clock face, so a club that meets Monday at
    // 16:00 and Wednesday at 14:00 cannot be stated without this.
    label:
      "Recurrence – Overrides, one YYYY-MM-DD HH:MM [minutes] per line (the weekly rule only)",
    type: "textarea",
    // Read-time, for the reason the start date's own getter states.
    get placeholder() {
      return `${calendarInvitationUntilDate()} 14:00 90`;
    },
  },

  { key: "organizerName", label: "People – ORGANIZER name", placeholder: SENDER_NAME },
  { key: "organizerEmail", label: "People – ORGANIZER email", placeholder: SENDER_EMAIL },
  { key: "attendeeName", label: "People – ATTENDEE name", placeholder: "Attendee" },
  {
    key: "attendeeEmail",
    // A client decides whether to show the RSVP by matching the attendee
    // against the mailbox it is reading, so a send whose attendee is somebody
    // else renders as somebody else's invitation.
    label: "People – ATTENDEE email (use the address you send to)",
    placeholder: "attendee@example.com",
  },
  { key: "rsvp", label: "People – RSVP", type: "select", options: yesNoOptions("yes") },
  {
    key: "attendeeRole",
    label: "People – ROLE",
    type: "select",
    options: literalOptions(CALENDAR_EXPLORER_ROLES),
  },
  {
    key: "partstat",
    label: "People – PARTSTAT",
    type: "select",
    options: literalOptions(CALENDAR_EXPLORER_PARTSTATS),
  },
  {
    key: "includeAttendee",
    label: "People – Write an ATTENDEE at all (a PUBLISH normally does not)",
    type: "select",
    options: yesNoOptions("yes"),
  },

  { key: "summary", label: "Content – SUMMARY", placeholder: CALENDAR_EXPLORER_TITLE },
  {
    key: "description",
    label: "Content – DESCRIPTION (empty omits it)",
    type: "textarea",
    placeholder: "A baseline invitation. Change one field, send it again, and compare.",
  },
  { key: "location", label: "Content – LOCATION (empty omits it)", placeholder: "Helsinki, Finland" },
  { key: "url", label: "Content – URL (empty omits it)", placeholder: "" },

  // Three alarms, because the order they are written in is a real property: an
  // Exchange mailbox keeps exactly one per item and keeps the first.
  ...alarmFields(1, "15"),
  ...alarmFields(2, "1440"),
  ...alarmFields(3, "none"),

  {
    key: "showAs",
    label: "Behaviour – TRANSP",
    type: "select",
    options: CALENDAR_EXPLORER_SHOW_AS.map((value) => ({
      label: CALENDAR_EXPLORER_SHOW_AS_LABELS[value],
      value,
    })),
  },
];

/**
 * The wire shape, and only the wire shape.
 *
 * Every free-form field is a bare string here and is parsed by the template's
 * own resolver, which is where a blank means "omit" and where a malformed date
 * earns a sentence naming the field. Duplicating the shapes as regexes would
 * give the same mistake two different error messages depending on which layer
 * caught it first.
 */
const calendarInvitationParamsSchema = z.object({
  subject: z.string().min(1),
  body: z.string(),

  uid: z.string(),
  sequence: z.string(),
  method: z.enum(CALENDAR_EXPLORER_METHODS),
  status: z.enum(CALENDAR_EXPLORER_STATUSES),

  timezone: z
    .string()
    .refine((zone) => CALENDAR_EXPLORER_TIMEZONES.includes(zone), {
      message: "no VTIMEZONE is written for this zone",
    }),
  startDate: z.string(),
  startTime: z.string(),
  durationMinutes: z.string(),
  timeForm: z.enum(CALENDAR_EXPLORER_TIME_FORMS),
  allDay: z.enum(CALENDAR_EXPLORER_YES_NO),

  recurrence: z.enum(CALENDAR_EXPLORER_RECURRENCES),
  weekdays: z.enum(CALENDAR_EXPLORER_WEEKDAY_PRESETS),
  until: z.string(),
  count: z.string(),
  interval: z.string(),
  excludedDates: z.string(),
  overrides: z.string(),

  organizerName: z.string().min(1),
  organizerEmail: z.string(),
  attendeeName: z.string().min(1),
  attendeeEmail: z.string(),
  rsvp: z.enum(CALENDAR_EXPLORER_YES_NO),
  attendeeRole: z.enum(CALENDAR_EXPLORER_ROLES),
  partstat: z.enum(CALENDAR_EXPLORER_PARTSTATS),
  includeAttendee: z.enum(CALENDAR_EXPLORER_YES_NO),

  // Whitespace is refused as well as emptiness, because the two arrive at the
  // same place: `SUMMARY` is the only line a client has to name the entry by,
  // and a value of three spaces writes one every calendar shows as untitled.
  summary: z.string().refine((value) => value.trim() !== "", {
    message: "a SUMMARY of nothing but whitespace writes an entry no client can name",
  }),
  description: z.string(),
  location: z.string(),
  url: z.string(),

  alert1Offset: z.enum(CALENDAR_EXPLORER_ALARM_OFFSETS),
  alert1Action: z.enum(CALENDAR_EXPLORER_ALARM_ACTIONS),
  alert1RelativeTo: z.enum(CALENDAR_EXPLORER_ALARM_ANCHORS),
  alert2Offset: z.enum(CALENDAR_EXPLORER_ALARM_OFFSETS),
  alert2Action: z.enum(CALENDAR_EXPLORER_ALARM_ACTIONS),
  alert2RelativeTo: z.enum(CALENDAR_EXPLORER_ALARM_ANCHORS),
  alert3Offset: z.enum(CALENDAR_EXPLORER_ALARM_OFFSETS),
  alert3Action: z.enum(CALENDAR_EXPLORER_ALARM_ACTIONS),
  alert3RelativeTo: z.enum(CALENDAR_EXPLORER_ALARM_ANCHORS),

  showAs: z.enum(CALENDAR_EXPLORER_SHOW_AS),
});

// --- Single source of truth for all email templates ---

export const templateRegistry: Record<string, TemplateDefinition> = {
  /**
   * The reference every other entry in this registry is measured against —
   * `/admin/ui-components` for mail. It is first in the list because that is
   * what it is for: whoever opens this page to test a template should meet the
   * house style before they meet their own mail.
   *
   * **The one entry that takes no params at all**: a specimen sheet has nothing
   * to be told, so the form under it is empty and the fixture that renders it
   * is `{}`. Its copy is literal English rather than translated, which is the
   * call `fixtures/` makes too — developer-facing instrumentation whose strings
   * are component names and hex values (see the builder). The calendar explorer
   * is untranslated for the opposite reason: it has no copy of its own to
   * translate, because both of its strings are typed into the form.
   *
   * A registry entry rather than a page because it has to be *sent* to be worth
   * anything — a reference for email that can only be viewed in a browser is
   * describing a rendering nobody receives.
   */
  componentsReference: defineTemplate({
    label: "Email components (reference)",
    fields: [],
    schema: z.object({}),
    build: (_p, _t, locale) => buildComponentsReferenceEmail(locale),
    subject: () => "Email components",
  }),
  passwordReset: defineTemplate({
    label: "Password Reset",
    fields: [
      { key: "resetLink", label: "Reset Link", placeholder: "https://sogverse.sog.gg/api/auth/callback?next=/reset-password&code=abc123" },
    ],
    schema: passwordResetParamsSchema,
    build: (p, t, locale) => buildPasswordResetEmail(t, p.resetLink, locale),
    subject: (_p, t) => t("passwordReset.subject"),
  }),
  // The registry key stays `feedback` — it is the API's template identifier and
  // renaming it would break every caller for a word only we read. The label is
  // what an admin picks from, so that is where the form's real name goes.
  feedback: defineTemplate({
    label: "Help & Feedback",
    fields: [
      { key: "userName", label: "User Name", placeholder: "Marja Virtanen" },
      {
        key: "userRole",
        label: "User Role",
        type: "select",
        options: [
          { label: "Customer", value: "customer" },
          { label: "Gamer", value: "gamer" },
          { label: "Gedu", value: "gedu" },
          { label: "Admin", value: "admin" },
        ],
      },
      { key: "userEmail", label: "User Email", placeholder: "marja@example.com" },
      // An untouched text input posts its placeholder, so this is what a test
      // send actually carries — a help request rather than a compliment, since
      // that is the half of the form the mail's copy was rewritten for.
      { key: "message", label: "Message", placeholder: "How do I move my child to a different club?" },
    ],
    schema: feedbackParamsSchema,
    build: (p, t, locale) => buildFeedbackEmail(t, locale, {
      ...p,
      sentAt: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    }),
    subject: (p, t) => t("feedback.subject", { displayName: p.userName, role: t(ROLE_LABEL_KEYS[p.userRole]) }),
    // The live route resolves the reply-to first and passes it in as
    // `userEmail` (a gamer's resolves to their linked parent's), so this param
    // already *is* the address the real mail replies to.
    replyTo: (p) => p.userEmail,
  }),
  welcomeParent: defineTemplate({
    label: "Welcome (Parent)",
    fields: [
      { key: "firstName", label: "First Name", placeholder: "Jane" },
      { key: "verificationUrl", label: "Verification URL", placeholder: "https://sogverse.sog.gg/verify-email?token=abc123" },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/parent" },
      { key: "shopUrl", label: "Shop URL", placeholder: "https://sogverse.sog.gg/shop" },
      { key: "settingsUrl", label: "Settings URL", placeholder: "https://sogverse.sog.gg/settings" },
    ],
    schema: welcomeParentParamsSchema,
    build: (p, t, locale) => buildWelcomeParentEmail(t, locale, p),
    subject: (_p, t) => t("welcomeParent.subject"),
  }),
  welcomeGedu: defineTemplate({
    label: "Welcome (Gedu)",
    fields: [
      { key: "firstName", label: "First Name", placeholder: "Alice" },
      { key: "verificationUrl", label: "Verification URL", placeholder: "https://sogverse.sog.gg/verify-email?token=abc123" },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/gedu" },
      { key: "settingsUrl", label: "Settings URL", placeholder: "https://sogverse.sog.gg/settings" },
    ],
    schema: welcomeGeduParamsSchema,
    build: (p, t, locale) => buildWelcomeGeduEmail(t, locale, p),
    subject: (_p, t) => t("welcomeGedu.subject"),
  }),
  /**
   * The signup mail — and the second template in this registry that carries a
   * file.
   *
   * **Its fields are two forms in one, and the split is worth reading.** The
   * first seven describe the *signup*: who took a seat, on what, and what it
   * cost. The rest describe the *product's schedule*, because that is what the
   * attached `invite.ics` is composed from — a live send reads every one of
   * them off the product row, and here they are typed so the document can be
   * previewed and sent without a product existing.
   *
   * **An empty schedule is a real state, not an unfilled form.** A textarea
   * posts what it holds, so an untouched one is a product with no slots — and
   * the mail that produces is exactly the mail this template sent before the
   * invitation existed: no session-times section, no attachment, no text body.
   * Type a line or two into the schedule field to see the other one.
   */
  productConfirmation: defineResolvedTemplate({
    label: "Product Confirmation",
    fields: [
      { key: "participantName", label: "Participant Name", placeholder: "Aino" },
      { key: "seat", label: "Whose seat", type: "select", options: SEAT_OPTIONS },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "productType", label: "Product Type", type: "select", options: PRODUCT_TYPE_OPTIONS },
      { key: "mode", label: "Outcome", type: "select", options: PRODUCT_CONFIRMATION_MODE_OPTIONS },
      { key: "priceAmount", label: "Formatted Price", placeholder: "€40.00" },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/parent" },

      {
        key: "slots",
        label:
          "Invite – Schedule, one `mon 16:00 60` per line (empty sends the mail with no invitation)",
        type: "textarea",
        placeholder: "mon 16:00 60\nwed 16:00 60",
      },
      {
        key: "timezone",
        label: "Invite – The product's own timezone",
        type: "select",
        options: INVITATION_TIMEZONE_OPTIONS,
      },
      {
        key: "startDate",
        label: "Invite – Product start date",
        // A getter, so the suggestion is read when the field is read rather
        // than when this module loads: the registry is imported by the admin
        // page and by the send route, and a value frozen at load would differ
        // between the server's render and the browser's hydration of it. A
        // start date in the past would also compose an invitation with nothing
        // ahead of it, which is not the document worth looking at.
        get placeholder() {
          return calendarInvitationStartDate();
        },
      },
      {
        key: "endDate",
        label: "Invite – Product end date (empty for an open-ended club)",
        get placeholder() {
          return calendarInvitationUntilDate();
        },
      },
      {
        key: "isRemote",
        label: "Invite – Runs online",
        type: "select",
        // "No" first, so the untouched form composes the in-person document —
        // the one with a site, an address and a note in it, which is the case
        // with more to look at.
        options: yesNoOptions("no"),
      },
      { key: "siteName", label: "Invite – Site name", placeholder: "Kallion kirjasto" },
      {
        key: "siteAddress",
        label: "Invite – Site address (empty for none)",
        placeholder: "Viides linja 11, 00530 Helsinki",
      },
      {
        key: "siteNote",
        label: "Invite – Public site note (empty for none)",
        type: "textarea",
        placeholder: "The door on the north side. Ring the bell marked School of Gaming.",
      },
      {
        key: "topic",
        label: "Invite – Topic (two of them ask for a linked game account)",
        type: "select",
        options: PRODUCT_TOPIC_OPTIONS,
      },
      {
        key: "shortDescription",
        label: "Invite – The product's short description (empty for none)",
        type: "textarea",
        placeholder: "Build, explore and survive together in a private world.",
      },
      {
        key: "participationId",
        label: "Invite – Participation id (empty mints one per render)",
        placeholder: "",
      },
      { key: "attendeeName", label: "Invite – Attendee name (the parent)", placeholder: "Marja Virtanen" },
      {
        key: "attendeeEmail",
        // A client decides whether to show the RSVP by matching the attendee
        // against the mailbox it is reading, so a send whose attendee is
        // somebody else renders as somebody else's invitation.
        label: "Invite – Attendee email (use the address you send to)",
        placeholder: "marja@example.com",
      },
    ],
    schema: productConfirmationParamsSchema,
    // One resolution per render: the schedule is composed once and the body,
    // the text twin and the attached file all read that one composition.
    resolve: (p, t, locale) =>
      resolveProductConfirmation(t, locale, resolveProductConfirmationOptions(p, new Date())),
    build: (content, t, locale) => buildProductConfirmationEmail(t, locale, content),
    // Shared with the live sends rather than restated here — see the function's
    // own note for what the subject has to agree with.
    subject: (content, t) => productConfirmationSubject(t, content),
    // Stated only on the renders that carry a calendar part, which is where
    // Exchange reads the entry's notes from.
    text: (content, t) => productConfirmationText(t, content),
    attachments: (content) => productConfirmationAttachments(content),
    resolveParams: resolveProductConfirmationParams,
  }),
  verifyEmail: defineTemplate({
    label: "Verify Email",
    fields: [
      { key: "firstName", label: "First Name", placeholder: "Jane" },
      { key: "verificationUrl", label: "Verification URL", placeholder: "https://sogverse.sog.gg/verify-email?token=abc123" },
    ],
    schema: verifyEmailParamsSchema,
    build: (p, t, locale) => buildVerifyEmailEmail(t, locale, p),
    subject: (_p, t) => t("verifyEmail.subject"),
  }),
  seatOffer: defineTemplate({
    label: "Seat Offer (Parent)",
    fields: [
      { key: "participantName", label: "Participant Name", placeholder: "Aino" },
      { key: "seat", label: "Whose seat", type: "select", options: SEAT_OPTIONS },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      {
        key: "deadline",
        label: "Deadline (formatted)",
        // Exactly what the live send produces for `en` — a 24-hour clock, and
        // month before day. A placeholder that sets the value differently to
        // the code teaches whoever is testing the mail the wrong shape.
        placeholder: "Monday, August 31 at 14:20 GMT+3",
      },
      {
        key: "acceptUrl",
        label: "Accept URL",
        placeholder: "https://sogverse.sog.gg/seat-offer?token=abc123&answer=accept",
      },
      {
        key: "declineUrl",
        label: "Decline URL",
        placeholder: "https://sogverse.sog.gg/seat-offer?token=abc123&answer=decline",
      },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/parent" },
    ],
    schema: seatOfferParamsSchema,
    build: (p, t, locale) => buildSeatOfferEmail(t, locale, p),
    subject: (p, t) => seatOfferSubject(t, p),
    resolveParams: resolveSeatOffer,
  }),
  seatOfferStaff: defineTemplate({
    label: "Seat Offer (Staff copy)",
    fields: [
      {
        key: "reason",
        label: "What happened",
        type: "select",
        options: SEAT_OFFER_STAFF_REASON_OPTIONS,
      },
      { key: "participantName", label: "Participant Name", placeholder: "Aino" },
      { key: "contactName", label: "Contact Name", placeholder: "Marja Virtanen" },
      { key: "contactEmail", label: "Contact Email", placeholder: "marja@example.com" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      {
        key: "productSchedule",
        label: "Schedule line (empty for none)",
        placeholder: "Tue 16:00, Thu 16:00 (Europe/Helsinki)",
      },
      {
        key: "offeredAt",
        label: "Offered at (formatted)",
        // What the live staff send produces — pinned to the 24-hour clock like
        // every other seat-offer surface, so the stamp staff read matches the
        // one on the admin card.
        placeholder: "Wed, Aug 26, 14:20 GMT+3",
      },
      {
        key: "adminProductUrl",
        label: "Admin product URL",
        placeholder:
          "https://sogverse.sog.gg/admin/municipality-clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
      },
    ],
    schema: seatOfferStaffParamsSchema,
    build: (p, t, locale) => buildSeatOfferStaffEmail(t, locale, p),
    subject: (p, t) => seatOfferStaffSubject(t, p),
    resolveParams: resolveSeatOfferStaff,
    // No `replyTo` override, and that is the accurate answer rather than an
    // omission: the live send replies to the support inbox, which is what the
    // default here already produces. It used to point at the family, back when
    // the mail went to that inbox instead of to the admins themselves.
  }),
  sessionReport: defineTemplate({
    label: "Session Report",
    fields: [
      { key: "gamerName", label: "Gamer Name", placeholder: "Aino" },
      { key: "geduName", label: "Gedu Name", placeholder: "Marianne" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft: Cozy Adventures" },
      { key: "groupName", label: "Group Name", placeholder: "Usvalaakso: Kettukallio" },
      { key: "copy", label: "Which copy", type: "select", options: SESSION_REPORT_COPY_OPTIONS },
      { key: "sample", label: "Sample report", type: "select", options: SESSION_REPORT_SAMPLE_OPTIONS },
      { key: "photoCount", label: "Photos", type: "select", options: SESSION_REPORT_PHOTO_OPTIONS },
      { key: "viewerTimezone", label: "Timezone to format in", type: "select", options: VIEWER_TIMEZONE_OPTIONS },
      {
        key: "reportMarkdown",
        label: "Report markdown",
        type: "textarea",
        placeholder: "Leave empty to send the selected sample. Anything typed here replaces it.",
      },
      {
        key: "productUrl",
        label: "Product page URL (My SOG)",
        placeholder: "https://sogverse.sog.gg/parent/clubs/3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15",
      },
    ],
    schema: sessionReportParamsSchema,
    build: (p, t, locale, context) =>
      buildSessionReportEmail(t, locale, resolveSessionReport(p, locale, context)),
    subject: (p, t, locale, context) =>
      sessionReportSubject(t, resolveSessionReport(p, locale, context)),
  }),
  /**
   * The one template that carries a file, and the reason the registry can carry
   * one at all.
   *
   * **It explores the format rather than stating a product.** What is being
   * tried is not our wording but what a calendar client *does* with an
   * `invite.ics` — which properties it renders, which it drops, which it
   * rewrites — so every property all three clients honour is a field, with
   * defaults that compose an unremarkable baseline invitation. The form is
   * therefore shorter than the format is: the RFC 7986 additions and the rest
   * of what was tried are gone on purpose, because a knob one client drops
   * teaches nothing but its own absence. The way to use it is one send at a
   * time: send the baseline, change one field, send it again, and compare what
   * each client made of the two.
   *
   * A thread is two or three sends: leave the identifier alone for the first,
   * then type it back in with a higher revision number for the update and the
   * cancellation.
   */
  calendarInvitation: defineResolvedTemplate({
    label: "Calendar invite explorer",
    fields: CALENDAR_EXPLORER_FIELDS,
    schema: calendarInvitationParamsSchema,
    // One resolution per render, threaded through every part: the identifier is
    // minted here, and the file and the copy the admin reads back after a send
    // both state the same one.
    resolve: (p) => resolveCalendarInvitation(p),
    build: (content, t, locale) => buildCalendarInvitationEmail(t, locale, content),
    subject: (content) => calendarInvitationSubject(content),
    // The one template that states a text body, because a mail carrying a
    // calendar part is where Exchange reads the entry's notes from.
    text: (content) => calendarInvitationText(content),
    attachments: (content) => [calendarInvitationAttachment(content)],
  }),
};

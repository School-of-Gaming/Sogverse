import { z } from "zod";
import { buildFeedbackEmail } from "./feedback";
import { buildPasswordResetEmail } from "./password-reset";
import { buildWelcomeParentEmail, buildWelcomeGeduEmail } from "./welcome";
import {
  buildProductConfirmationEmail,
  productConfirmationSubject,
  PRODUCT_CONFIRMATION_MODES,
} from "./product-confirmation";
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
  calendarInvitationAttachment,
  calendarInvitationSubject,
  calendarInvitationText,
  resolveCalendarInvitation,
  CALENDAR_INVITATION_METHODS,
  CALENDAR_INVITATION_PRODUCT_TYPES,
  CALENDAR_INVITATION_REMINDERS,
  CALENDAR_INVITATION_SECOND_REMINDERS,
  CALENDAR_INVITATION_SHAPES,
  CALENDAR_INVITATION_SHOW_AS,
  CALENDAR_INVITATION_TIMEZONES,
  CALENDAR_INVITATION_WEEKDAY_PRESETS,
  CALENDAR_INVITATION_START_DATE,
  CALENDAR_INVITATION_END_DATE,
  type CalendarInvitationWeekdayPreset,
} from "./calendar-invitation";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
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
import { formatDate, formatTimeRange } from "@/lib/utils";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { SUPPORT_EMAIL } from "@/lib/constants";
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
  text?: (params: P, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
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
  text?: (resolved: R, t: EmailTranslator, locale: string, context: EmailRenderContext) => string;
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
 * The product-confirmation form's two derived values. The seat select becomes
 * the boolean the builder takes, defaulting to the child case — which is what an
 * unfilled field in the testing UI means, and what every seat was before
 * for-parents products existed. The price is cleared on the modes that state no
 * amount, so a test render of a free signup, a municipality registration or a
 * waitlist join carries no price at all, which is what the live mail carries.
 */
function resolveProductConfirmation(params: Record<string, string>): TemplateParams {
  const { seat, priceAmount, ...rest } = params;
  const statesPrice = rest.mode === "subscription" || rest.mode === "upfront";
  return {
    ...rest,
    isSelfSeat: seat === "self",
    priceAmount: statesPrice ? priceAmount : null,
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

/** Zones to format the mail in; the first is what the live send uses (the product's). */
const VIEWER_TIMEZONE_OPTIONS = [
  { label: "Europe/Helsinki (the product's zone)", value: "Europe/Helsinki" },
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
});

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

// --- Calendar invitation: options, placeholders and schema ---

/**
 * The weekday patterns, labelled for the form. The keys are the builder's, so a
 * preset added there shows up here without a second list to keep in step.
 */
const CALENDAR_INVITATION_WEEKDAY_LABELS: Record<
  CalendarInvitationWeekdayPreset,
  string
> = {
  "mon-fri": "Monday to Friday",
  "mon-wed-fri": "Monday, Wednesday and Friday",
  "tue-thu": "Tuesday and Thursday",
  mon: "Monday",
  wed: "Wednesday",
  sat: "Saturday",
};

const CALENDAR_INVITATION_WEEKDAY_OPTIONS = CALENDAR_INVITATION_WEEKDAY_PRESETS.map(
  (value) => ({ label: CALENDAR_INVITATION_WEEKDAY_LABELS[value], value }),
);

const CALENDAR_INVITATION_REMINDER_LABELS: Record<
  (typeof CALENDAR_INVITATION_REMINDERS)[number],
  string
> = {
  none: "No reminder",
  "15": "15 minutes before",
  "60": "An hour before",
  "1440": "A day before",
};

/**
 * The two reminder selects, ordered by their own defaults — the first entry is
 * what an untouched select posts, so the order *is* the default. Fifteen
 * minutes first and a day second, because a Microsoft mailbox keeps only the
 * first alarm and the near one is the one that gets a family out of the door.
 */
const CALENDAR_INVITATION_REMINDER_OPTIONS = CALENDAR_INVITATION_REMINDERS.map((value) => ({
  label: CALENDAR_INVITATION_REMINDER_LABELS[value],
  value,
}));

const CALENDAR_INVITATION_SECOND_REMINDER_OPTIONS = CALENDAR_INVITATION_SECOND_REMINDERS.map(
  (value) => ({ label: CALENDAR_INVITATION_REMINDER_LABELS[value], value }),
);

const CALENDAR_INVITATION_SHOW_AS_LABELS: Record<
  (typeof CALENDAR_INVITATION_SHOW_AS)[number],
  string
> = {
  free: "Free",
  busy: "Busy",
};

const CALENDAR_INVITATION_SHOW_AS_OPTIONS = CALENDAR_INVITATION_SHOW_AS.map((value) => ({
  label: CALENDAR_INVITATION_SHOW_AS_LABELS[value],
  value,
}));

const CALENDAR_INVITATION_METHOD_LABELS: Record<
  (typeof CALENDAR_INVITATION_METHODS)[number],
  string
> = {
  request: "Request — asks the reader to answer (RSVP)",
  publish: "Publish — states the entry, asks nothing",
  cancel: "Cancel — withdraws the entry",
};

const CALENDAR_INVITATION_METHOD_OPTIONS = CALENDAR_INVITATION_METHODS.map((value) => ({
  label: CALENDAR_INVITATION_METHOD_LABELS[value],
  value,
}));

const CALENDAR_INVITATION_SHAPE_LABELS: Record<
  (typeof CALENDAR_INVITATION_SHAPES)[number],
  string
> = {
  rule: "Weekly rule (RRULE)",
  list: "Explicit dates (RDATE)",
};

const CALENDAR_INVITATION_SHAPE_OPTIONS = CALENDAR_INVITATION_SHAPES.map((value) => ({
  label: CALENDAR_INVITATION_SHAPE_LABELS[value],
  value,
}));

const CALENDAR_INVITATION_TYPE_OPTIONS = CALENDAR_INVITATION_PRODUCT_TYPES.map((value) => ({
  label: value,
  value,
}));

const CALENDAR_INVITATION_TIMEZONE_OPTIONS = CALENDAR_INVITATION_TIMEZONES.map((value) => ({
  label: value,
  value,
}));

/** Derived from codegen, so a language added by migration appears in the form. */
const CALENDAR_INVITATION_LANGUAGE_OPTIONS = SPOKEN_LANGUAGES.map((value) => ({
  label: value,
  value,
}));

const calendarInvitationParamsSchema = z.object({
  parentFirstName: z.string().min(1),
  parentEmail: z.string().email(),
  gamerFirstName: z.string().min(1),
  productName: z.string().min(1),
  productType: z.enum(CALENDAR_INVITATION_PRODUCT_TYPES),
  weekdays: z.enum(CALENDAR_INVITATION_WEEKDAY_PRESETS),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  /** Null is an open-ended run — a consumer club, which never states a last day. */
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM"),
  durationMinutes: z.string().regex(/^\d+$/, "expected whole minutes"),
  timezone: z.enum(CALENDAR_INVITATION_TIMEZONES),
  /** Null is an online session, which has no address to state. */
  address: z.string().nullable(),
  arrivalInstructions: z.string().nullable(),
  description: z.string().nullable(),
  geduFirstName: z.string().min(1),
  spokenLanguage: z.enum(Constants.public.Enums.spoken_language),
  /** Two alarms, in the order they are emitted — Exchange keeps only the first. */
  reminderFirst: z.enum(CALENDAR_INVITATION_REMINDERS),
  reminderSecond: z.enum(CALENDAR_INVITATION_REMINDERS),
  showAs: z.enum(CALENDAR_INVITATION_SHOW_AS),
  method: z.enum(CALENDAR_INVITATION_METHODS),
  shape: z.enum(CALENDAR_INVITATION_SHAPES),
  /** Null mints a fresh identifier at render; a thread's later message types the first one's back in. */
  uid: z.string().nullable(),
  sequence: z.string().regex(/^\d+$/, "expected a whole number"),
  dashboardUrl: z.string().url(),
});

/**
 * The form's strings as the template takes them.
 *
 * Four fields mean "none" when they are empty, and the identifier means "mint
 * one" when it is empty *or* still holding the word its placeholder suggests —
 * an untouched text input posts its placeholder, so the literal has to be
 * recognised or nobody could ever get a generated one without clearing a field
 * that looks already blank.
 */
function resolveCalendarInvitationParams(params: Record<string, string>): TemplateParams {
  const { endDate, address, arrivalInstructions, description, uid, ...rest } = params;
  const blankToNull = (value: string) => value.trim() || null;
  return {
    ...rest,
    endDate: blankToNull(endDate),
    address: blankToNull(address),
    arrivalInstructions: blankToNull(arrivalInstructions),
    description: blankToNull(description),
    uid: uid.trim() === "generated" ? null : blankToNull(uid),
  };
}

// --- Single source of truth for all email templates ---

export const templateRegistry: Record<string, TemplateDefinition> = {
  /**
   * The reference every other entry in this registry is measured against —
   * `/admin/ui-components` for mail. It is first in the list because that is
   * what it is for: whoever opens this page to test a template should meet the
   * house style before they meet their own mail.
   *
   * It takes no params and ignores the locale for its own copy (see the builder
   * for why it is the one untranslated one). A registry entry rather than a
   * page because it has to be *sent* to be worth anything — a reference for
   * email that can only be viewed in a browser is describing a rendering nobody
   * receives.
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
  productConfirmation: defineTemplate({
    label: "Product Confirmation",
    fields: [
      { key: "participantName", label: "Participant Name", placeholder: "Aino" },
      { key: "seat", label: "Whose seat", type: "select", options: SEAT_OPTIONS },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "productType", label: "Product Type", type: "select", options: PRODUCT_TYPE_OPTIONS },
      { key: "mode", label: "Outcome", type: "select", options: PRODUCT_CONFIRMATION_MODE_OPTIONS },
      { key: "priceAmount", label: "Formatted Price", placeholder: "€40.00" },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/parent" },
    ],
    schema: productConfirmationParamsSchema,
    build: (p, t, locale) => buildProductConfirmationEmail(t, locale, p),
    // Shared with the live sends rather than restated here — see the function's
    // own note for what the subject has to agree with.
    subject: (p, t) => productConfirmationSubject(t, p),
    resolveParams: resolveProductConfirmation,
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
   * one at all. What is being tried here is not the mail's wording but what a
   * calendar client *does* with the `invite.ics` beside it, so every knob a
   * client could disagree about is a field: the notation the schedule is
   * written in, whether the message asks for an answer, the reminder offset,
   * and the identifier and revision number that decide whether a second message
   * lands on the first one's entry or beside it.
   *
   * A thread is two or three sends: leave the identifier alone for the first,
   * then type it back in with a higher revision number for the update and the
   * cancellation.
   */
  calendarInvitation: defineResolvedTemplate({
    label: "Calendar Invitation",
    fields: [
      { key: "parentFirstName", label: "Parent First Name", placeholder: "Sanna" },
      {
        key: "parentEmail",
        // It is the ATTENDEE, and a client decides whether to show the RSVP by
        // matching it against the mailbox it is reading — so a test send whose
        // attendee is somebody else renders as somebody else's invitation.
        label: "Parent Email (the attendee — use the address you are sending to)",
        placeholder: "sanna@example.com",
      },
      { key: "gamerFirstName", label: "Gamer First Name", placeholder: "Aino" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft building camp" },
      { key: "productType", label: "Product Type", type: "select", options: CALENDAR_INVITATION_TYPE_OPTIONS },
      { key: "weekdays", label: "Days", type: "select", options: CALENDAR_INVITATION_WEEKDAY_OPTIONS },
      { key: "startDate", label: "Start date", placeholder: CALENDAR_INVITATION_START_DATE },
      { key: "endDate", label: "End date (empty for open-ended)", placeholder: CALENDAR_INVITATION_END_DATE },
      { key: "startTime", label: "Start time", placeholder: "16:00" },
      { key: "durationMinutes", label: "Duration (minutes)", placeholder: "120" },
      { key: "timezone", label: "Timezone", type: "select", options: CALENDAR_INVITATION_TIMEZONE_OPTIONS },
      {
        key: "address",
        label: "Address (empty for online)",
        placeholder: "Kaisaniemenkatu 6, 00100 Helsinki",
      },
      {
        key: "arrivalInstructions",
        label: "Getting there",
        type: "textarea",
        placeholder: "Ring the bell marked School of Gaming and take the stairs to the second floor.",
      },
      {
        key: "description",
        label: "Description",
        type: "textarea",
        placeholder:
          "Aino is building a harbour town this month, and the last session is the one where everyone walks through what they made.",
      },
      { key: "geduFirstName", label: "Gedu First Name", placeholder: "Ville" },
      { key: "spokenLanguage", label: "Spoken language", type: "select", options: CALENDAR_INVITATION_LANGUAGE_OPTIONS },
      {
        key: "reminderFirst",
        label: "First reminder (a Microsoft mailbox keeps only this one)",
        type: "select",
        options: CALENDAR_INVITATION_REMINDER_OPTIONS,
      },
      {
        key: "reminderSecond",
        label: "Second reminder (kept by the calendars that keep more than one)",
        type: "select",
        options: CALENDAR_INVITATION_SECOND_REMINDER_OPTIONS,
      },
      {
        key: "showAs",
        label: "Show as (a child's session does not normally block the parent's own calendar)",
        type: "select",
        options: CALENDAR_INVITATION_SHOW_AS_OPTIONS,
      },
      { key: "method", label: "Message", type: "select", options: CALENDAR_INVITATION_METHOD_OPTIONS },
      { key: "shape", label: "Schedule notation", type: "select", options: CALENDAR_INVITATION_SHAPE_OPTIONS },
      {
        key: "uid",
        // The word itself is what an untouched field posts, and the resolver
        // reads it as "mint one" — see the resolver for why the literal has to
        // be recognised rather than only the empty string.
        label: "Calendar UID (leave as generated for a new entry)",
        placeholder: "generated",
      },
      { key: "sequence", label: "Sequence (raise it for an update)", placeholder: "0" },
      { key: "dashboardUrl", label: "My SOG URL", placeholder: "https://sogverse.sog.gg/parent" },
    ],
    schema: calendarInvitationParamsSchema,
    // One resolution per render, threaded through every part: the identifier is
    // minted here, and the mail, the file and the copy the admin reads back all
    // state the same one.
    resolve: (p, t, locale) => resolveCalendarInvitation(p, t, locale),
    build: (content, t, locale) => buildCalendarInvitationEmail(t, locale, content),
    subject: (content, t) => calendarInvitationSubject(t, content),
    // The one template that states a text body, because a mail carrying a
    // calendar part is where Exchange reads the entry's notes from.
    text: (content, t) => calendarInvitationText(t, content),
    attachments: (content) => [calendarInvitationAttachment(content)],
    resolveParams: resolveCalendarInvitationParams,
  }),
};

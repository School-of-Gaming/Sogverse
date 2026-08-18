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
import type { EmailTranslator } from "./translator";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { Constants } from "@/types";

// --- Field types for the testing UI ---

interface TextField {
  key: string;
  label: string;
  placeholder: string;
}

interface SelectField {
  key: string;
  label: string;
  type: "select";
  options: { label: string; value: string }[];
}

export type TemplateField = TextField | SelectField;

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
  /** Reply-To this template's real sending route would set. */
  replyTo: string;
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
   */
  render: (rawParams: unknown, t: EmailTranslator, locale: string) => RenderedTemplate;
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
  /** Build the HTML email content from validated params. */
  build: (params: P, t: EmailTranslator, locale: string) => string;
  /** Generate the email subject line from validated params and translator. */
  subject: (params: P, t: EmailTranslator) => string;
  /**
   * Reply-To for this template, defaulting to the support inbox — which is the
   * answer for every mail we send *to* a family. Only a template whose real
   * route replies to a person overrides it, and overriding is what makes a test
   * send reproduce the live behaviour instead of a plausible-looking stand-in.
   */
  replyTo?: (params: P) => string;
  resolveParams?: TemplateDefinition["resolveParams"];
}): TemplateDefinition {
  const { schema, build, subject, replyTo, ...rest } = entry;
  return {
    ...rest,
    schema,
    render: (rawParams, t, locale) => {
      const params = schema.parse(rawParams);
      return {
        subject: subject(params, t),
        html: build(params, t, locale),
        replyTo: replyTo?.(params) ?? SUPPORT_EMAIL,
      };
    },
  };
}

// --- Shared select options & resolvers ---

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
 * amount, so a test render of a free signup or a waitlist join carries no price
 * at all, which is what the live mail carries.
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

// --- Single source of truth for all email templates ---

export const templateRegistry: Record<string, TemplateDefinition> = {
  passwordReset: defineTemplate({
    label: "Password Reset",
    fields: [
      { key: "resetLink", label: "Reset Link", placeholder: "https://sogverse.sog.gg/api/auth/callback?next=/reset-password&code=abc123" },
    ],
    schema: passwordResetParamsSchema,
    build: (p, t, locale) => buildPasswordResetEmail(t, p.resetLink, locale),
    subject: (_p, t) => t("passwordReset.subject"),
  }),
  feedback: defineTemplate({
    label: "Feedback",
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
      { key: "message", label: "Message", placeholder: "Great product!" },
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
};

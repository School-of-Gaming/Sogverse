import { z } from "zod";
import { buildFeedbackEmail } from "./feedback";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
} from "./enrollment-changes";
import { buildPasswordResetEmail } from "./password-reset";
import { buildGeduInviteEmail } from "./gedu-invite";
import type { EmailTranslator } from "./translator";
import { ROLE_LABEL_KEYS } from "@/lib/constants/roles";
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

type TemplateParams = Record<string, string | null>;

export interface RenderedTemplate {
  subject: string;
  html: string;
}

export interface TemplateDefinition {
  /** Display label for the template dropdown in the testing UI. */
  label: string;
  /** Form fields rendered in the testing UI. */
  fields: TemplateField[];
  /** Zod schema for API-side param validation. */
  schema: z.ZodType<TemplateParams>;
  /**
   * Validate raw params against `schema`, then build the subject line and
   * HTML email content. Throws a ZodError when params are malformed.
   */
  render: (rawParams: unknown, t: EmailTranslator, locale: string) => RenderedTemplate;
  /** Translation key for sender display name (e.g. "senderAuth"). */
  fromNameKey: "senderAuth" | "senderEnrollment" | "senderFeedback";
  /** Optional: transform UI field values into API params (e.g. minecraft status → username + uuid). */
  resolveParams?: (params: Record<string, string>) => Record<string, string | null>;
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
  fromNameKey: TemplateDefinition["fromNameKey"];
  resolveParams?: TemplateDefinition["resolveParams"];
}): TemplateDefinition {
  const { schema, build, subject, ...rest } = entry;
  return {
    ...rest,
    schema,
    render: (rawParams, t, locale) => {
      const params = schema.parse(rawParams);
      return { subject: subject(params, t), html: build(params, t, locale) };
    },
  };
}

// --- Shared select options & resolvers ---

const MINECRAFT_STATUS_OPTIONS = [
  { label: "Verified (username + uuid)", value: "verified" },
  { label: "Unverified (username only)", value: "unverified" },
  { label: "Not provided", value: "none" },
];

function resolveMinecraftStatus(params: Record<string, string>): Record<string, string | null> {
  const resolved: Record<string, string | null> = { ...params };
  const status = params.minecraftStatus;
  delete resolved.minecraftStatus;
  switch (status) {
    case "verified":
      resolved.minecraftUsername = "Notch";
      resolved.minecraftUuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
      break;
    case "unverified":
      resolved.minecraftUsername = "PlayerOne";
      resolved.minecraftUuid = null;
      break;
    default:
      resolved.minecraftUsername = null;
      resolved.minecraftUuid = null;
  }
  return resolved;
}

// --- Zod schemas ---

const passwordResetParamsSchema = z.object({
  resetLink: z.string().url(),
});

const geduInviteParamsSchema = z.object({
  setupLink: z.string().url(),
  firstName: z.string().min(1),
});

const feedbackParamsSchema = z.object({
  userName: z.string().min(1),
  userRole: z.enum(Constants.public.Enums.user_role),
  userEmail: z.string().email(),
  message: z.string().min(1),
});

const enrollmentParentParamsSchema = z.object({
  parentName: z.string().min(1),
  gamerName: z.string().min(1),
  geduName: z.string().min(1),
  productName: z.string().min(1),
  minecraftUsername: z.string().nullable(),
  minecraftUuid: z.string().nullable(),
});

const enrollmentGeduParamsSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  productName: z.string().min(1),
  minecraftUsername: z.string().nullable(),
  minecraftUuid: z.string().nullable(),
});

const unenrollmentParentParamsSchema = z.object({
  parentName: z.string().min(1),
  gamerName: z.string().min(1),
  geduName: z.string().min(1),
  productName: z.string().min(1),
});

const unenrollmentGeduParamsSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  productName: z.string().min(1),
  minecraftUsername: z.string().nullable(),
  minecraftUuid: z.string().nullable(),
});

// --- Single source of truth for all email templates ---

export const templateRegistry: Record<string, TemplateDefinition> = {
  geduInvite: defineTemplate({
    label: "Gedu Invite",
    fields: [
      { key: "firstName", label: "First Name", placeholder: "Jane" },
      { key: "setupLink", label: "Setup Link", placeholder: "https://sogverse.sog.gg/setup-account" },
    ],
    schema: geduInviteParamsSchema,
    build: (p, t, locale) => buildGeduInviteEmail(t, p.setupLink, locale, p.firstName),
    subject: (_p, t) => t("geduInvite.subject"),
    fromNameKey: "senderAuth",
  }),
  passwordReset: defineTemplate({
    label: "Password Reset",
    fields: [
      { key: "resetLink", label: "Reset Link", placeholder: "https://sogverse.sog.gg/api/auth/callback?next=/reset-password&code=abc123" },
    ],
    schema: passwordResetParamsSchema,
    build: (p, t, locale) => buildPasswordResetEmail(t, p.resetLink, locale),
    subject: (_p, t) => t("passwordReset.subject"),
    fromNameKey: "senderAuth",
  }),
  feedback: defineTemplate({
    label: "Feedback",
    fields: [
      { key: "userName", label: "User Name", placeholder: "Jane Doe" },
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
      { key: "userEmail", label: "User Email", placeholder: "jane@example.com" },
      { key: "message", label: "Message", placeholder: "Great product!" },
    ],
    schema: feedbackParamsSchema,
    build: (p, t, locale) => buildFeedbackEmail(t, locale, {
      ...p,
      sentAt: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    }),
    subject: (p, t) => t("feedback.subject", { displayName: p.userName, role: t(ROLE_LABEL_KEYS[p.userRole]) }),
    fromNameKey: "senderFeedback",
  }),
  enrollmentParent: defineTemplate({
    label: "Enrollment (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: enrollmentParentParamsSchema,
    build: (p, t, locale) => buildEnrollmentParentEmail(t, locale, p),
    subject: (p, t) => t("enrollmentParent.subject", { gamerName: p.gamerName, productName: p.productName }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  }),
  enrollmentGedu: defineTemplate({
    label: "Enrollment (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: enrollmentGeduParamsSchema,
    build: (p, t, locale) => buildEnrollmentGeduEmail(t, locale, p),
    subject: (p, t) => t("enrollmentGedu.subject", { gamerName: p.gamerName, productName: p.productName }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  }),
  unenrollmentParent: defineTemplate({
    label: "Unenrollment (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: unenrollmentParentParamsSchema,
    build: (p, t, locale) => buildUnenrollmentParentEmail(t, locale, p),
    subject: (p, t) => t("unenrollmentParent.subject", { gamerName: p.gamerName, productName: p.productName }),
    fromNameKey: "senderEnrollment",
  }),
  unenrollmentGedu: defineTemplate({
    label: "Unenrollment (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: unenrollmentGeduParamsSchema,
    build: (p, t, locale) => buildUnenrollmentGeduEmail(t, locale, p),
    subject: (p, t) => t("unenrollmentGedu.subject", { gamerName: p.gamerName, productName: p.productName }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  }),
};

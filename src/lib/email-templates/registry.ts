import { z } from "zod";
import { buildFeedbackEmail } from "./feedback";
import {
  buildGroupAddedEmail,
  buildGroupDeletedEmail,
  buildGroupReassignedOldGeduEmail,
  buildGroupReassignedNewGeduEmail,
  buildGroupReassignedParentEmail,
  buildGamerMovedParentEmail,
  buildGamerMovedOldGeduEmail,
  buildGamerMovedNewGeduEmail,
} from "./group-changes";
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
import type { UserRole } from "@/types";

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

export type TemplateParams = Record<string, string | null>;

export interface TemplateDefinition {
  /** Display label for the template dropdown in the testing UI. */
  label: string;
  /** Form fields rendered in the testing UI. */
  fields: TemplateField[];
  /** Zod schema for API-side param validation. */
  schema: z.ZodType;
  /** Build the HTML email content from validated params. */
  build: (params: TemplateParams, t: EmailTranslator, locale: string) => string;
  /** Generate the email subject line from validated params and translator. */
  subject: (params: TemplateParams, t: EmailTranslator) => string;
  /** Translation key for sender display name (e.g. "senderAuth"). */
  fromNameKey: "senderAuth" | "senderEnrollment" | "senderFeedback";
  /** Optional: transform UI field values into API params (e.g. minecraft status → username + uuid). */
  resolveParams?: (params: Record<string, string>) => Record<string, string | null>;
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
  displayName: z.string().min(1),
});

const feedbackParamsSchema = z.object({
  userName: z.string().min(1),
  userRole: z.string().min(1),
  userEmail: z.string().email(),
  message: z.string().min(1),
});

const geduProductParamsSchema = z.object({
  geduName: z.string().min(1),
  productName: z.string().min(1),
});

const reassignParamsSchema = z.object({
  oldGeduName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const parentGamerReassignParamsSchema = z.object({
  parentName: z.string().min(1),
  gamerName: z.string().min(1),
  oldGeduName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const gamerMovedOldGeduParamsSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const gamerMovedNewGeduParamsSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  oldGeduName: z.string().min(1),
  productName: z.string().min(1),
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
  geduInvite: {
    label: "Gedu Invite",
    fields: [
      { key: "displayName", label: "Display Name", placeholder: "Jane Smith" },
      { key: "setupLink", label: "Setup Link", placeholder: "https://sogverse.sog.gg/setup-account" },
    ],
    schema: geduInviteParamsSchema,
    build: (p, t, locale) => buildGeduInviteEmail(t, p.setupLink as string, locale, p.displayName as string),
    subject: (_p, t) => t("geduInvite.subject"),
    fromNameKey: "senderAuth",
  },
  passwordReset: {
    label: "Password Reset",
    fields: [
      { key: "resetLink", label: "Reset Link", placeholder: "https://sogverse.sog.gg/api/auth/callback?next=/reset-password&code=abc123" },
    ],
    schema: passwordResetParamsSchema,
    build: (p, t, locale) => buildPasswordResetEmail(t, p.resetLink as string, locale),
    subject: (_p, t) => t("passwordReset.subject"),
    fromNameKey: "senderAuth",
  },
  feedback: {
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
      ...p as z.infer<typeof feedbackParamsSchema>,
      sentAt: new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    }),
    subject: (p, t) => t("feedback.subject", { displayName: p.userName as string, role: t(ROLE_LABEL_KEYS[p.userRole as UserRole]) }),
    fromNameKey: "senderFeedback",
  },
  groupAdded: {
    label: "Group Added (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: geduProductParamsSchema,
    build: (p, t, locale) => buildGroupAddedEmail(t, locale, p as z.infer<typeof geduProductParamsSchema>),
    subject: (p, t) => t("groupAdded.subject", { productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  groupDeleted: {
    label: "Group Deleted (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: geduProductParamsSchema,
    build: (p, t, locale) => buildGroupDeletedEmail(t, locale, p as z.infer<typeof geduProductParamsSchema>),
    subject: (p, t) => t("groupDeleted.subject", { productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  groupReassignedOldGedu: {
    label: "Group Reassigned (Old Gedu)",
    fields: [
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: reassignParamsSchema,
    build: (p, t, locale) => buildGroupReassignedOldGeduEmail(t, locale, p as z.infer<typeof reassignParamsSchema>),
    subject: (p, t) => t("groupReassignedOldGedu.subject", { productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  groupReassignedNewGedu: {
    label: "Group Reassigned (New Gedu)",
    fields: [
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: reassignParamsSchema,
    build: (p, t, locale) => buildGroupReassignedNewGeduEmail(t, locale, p as z.infer<typeof reassignParamsSchema>),
    subject: (p, t) => t("groupReassignedNewGedu.subject", { productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  groupReassignedParent: {
    label: "Group Reassigned (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: parentGamerReassignParamsSchema,
    build: (p, t, locale) => buildGroupReassignedParentEmail(t, locale, p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p, t) => t("groupReassignedParent.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  gamerMovedParent: {
    label: "Gamer Moved (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: parentGamerReassignParamsSchema,
    build: (p, t, locale) => buildGamerMovedParentEmail(t, locale, p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p, t) => t("gamerMovedParent.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  gamerMovedOldGedu: {
    label: "Gamer Moved (Old Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: gamerMovedOldGeduParamsSchema,
    build: (p, t, locale) => buildGamerMovedOldGeduEmail(t, locale, p as z.infer<typeof gamerMovedOldGeduParamsSchema>),
    subject: (p, t) => t("gamerMovedOldGedu.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  gamerMovedNewGedu: {
    label: "Gamer Moved (New Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Bob" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: gamerMovedNewGeduParamsSchema,
    build: (p, t, locale) => buildGamerMovedNewGeduEmail(t, locale, p as z.infer<typeof gamerMovedNewGeduParamsSchema>),
    subject: (p, t) => t("gamerMovedNewGedu.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  enrollmentParent: {
    label: "Enrollment (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: enrollmentParentParamsSchema,
    build: (p, t, locale) => buildEnrollmentParentEmail(t, locale, p as z.infer<typeof enrollmentParentParamsSchema>),
    subject: (p, t) => t("enrollmentParent.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  },
  enrollmentGedu: {
    label: "Enrollment (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: enrollmentGeduParamsSchema,
    build: (p, t, locale) => buildEnrollmentGeduEmail(t, locale, p as z.infer<typeof enrollmentGeduParamsSchema>),
    subject: (p, t) => t("enrollmentGedu.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  },
  unenrollmentParent: {
    label: "Unenrollment (Parent)",
    fields: [
      { key: "parentName", label: "Parent Name", placeholder: "Jane Doe" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: unenrollmentParentParamsSchema,
    build: (p, t, locale) => buildUnenrollmentParentEmail(t, locale, p as z.infer<typeof unenrollmentParentParamsSchema>),
    subject: (p, t) => t("unenrollmentParent.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
  },
  unenrollmentGedu: {
    label: "Unenrollment (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "gamerName", label: "Gamer Name", placeholder: "Little Johnny" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
      { key: "minecraftStatus", label: "Minecraft Status", type: "select", options: MINECRAFT_STATUS_OPTIONS },
    ],
    schema: unenrollmentGeduParamsSchema,
    build: (p, t, locale) => buildUnenrollmentGeduEmail(t, locale, p as z.infer<typeof unenrollmentGeduParamsSchema>),
    subject: (p, t) => t("unenrollmentGedu.subject", { gamerName: p.gamerName as string, productName: p.productName as string }),
    fromNameKey: "senderEnrollment",
    resolveParams: resolveMinecraftStatus,
  },
};

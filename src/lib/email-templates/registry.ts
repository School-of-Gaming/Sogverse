import { z } from "zod";
import { SENDER_NAME_AUTH, SENDER_NAME_FEEDBACK, SENDER_NAME_ENROLLMENT } from "@/lib/constants";
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
  groupChangeSubjects,
} from "./group-changes";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
  enrollmentChangeSubjects,
} from "./enrollment-changes";
import { buildPasswordResetEmail } from "./password-reset";

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
  build: (params: TemplateParams) => string;
  /** Generate the email subject line from validated params. */
  subject: (params: TemplateParams) => string;
  /** Sender display name. */
  fromName: string;
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

const feedbackParamsSchema = z.object({
  userName: z.string().min(1),
  userRole: z.string().min(1),
  userEmail: z.string().email(),
  message: z.string().min(1),
  sentAt: z.string().min(1),
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
  passwordReset: {
    label: "Password Reset",
    fields: [
      { key: "resetLink", label: "Reset Link", placeholder: "https://sogverse.sog.gg/api/auth/callback?next=/reset-password&code=abc123" },
    ],
    schema: passwordResetParamsSchema,
    build: (p) => buildPasswordResetEmail(p.resetLink as string),
    subject: () => "Reset your Sogverse password",
    fromName: SENDER_NAME_AUTH,
  },
  feedback: {
    label: "Feedback",
    fields: [
      { key: "userName", label: "User Name", placeholder: "Jane Doe" },
      { key: "userRole", label: "User Role", placeholder: "customer" },
      { key: "userEmail", label: "User Email", placeholder: "jane@example.com" },
      { key: "message", label: "Message", placeholder: "Great product!" },
      { key: "sentAt", label: "Sent At", placeholder: "March 11, 2026 at 3:00 PM" },
    ],
    schema: feedbackParamsSchema,
    build: (p) => buildFeedbackEmail(p as z.infer<typeof feedbackParamsSchema>),
    subject: () => "New Feedback Received",
    fromName: SENDER_NAME_FEEDBACK,
  },
  groupAdded: {
    label: "Group Added (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: geduProductParamsSchema,
    build: (p) => buildGroupAddedEmail(p as z.infer<typeof geduProductParamsSchema>),
    subject: (p) => groupChangeSubjects.groupAdded(p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupDeleted: {
    label: "Group Deleted (Gedu)",
    fields: [
      { key: "geduName", label: "Gedu Name", placeholder: "Alice" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: geduProductParamsSchema,
    build: (p) => buildGroupDeletedEmail(p as z.infer<typeof geduProductParamsSchema>),
    subject: (p) => groupChangeSubjects.groupDeleted(p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedOldGedu: {
    label: "Group Reassigned (Old Gedu)",
    fields: [
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: reassignParamsSchema,
    build: (p) => buildGroupReassignedOldGeduEmail(p as z.infer<typeof reassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedOldGedu(p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedNewGedu: {
    label: "Group Reassigned (New Gedu)",
    fields: [
      { key: "oldGeduName", label: "Old Gedu Name", placeholder: "Alice" },
      { key: "newGeduName", label: "New Gedu Name", placeholder: "Bob" },
      { key: "productName", label: "Product Name", placeholder: "Minecraft 101" },
    ],
    schema: reassignParamsSchema,
    build: (p) => buildGroupReassignedNewGeduEmail(p as z.infer<typeof reassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedNewGedu(p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildGroupReassignedParentEmail(p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedParent(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildGamerMovedParentEmail(p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedParent(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildGamerMovedOldGeduEmail(p as z.infer<typeof gamerMovedOldGeduParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedOldGedu(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildGamerMovedNewGeduEmail(p as z.infer<typeof gamerMovedNewGeduParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedNewGedu(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildEnrollmentParentEmail(p as z.infer<typeof enrollmentParentParamsSchema>),
    subject: (p) => enrollmentChangeSubjects.enrollmentParent(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildEnrollmentGeduEmail(p as z.infer<typeof enrollmentGeduParamsSchema>),
    subject: (p) => enrollmentChangeSubjects.enrollmentGedu(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildUnenrollmentParentEmail(p as z.infer<typeof unenrollmentParentParamsSchema>),
    subject: (p) => enrollmentChangeSubjects.unenrollmentParent(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
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
    build: (p) => buildUnenrollmentGeduEmail(p as z.infer<typeof unenrollmentGeduParamsSchema>),
    subject: (p) => enrollmentChangeSubjects.unenrollmentGedu(p.gamerName as string, p.productName as string),
    fromName: SENDER_NAME_ENROLLMENT,
    resolveParams: resolveMinecraftStatus,
  },
};

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SENDER_NAME_FEEDBACK, SENDER_NAME_ENROLLMENT } from "@/lib/constants";
import { buildFeedbackEmail } from "@/lib/email-templates/feedback";
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
} from "@/lib/email-templates/group-changes";
import { escapeHtml } from "@/lib/email-templates/utils";
import { parseEmails } from "@/lib/utils";
import { z } from "zod";

// --- Template registry ---

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

interface TemplateEntry {
  schema: z.ZodType;
  build: (params: Record<string, string>) => string;
  subject: (params: Record<string, string>) => string;
  fromName: string;
}

const templates: Record<string, TemplateEntry> = {
  feedback: {
    schema: feedbackParamsSchema,
    build: (p) => buildFeedbackEmail(p as z.infer<typeof feedbackParamsSchema>),
    subject: () => "New Feedback Received",
    fromName: SENDER_NAME_FEEDBACK,
  },
  groupAdded: {
    schema: geduProductParamsSchema,
    build: (p) => buildGroupAddedEmail(p as z.infer<typeof geduProductParamsSchema>),
    subject: (p) => groupChangeSubjects.groupAdded(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupDeleted: {
    schema: geduProductParamsSchema,
    build: (p) => buildGroupDeletedEmail(p as z.infer<typeof geduProductParamsSchema>),
    subject: (p) => groupChangeSubjects.groupDeleted(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedOldGedu: {
    schema: reassignParamsSchema,
    build: (p) => buildGroupReassignedOldGeduEmail(p as z.infer<typeof reassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedOldGedu(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedNewGedu: {
    schema: reassignParamsSchema,
    build: (p) => buildGroupReassignedNewGeduEmail(p as z.infer<typeof reassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedNewGedu(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedParent: {
    schema: parentGamerReassignParamsSchema,
    build: (p) => buildGroupReassignedParentEmail(p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedParent(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedParent: {
    schema: parentGamerReassignParamsSchema,
    build: (p) => buildGamerMovedParentEmail(p as z.infer<typeof parentGamerReassignParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedParent(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedOldGedu: {
    schema: gamerMovedOldGeduParamsSchema,
    build: (p) => buildGamerMovedOldGeduEmail(p as z.infer<typeof gamerMovedOldGeduParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedOldGedu(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedNewGedu: {
    schema: gamerMovedNewGeduParamsSchema,
    build: (p) => buildGamerMovedNewGeduEmail(p as z.infer<typeof gamerMovedNewGeduParamsSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedNewGedu(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
};

// --- Request schemas ---

const customSchema = z.object({
  mode: z.literal("custom"),
  provider: z.literal("brevo"),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  toEmail: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  replyToEmail: z.string().email().optional(),
});

const templateSchema = z.object({
  mode: z.literal("template"),
  toEmail: z.string().min(1),
  template: z.string(),
  params: z.record(z.string()),
});

const requestSchema = z.discriminatedUnion("mode", [customSchema, templateSchema]);

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send test emails",
    });
    if (result instanceof NextResponse) return result;

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: `${firstError.path.join(".")}: ${firstError.message}` },
        { status: 400 },
      );
    }

    const toEmails = parseEmails(parsed.data.toEmail);
    const emailSchema = z.string().email();
    for (const email of toEmails) {
      if (!emailSchema.safeParse(email).success) {
        return NextResponse.json(
          { error: `Invalid email: ${email}` },
          { status: 400 },
        );
      }
    }

    let fromName: string;
    let subject: string;
    let htmlContent: string;
    let replyToEmail: string | undefined;

    if (parsed.data.mode === "custom") {
      fromName = parsed.data.fromName;
      subject = parsed.data.subject;
      replyToEmail = parsed.data.replyToEmail;
      htmlContent = escapeHtml(parsed.data.body).replace(/\n/g, "<br/>");
    } else {
      const tmpl = templates[parsed.data.template];
      if (!tmpl) {
        return NextResponse.json(
          { error: `Unknown template: ${parsed.data.template}` },
          { status: 400 },
        );
      }

      const paramsParsed = tmpl.schema.safeParse(parsed.data.params);
      if (!paramsParsed.success) {
        const firstError = (paramsParsed as z.SafeParseError<unknown>).error.errors[0];
        return NextResponse.json(
          { error: `params.${firstError.path.join(".")}: ${firstError.message}` },
          { status: 400 },
        );
      }

      const validatedParams = paramsParsed.data as Record<string, string>;
      fromName = tmpl.fromName;
      subject = tmpl.subject(validatedParams);
      htmlContent = tmpl.build(validatedParams);
    }

    const emailResult = await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName,
      toEmail: toEmails,
      subject,
      htmlContent,
      replyToEmail,
    });

    return NextResponse.json({ messageId: emailResult.messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

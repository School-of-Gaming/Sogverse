import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME_FEEDBACK, SENDER_NAME_ENROLLMENT } from "@/lib/constants";
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
import { z } from "zod";

// --- Schemas (defined separately to avoid circular typeof references) ---

const feedbackSchema = z.object({
  userName: z.string().min(1),
  userRole: z.string().min(1),
  userEmail: z.string().email(),
  message: z.string().min(1),
  sentAt: z.string().min(1),
});

const geduProductSchema = z.object({
  geduName: z.string().min(1),
  productName: z.string().min(1),
});

const reassignSchema = z.object({
  oldGeduName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const parentGamerReassignSchema = z.object({
  parentName: z.string().min(1),
  gamerName: z.string().min(1),
  oldGeduName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const gamerMovedOldGeduSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  newGeduName: z.string().min(1),
  productName: z.string().min(1),
});

const gamerMovedNewGeduSchema = z.object({
  geduName: z.string().min(1),
  gamerName: z.string().min(1),
  oldGeduName: z.string().min(1),
  productName: z.string().min(1),
});

// --- Template registry ---

interface TemplateEntry {
  schema: z.ZodType;
  build: (params: Record<string, string>) => string;
  subject: (params: Record<string, string>) => string;
  fromName: string;
}

const templates: Record<string, TemplateEntry> = {
  feedback: {
    schema: feedbackSchema,
    build: (p) => buildFeedbackEmail(p as z.infer<typeof feedbackSchema>),
    subject: () => "New Feedback Received",
    fromName: SENDER_NAME_FEEDBACK,
  },
  groupAdded: {
    schema: geduProductSchema,
    build: (p) => buildGroupAddedEmail(p as z.infer<typeof geduProductSchema>),
    subject: (p) => groupChangeSubjects.groupAdded(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupDeleted: {
    schema: geduProductSchema,
    build: (p) => buildGroupDeletedEmail(p as z.infer<typeof geduProductSchema>),
    subject: (p) => groupChangeSubjects.groupDeleted(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedOldGedu: {
    schema: reassignSchema,
    build: (p) => buildGroupReassignedOldGeduEmail(p as z.infer<typeof reassignSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedOldGedu(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedNewGedu: {
    schema: reassignSchema,
    build: (p) => buildGroupReassignedNewGeduEmail(p as z.infer<typeof reassignSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedNewGedu(p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  groupReassignedParent: {
    schema: parentGamerReassignSchema,
    build: (p) => buildGroupReassignedParentEmail(p as z.infer<typeof parentGamerReassignSchema>),
    subject: (p) => groupChangeSubjects.groupReassignedParent(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedParent: {
    schema: parentGamerReassignSchema,
    build: (p) => buildGamerMovedParentEmail(p as z.infer<typeof parentGamerReassignSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedParent(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedOldGedu: {
    schema: gamerMovedOldGeduSchema,
    build: (p) => buildGamerMovedOldGeduEmail(p as z.infer<typeof gamerMovedOldGeduSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedOldGedu(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
  gamerMovedNewGedu: {
    schema: gamerMovedNewGeduSchema,
    build: (p) => buildGamerMovedNewGeduEmail(p as z.infer<typeof gamerMovedNewGeduSchema>),
    subject: (p) => groupChangeSubjects.gamerMovedNewGedu(p.gamerName, p.productName),
    fromName: SENDER_NAME_ENROLLMENT,
  },
};

const requestSchema = z.object({
  template: z.string(),
  toEmail: z.string().email(),
  params: z.record(z.string()),
});

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send template emails",
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

    const { template: templateName, toEmail, params } = parsed.data;

    const tmpl = templates[templateName];
    if (!tmpl) {
      return NextResponse.json(
        { error: `Unknown template: ${templateName}` },
        { status: 400 },
      );
    }

    const paramsParsed = tmpl.schema.safeParse(params);
    if (!paramsParsed.success) {
      const firstError = (paramsParsed as z.SafeParseError<unknown>).error.errors[0];
      return NextResponse.json(
        { error: `params.${firstError.path.join(".")}: ${firstError.message}` },
        { status: 400 },
      );
    }

    const validatedParams = paramsParsed.data as Record<string, string>;
    const htmlContent = tmpl.build(validatedParams);

    const emailResult = await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: tmpl.fromName,
      toEmail,
      subject: tmpl.subject(validatedParams),
      htmlContent,
    });

    return NextResponse.json({ messageId: emailResult.messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

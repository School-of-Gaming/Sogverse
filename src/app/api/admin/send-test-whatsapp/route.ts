import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendWhatsAppMessage, type WhatsAppMessage } from "@/lib/whatsapp";
import { z } from "zod";

const buttonSchema = z.object({ id: z.string().min(1), title: z.string().min(1).max(20) });
const rowSchema = z.object({ id: z.string().min(1), title: z.string().min(1).max(24), description: z.string().max(72).optional() });
const sectionSchema = z.object({ title: z.string().min(1), rows: z.array(rowSchema).min(1) });

const textSchema = z.object({
  type: z.literal("text"),
  to: z.string().min(1),
  body: z.string().min(1).max(4096),
});

const buttonMsgSchema = z.object({
  type: z.literal("button"),
  to: z.string().min(1),
  body: z.string().min(1).max(1024),
  buttons: z.array(buttonSchema).min(1).max(3),
});

const listSchema = z.object({
  type: z.literal("list"),
  to: z.string().min(1),
  body: z.string().min(1).max(1024),
  buttonText: z.string().min(1).max(20),
  sections: z.array(sectionSchema).min(1).max(10),
});

const requestSchema = z.discriminatedUnion("type", [textSchema, buttonMsgSchema, listSchema]);

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send test WhatsApp messages",
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

    const { to, ...message } = parsed.data;
    const { messageId } = await sendWhatsAppMessage(to, message as WhatsAppMessage);

    return NextResponse.json({ messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

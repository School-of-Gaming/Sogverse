const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;

const GRAPH_URL = `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`;

// --- Message types ---

interface TextMessage {
  type: "text";
  body: string;
}

interface ButtonMessage {
  type: "button";
  body: string;
  buttons: { id: string; title: string }[];
}

interface ListMessage {
  type: "list";
  body: string;
  buttonText: string;
  sections: {
    title: string;
    rows: { id: string; title: string; description?: string }[];
  }[];
}

export type WhatsAppMessage = TextMessage | ButtonMessage | ListMessage;

interface SendResult {
  messageId: string;
}

// --- Send helper ---

export async function sendWhatsAppMessage(
  to: string,
  message: WhatsAppMessage
): Promise<SendResult> {
  // Strip the leading + if present — Meta expects digits only
  const recipient = to.replace(/^\+/, "");

  let payload: Record<string, unknown>;

  switch (message.type) {
    case "text":
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: message.body },
      };
      break;

    case "button":
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          action: {
            buttons: message.buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      };
      break;

    case "list":
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: message.body },
          action: {
            button: message.buttonText,
            sections: message.sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title,
                ...(r.description && { description: r.description }),
              })),
            })),
          },
        },
      };
      break;
  }

  const res = await fetch(GRAPH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message ?? "Unknown WhatsApp API error";
    throw new Error(msg);
  }

  return { messageId: data.messages[0].id };
}


const BREVO_API_BASE = "https://api.brevo.com/v3";

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error("Missing BREVO_API_KEY environment variable");
  }
  return key;
}

async function brevoFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${BREVO_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "api-key": getApiKey(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error("Brevo API error:", response.status, response.statusText, JSON.stringify(body));
    throw new Error(
      body.message || `Brevo API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * A file that travels with the mail, as base64.
 *
 * The provider infers the media type from the file *name*, which is why the
 * name is a required part of the value rather than a nicety: `invite.ics` is
 * what makes a calendar arrive as an invitation a client can act on, and the
 * same bytes under another extension arrive as a file to download.
 */
interface EmailAttachment {
  name: string;
  contentBase64: string;
}

interface SendEmailOptions {
  fromEmail: string;
  fromName: string;
  toEmail: string | string[];
  subject: string;
  htmlContent: string;
  /**
   * The same mail as plain text, for the mails that state one.
   *
   * Not a courtesy fallback: a mail carrying a calendar part is read by
   * Exchange as the source of the calendar entry's *notes*, and with no text
   * part it flattens the HTML into them — markup, tracking pixel and all. See
   * `src/lib/email-templates/CLAUDE.md`.
   */
  textContent?: string;
  replyToEmail?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
}

interface SendEmailResponse {
  messageId: string;
}

export async function sendTransactionalEmail(options: SendEmailOptions): Promise<SendEmailResponse> {
  return brevoFetch("/smtp/email", {
    method: "POST",
    body: JSON.stringify({
      sender: { email: options.fromEmail, name: options.fromName },
      to: (Array.isArray(options.toEmail) ? options.toEmail : [options.toEmail]).map(
        (email) => ({ email })
      ),
      subject: options.subject,
      htmlContent: options.htmlContent,
      ...(options.textContent && { textContent: options.textContent }),
      ...(options.replyToEmail && { replyTo: { email: options.replyToEmail } }),
      ...(options.cc?.length && { cc: options.cc.map((email) => ({ email })) }),
      ...(options.bcc?.length && { bcc: options.bcc.map((email) => ({ email })) }),
      ...(options.attachments?.length && {
        attachment: options.attachments.map(({ name, contentBase64 }) => ({
          name,
          content: contentBase64,
        })),
      }),
    }),
  });
}

const BREVO_API_BASE = "https://api.brevo.com/v3";

function getApiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    throw new Error("Missing BREVO_API_KEY environment variable");
  }
  return key;
}

/**
 * One call to Brevo's API: the response when it succeeded, a thrown error —
 * logged with Brevo's own body — when it did not. Reading the body is the
 * caller's: some endpoints answer a success with none at all.
 */
async function brevoRequest(path: string, options?: RequestInit): Promise<Response> {
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

  return response;
}

async function brevoFetch(path: string, options?: RequestInit) {
  const response = await brevoRequest(path, options);
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

/** A contact attribute's value, as Brevo's contact endpoints take one. */
export type BrevoAttributeValue = string | number | boolean | string[];

interface DoubleOptInContactOptions {
  email: string;
  /**
   * Attribute values by the attribute's name in the Brevo account. Every name
   * has to exist there already: Brevo refuses an unknown one.
   */
  attributes: Record<string, BrevoAttributeValue>;
  /** The lists the contact joins once they confirm. */
  listIds: number[];
  /** The double opt-in confirmation template, which carries `{{ params.DOIurl }}`. */
  templateId: number;
  /** Where the confirmation link sends the contact once they have confirmed. */
  redirectionUrl: string;
}

/**
 * Ask Brevo to confirm an address by double opt-in: Brevo mails the
 * confirmation template to it, and only when its link is followed does the
 * address join the lists, with the attributes given here, and the reader land
 * on `redirectionUrl`. Brevo keeps the record of that consent and handles the
 * unsubscribe; nothing is stored on our side.
 *
 * Brevo answers 201 for a new address and 204 for one it already holds, and
 * both resolve here alike — a caller has no way to tell the two apart, which
 * is what lets a public form give one answer for both. Any other answer
 * throws, logged with Brevo's body.
 */
export async function createDoubleOptInContact(
  options: DoubleOptInContactOptions,
): Promise<void> {
  await brevoRequest("/contacts/doubleOptinConfirmation", {
    method: "POST",
    body: JSON.stringify({
      email: options.email,
      attributes: options.attributes,
      includeListIds: options.listIds,
      templateId: options.templateId,
      redirectionUrl: options.redirectionUrl,
    }),
  });
}

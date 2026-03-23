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

interface SendEmailOptions {
  fromEmail: string;
  fromName: string;
  toEmail: string | string[];
  subject: string;
  htmlContent: string;
  replyToEmail?: string;
  cc?: string[];
  bcc?: string[];
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
      ...(options.replyToEmail && { replyTo: { email: options.replyToEmail } }),
      ...(options.cc?.length && { cc: options.cc.map((email) => ({ email })) }),
      ...(options.bcc?.length && { bcc: options.bcc.map((email) => ({ email })) }),
    }),
  });
}

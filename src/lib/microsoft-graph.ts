const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

const ALLOWED_DOMAINS = ["gamer.sog.gg", "gedu.sog.gg"];

function generatePassword(): string {
  const num = Math.floor(Math.random() * 100).toString().padStart(2, "0");
  return `Sogverse${num}`;
}

async function getAccessToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Azure token: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

type ResetResult =
  | { ok: true; upn: string; password: string }
  | { ok: false; error: string };

/**
 * Reset the password for a username, trying each allowed domain.
 * Returns the UPN that worked and the new temp password.
 */
export async function resetPassword(username: string): Promise<ResetResult> {
  const sanitized = username.trim().toLowerCase();

  if (!sanitized || sanitized.includes("@") || sanitized.includes(" ")) {
    return { ok: false, error: "Invalid username. Provide just the username, not the full email." };
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error("Azure auth error:", e);
    return { ok: false, error: "Failed to authenticate with Azure. Check bot configuration." };
  }

  const password = generatePassword();

  for (const domain of ALLOWED_DOMAINS) {
    const upn = `${sanitized}@${domain}`;
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        passwordProfile: {
          forceChangePasswordNextSignIn: false,
          password,
        },
      }),
    });

    if (response.ok || response.status === 204) {
      return { ok: true, upn, password };
    }

    // 404 = user not found on this domain, try the next one
    if (response.status === 404) continue;

    // Any other error is unexpected — report it
    const text = await response.text();
    console.error(`Graph API error for ${upn}:`, text);
    return { ok: false, error: `Microsoft Graph error: ${response.status}` };
  }

  return {
    ok: false,
    error: `User "${sanitized}" not found on ${ALLOWED_DOMAINS.map((d) => `@${d}`).join(" or ")}.`,
  };
}

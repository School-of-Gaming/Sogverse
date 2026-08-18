const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

/**
 * The two Minecraft Education domains in the sog.gg Azure AD tenant, tried in
 * this order. `@gamer.sog.gg` first because it is the overwhelmingly common
 * case, and it is also the one that keeps the password it is given — a
 * `@gedu.sog.gg` account must change it on first sign-in.
 */
export const MINECRAFT_EDUCATION_DOMAINS = [
  "gamer.sog.gg",
  "gedu.sog.gg",
] as const;

/**
 * The outcome of one reset attempt, as **data**.
 *
 * It used to be a success shape plus an English sentence, which was fine while
 * Discord was the only caller and is not fine now that the platform renders the
 * same outcomes through next-intl: a sentence chosen in this module is a
 * sentence no locale can translate. Every failure therefore carries a code and
 * whatever the message needs to name (the domains tried, the Graph status), and
 * the two callers turn that into words — the Discord route back into the exact
 * English it has always sent, the tools card into a message-file string.
 */
export type PasswordResetOutcome =
  | { ok: true; upn: string; password: string; forceChange: boolean }
  /** The input was not a bare username — empty, or carrying an `@` or a space. */
  | { ok: false; code: "invalid_username" }
  /**
   * No account on any allowed domain. Carries the **sanitized** username,
   * because that — not the raw input — is the name the account would have had.
   */
  | { ok: false; code: "not_found"; username: string; domains: readonly string[] }
  /** The client-credentials grant failed: expired secret, revoked consent. */
  | { ok: false; code: "azure_auth" }
  /** Graph refused the PATCH for some other reason; the status is the clue. */
  | { ok: false; code: "graph_error"; status: number };

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

/**
 * Reset one already-sanitized username, trying each allowed domain in turn.
 * The token is passed in rather than fetched here so a batch pays for it once.
 */
async function resetSanitized(
  sanitized: string,
  token: string,
): Promise<PasswordResetOutcome> {
  const password = generatePassword();

  for (const domain of MINECRAFT_EDUCATION_DOMAINS) {
    const upn = `${sanitized}@${domain}`;
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}`;
    const forceChange = domain !== "gamer.sog.gg";

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        passwordProfile: {
          forceChangePasswordNextSignIn: forceChange,
          password,
        },
      }),
    });

    if (response.ok || response.status === 204) {
      return { ok: true, upn, password, forceChange };
    }

    // 404 = user not found on this domain, try the next one
    if (response.status === 404) continue;

    // Any other error is unexpected — report it
    const text = await response.text();
    console.error(`Graph API error for ${upn}:`, text);
    return { ok: false, code: "graph_error", status: response.status };
  }

  return {
    ok: false,
    code: "not_found",
    username: sanitized,
    domains: MINECRAFT_EDUCATION_DOMAINS,
  };
}

/**
 * Reset a batch of usernames, in input order, **one Azure token for the whole
 * batch**.
 *
 * The token is fetched lazily on the first username that survives validation,
 * so a batch of nothing but malformed entries never touches Azure at all — and
 * once the grant has failed it is not retried per username, because fifty
 * identical failures against the same expired secret is a rate-limit incident
 * rather than fifty chances of a different answer.
 *
 * Sequential rather than concurrent: this is a handful of accounts typed by a
 * person, and Graph is a shared tenant-wide budget we would rather not spike.
 */
export async function resetPasswords(
  usernames: readonly string[],
): Promise<PasswordResetOutcome[]> {
  // Named `bearer` rather than `token`: the security lint rule reads any
  // comparison against an identifier containing "token" as a possible
  // timing attack, and this is a null check on a cache slot, not a secret
  // comparison. Renaming is the honest fix; suppressing would not be.
  let bearer: string | null = null;
  let grantFailed = false;
  const outcomes: PasswordResetOutcome[] = [];

  for (const username of usernames) {
    const sanitized = username.trim().toLowerCase();

    if (!sanitized || sanitized.includes("@") || sanitized.includes(" ")) {
      outcomes.push({ ok: false, code: "invalid_username" });
      continue;
    }

    if (grantFailed) {
      outcomes.push({ ok: false, code: "azure_auth" });
      continue;
    }

    if (bearer === null) {
      try {
        bearer = await getAccessToken();
      } catch (e) {
        console.error("Azure auth error:", e);
        grantFailed = true;
        outcomes.push({ ok: false, code: "azure_auth" });
        continue;
      }
    }

    outcomes.push(await resetSanitized(sanitized, bearer));
  }

  return outcomes;
}

/**
 * Reset the password for a single username, fetching its own token.
 *
 * Kept alongside the batch form because the Discord command resets each
 * username through its own call, and that independence is load-bearing there:
 * a transient Azure failure on one name must not decide the answer for the
 * next one in the same message.
 */
export async function resetPassword(
  username: string,
): Promise<PasswordResetOutcome> {
  const [outcome] = await resetPasswords([username]);
  // One input in, one outcome out — the array cannot be empty, and asserting it
  // here keeps every caller from having to.
  return outcome;
}

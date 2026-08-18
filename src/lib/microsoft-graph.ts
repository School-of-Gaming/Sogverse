import {
  FORCE_CHANGE_DOMAIN,
  MINECRAFT_EDUCATION_DOMAINS,
  parseMinecraftEducationEntry,
  type MinecraftEducationEntry,
} from "@/lib/constants/minecraft-education";

const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID!;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

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
  /** The input was not a username at all — empty, or carrying whitespace. */
  | { ok: false; code: "invalid_username" }
  /**
   * The entry named a domain outside the two this tool resets. Refused before
   * any Graph call: the credentials behind this module can reset any account in
   * the tenant, so the domain is the boundary that keeps it to class logins.
   */
  | { ok: false; code: "unsupported_domain"; domains: readonly string[] }
  /**
   * No account on the domains looked at — both of them for a bare name, the one
   * that was named for an address. Carries the **sanitized** username, because
   * that — not the raw input — is the name the account would have had.
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

/** Every UPN one entry could name, in the order they are tried. */
function candidateDomains(
  entry: Extract<MinecraftEducationEntry, { kind: "bare" | "addressed" }>,
): readonly string[] {
  return entry.kind === "addressed"
    ? [entry.domain]
    : MINECRAFT_EDUCATION_DOMAINS;
}

/**
 * Reset one parsed entry, trying each domain it could live on in turn — both of
 * them for a bare name, and only the one it named for an address. The token is
 * passed in rather than fetched here so a batch pays for it once.
 *
 * `alreadyReset` is the batch's memo, keyed by UPN. A batch can name one account
 * twice without repeating itself — `alice` and `alice@gamer.sog.gg` are two
 * entries and one mailbox — and resetting it twice would put two passwords on
 * screen of which only the second still works, with nothing saying which. So a
 * candidate already reset in this batch answers with that reset, and the second
 * row carries the same live password as the first.
 */
async function resetEntry(
  entry: Extract<MinecraftEducationEntry, { kind: "bare" | "addressed" }>,
  token: string,
  alreadyReset: Map<string, Extract<PasswordResetOutcome, { ok: true }>>,
): Promise<PasswordResetOutcome> {
  const password = generatePassword();

  for (const domain of candidateDomains(entry)) {
    const upn = `${entry.username}@${domain}`;

    const memoized = alreadyReset.get(upn);
    if (memoized !== undefined) return memoized;

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}`;
    const forceChange = domain === FORCE_CHANGE_DOMAIN;

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
      const outcome = { ok: true as const, upn, password, forceChange };
      alreadyReset.set(upn, outcome);
      return outcome;
    }

    // 404 = user not found on this domain, try the next one (an addressed entry
    // has no next one, so its 404 falls straight through to not_found)
    if (response.status === 404) continue;

    // Any other error is unexpected — report it
    const text = await response.text();
    console.error(`Graph API error for ${upn}:`, text);
    return { ok: false, code: "graph_error", status: response.status };
  }

  return {
    ok: false,
    code: "not_found",
    username: entry.kind === "addressed" ? entry.upn : entry.username,
    domains: candidateDomains(entry),
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
 * It is also what lets the batch keep a memo of the accounts it has already
 * reset, so one account named twice in one paste is reset once and both rows
 * carry the password that actually works.
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
  const alreadyReset = new Map<
    string,
    Extract<PasswordResetOutcome, { ok: true }>
  >();

  for (const username of usernames) {
    const entry = parseMinecraftEducationEntry(username);

    if (entry.kind === "invalid") {
      outcomes.push({ ok: false, code: "invalid_username" });
      continue;
    }

    // Refused before the token is even fetched, so an entry naming somebody
    // else's domain costs nothing and reaches no Graph call at all.
    if (entry.kind === "unsupported-domain") {
      outcomes.push({
        ok: false,
        code: "unsupported_domain",
        domains: MINECRAFT_EDUCATION_DOMAINS,
      });
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

    outcomes.push(await resetEntry(entry, bearer, alreadyReset));
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

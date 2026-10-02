/**
 * Where an OAuth authorization will send its code, as the consent page shows it.
 *
 * Client registration is open — any AI app connects with the MCP endpoint's URL
 * alone — so a client's *name* is whatever its registrant typed, and a phishing
 * client can call itself "Claude". What it cannot fake is where the code goes:
 * Supabase delivers it only to a redirect URI the client registered. So that
 * destination is the fact the page leads with, and the one it judges.
 */
export interface RedirectDestination {
  /** What the admin reads: the host, or for an app's own scheme, scheme and host. */
  display: string;
  /** One of the callbacks below, or loopback: shown calmly, without the warning. */
  recognised: boolean;
  /** A port on the admin's own machine, where a command-line AI app listens. */
  loopback: boolean;
}

/**
 * The destinations that get a calm page: each AI app's own OAuth callback,
 * matched on scheme, host (port included) and path exactly.
 *
 * The whole callback, never just the host. Registration is open, so anyone can
 * register a client whose redirect URI is some other path on claude.ai or
 * chatgpt.com, and the app's operator receives the code only at its callback.
 * The list is what each vendor documents (October 2026):
 *
 * - Claude on the web, desktop, mobile and Cowork — one fixed callback.
 * - ChatGPT's connectors — a stable callback where the authorization server
 *   names itself in the authorization response (RFC 9207), and one per
 *   connection, `/connector/oauth/<callback id>`, where it does not.
 * - Cursor — its `cursor://` handler and the hosted callback it registers
 *   beside it. Its usual callback is loopback, recognised below.
 *
 * Anything else still works — the page warns, it never blocks.
 */
const RECOGNISED_CALLBACKS: readonly {
  protocol: string;
  host: string;
  path: string | RegExp;
}[] = [
  { protocol: "https:", host: "claude.ai", path: "/api/mcp/auth_callback" },
  { protocol: "https:", host: "chatgpt.com", path: "/connector_platform_oauth_redirect" },
  { protocol: "https:", host: "chatgpt.com", path: /^\/connector\/oauth\/[\w-]+$/ },
  { protocol: "cursor:", host: "anysphere.cursor-mcp", path: "/oauth/callback" },
  { protocol: "https:", host: "www.cursor.com", path: "/agents/mcp/oauth/callback" },
];

function isRecognisedCallback(url: URL): boolean {
  // Credentials in the authority put a second name in front of the host.
  if (url.username !== "" || url.password !== "") return false;
  return RECOGNISED_CALLBACKS.some(
    ({ protocol, host, path }) =>
      url.protocol === protocol &&
      url.host === host &&
      (typeof path === "string" ? url.pathname === path : path.test(url.pathname)),
  );
}

/**
 * A loopback callback is recognised whatever its port and path. A command-line
 * client (Claude Code, Cursor, a local agent) listens on a port of its own
 * choosing, often a fresh one per sign-in, so no list could name it — and a
 * code sent to the admin's own machine is not one a remote phisher can receive.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Schemes a browser must never be sent to, whatever the server answered. */
const UNSAFE_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:"]);

export function describeRedirectDestination(redirectUri: string): RedirectDestination {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return { display: redirectUri, recognised: false, loopback: false };
  }

  const loopback = url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  const recognised = loopback || isRecognisedCallback(url);
  const isWeb = url.protocol === "https:" || url.protocol === "http:";
  return {
    display: isWeb ? url.hostname : `${url.protocol}//${url.hostname}`,
    recognised,
    loopback,
  };
}

/**
 * Whether the browser may be sent to a URL the authorization server answered
 * with. Supabase already refuses a script scheme at registration; this is the
 * second lock, so the consent page never navigates to one if that ever changes.
 */
export function isNavigableRedirect(value: string): boolean {
  try {
    return !UNSAFE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

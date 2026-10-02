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
  /** One of the destinations below: shown calmly, without the warning. */
  recognised: boolean;
  /** A port on the admin's own machine, where a command-line AI app listens. */
  loopback: boolean;
}

/**
 * The destinations that get a calm page, matched on scheme and exact host.
 *
 * Each is an AI app's own callback, which only that app's operator can receive
 * on: Claude on the web and in its desktop app, ChatGPT's connectors, and
 * Cursor's registered `cursor://` handler. An exact host and never a suffix, so
 * a look-alike subdomain is not admitted by accident. Anything else still
 * works — the page warns, it never blocks.
 */
const RECOGNISED_DESTINATIONS: readonly { protocol: string; hostname: string }[] = [
  { protocol: "https:", hostname: "claude.ai" },
  { protocol: "https:", hostname: "claude.com" },
  { protocol: "https:", hostname: "chatgpt.com" },
  { protocol: "cursor:", hostname: "anysphere.cursor-mcp" },
];

/**
 * A loopback callback is recognised whatever its port. A command-line client
 * (Claude Code, OpenCode, a local agent) listens on a port of its own choosing
 * for each sign-in, so no list could name it — and a code sent to the admin's
 * own machine is not one a remote phisher can receive.
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
  const recognised =
    loopback ||
    RECOGNISED_DESTINATIONS.some(
      (destination) =>
        destination.protocol === url.protocol && destination.hostname === url.hostname,
    );
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

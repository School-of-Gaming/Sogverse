/**
 * The template policy the Tag Manager container runs under: what a template may
 * do once the loader's allowlist has let templates run at all.
 *
 * Client-safe, React-free and pure — a function of the three values the
 * container hands it, so every decision below is a unit test rather than a
 * claim about a browser.
 *
 * **Why a policy exists at all.** The loader admits templates (`sandboxedScripts`
 * in `gtm.allowlist`) so that Meta's and Reddit's gallery tags can run, and
 * Google gives no way to admit one template and not another: there is no
 * per-template id, and a template somebody writes in the Tag Manager UI is the
 * same class as one from the gallery. What a template can do is bounded by the
 * permissions it declares, and those are declared in the same web form. So the
 * fence moves from *which tags* to *what any tag may do*, and that is this
 * function: the container asks it before every permissioned call, and a `false`
 * makes the call throw inside the template.
 *
 * **Default allow, narrowed where code or a recipient could come in.** Google's
 * own tags run through the same checks — the built-in analytics and Google tags
 * declare `configure_google_tags`, `load_google_tags`, `read_event_data` and
 * `read_data_layer`, read off a published container's permission table — so a
 * policy that refused by default would stop measurement in a way nothing here
 * could see. Only the permissions that can load code, reach a new host or touch
 * the page's own globals are narrowed, and each narrowing names exactly what
 * Meta's and Reddit's templates were read to need:
 *
 *   - **`inject_script`** — Google's own hosts, Meta's `fbevents.js`, and
 *     Reddit's generic `pixel.js`. Meta's template (v2.0.9) also injects a
 *     parameter-builder bundle from cdn.jsdelivr.net or unpkg.com when Meta's
 *     side switches a gate on: a public-CDN npm package is refused, which costs
 *     only that bundle, since the template sends its events before it asks.
 *     Reddit's template asks for `pixel.js?pixel_id=…`, which is **refused on
 *     purpose**: that copy carries the Events Manager configuration inline,
 *     past the CSP fence on Reddit's config host. Reddit's events still go out,
 *     because the stub the loader installs fetches the generic library itself
 *     (`@/lib/ad-pixel-stubs`).
 *   - **`send_pixel` and `inject_hidden_iframe`** — Google's hosts and the two
 *     vendors' own transports. Neither vendor template declares either; the
 *     narrowing is there for a template written in the UI.
 *   - **`access_globals`** — the vendors' own globals and Google's queue. A
 *     template granted `execute` on `eval`, or `write` on
 *     `document.body.innerHTML`, is arbitrary JavaScript by another name, which
 *     is exactly what the blocklist keeps out as Custom HTML.
 *   - **`unsafe_run_arbitrary_javascript` and `unsafe_inject_arbitrary_html`** —
 *     refused outright. Only the Custom JavaScript variable and the Custom HTML
 *     tag hold them, and both are already blocklisted; refusing here as well
 *     costs nothing and means a future change to the blocklist cannot reopen
 *     them alone.
 *
 * What a policy cannot reach is everything a template may do *without* a
 * permission check, and everything the vendor's own library does once it is
 * loaded — Meta's library fetches its configuration and plugins from
 * connect.facebook.net by itself, outside any template. Those are bounded by the
 * CSP (`src/proxy.ts`) and by the stubs, not by this function.
 */

/** Domains Google serves its own tags and collectors from, and their subdomains. */
const GOOGLE_DOMAINS = new Set([
  "googletagmanager.com",
  "google-analytics.com",
  "googleadservices.com",
  "googlesyndication.com",
  "doubleclick.net",
  "gstatic.com",
]);

/**
 * Google's own domain under `.com` or a country code (`google.fi`,
 * `google.co.uk`, `google.com.au`): an Ads remarketing tag pings the visitor's
 * country domain, which no fixed list could name.
 */
const GOOGLE_COUNTRY_DOMAIN = /^google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** Whether `hostname` is one of Google's domains or a subdomain of one. */
function isGoogleHost(hostname: string): boolean {
  const labels = hostname.split(".");
  return labels.some((_, index) => {
    const domain = labels.slice(index).join(".");
    return GOOGLE_DOMAINS.has(domain) || GOOGLE_COUNTRY_DOMAIN.test(domain);
  });
}

/**
 * Meta's pixel library, at the path its template injects it from. The locale
 * segment is matched rather than spelled because the library is served under
 * every one Meta supports and the template is free to change which it names.
 */
const META_LIBRARY = /^https:\/\/connect\.facebook\.net\/[a-z]{2}_[A-Z]{2}\/fbevents\.js$/;

/**
 * Reddit's generic library, with no query: the one copy whose configuration
 * fetch the CSP can still refuse.
 */
const REDDIT_LIBRARY = "https://www.redditstatic.com/ads/pixel.js";

/**
 * The two vendors' event transports — where each library reports by image or
 * by fetch, and the only hosts of theirs the CSP names.
 */
const VENDOR_BEACON_HOSTS = new Set(["www.facebook.com", "alb.reddit.com"]);

/**
 * The globals a template may touch. `fbq` and the `_fbq…` family are Meta's
 * (the template reads and writes `_fbq_gtm_ids` and
 * `_fbq_param_builder_status`), `rdt` is Reddit's, and `dataLayer` and `gtag`
 * are Google's own queue and its front door.
 */
function isAdmittedGlobal(key: string): boolean {
  const root = key.split(".")[0];
  return (
    root === "fbq" ||
    root.startsWith("_fbq") ||
    root === "rdt" ||
    root === "dataLayer" ||
    root === "gtag"
  );
}

/**
 * An HTTPS URL, or `null`. A relative URL is refused rather than resolved
 * against the page: nothing a template legitimately loads is on our own origin.
 * A protocol-relative one is read as HTTPS, which is what the page would fetch.
 */
function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value, "https://relative.invalid");
  } catch {
    return null;
  }
  if (url.hostname === "relative.invalid") return null;
  return url.protocol === "https:" ? url : null;
}

/** A field of the permission's data object, read without trusting its shape. */
function field(data: unknown, key: string): unknown {
  if (typeof data !== "object" || data === null) return undefined;
  const value: unknown = Reflect.get(data, key);
  return value;
}

function isAdmittedScript(value: unknown): boolean {
  const url = httpsUrl(value);
  if (url === null) return false;
  if (isGoogleHost(url.hostname)) return true;
  // Compared as written rather than as parsed: a query or a fragment on either
  // vendor's library is a different file, and for Reddit's it is precisely the
  // one this policy exists to refuse.
  return META_LIBRARY.test(String(value)) || value === REDDIT_LIBRARY;
}

function isAdmittedBeacon(value: unknown): boolean {
  const url = httpsUrl(value);
  if (url === null) return false;
  return isGoogleHost(url.hostname) || VENDOR_BEACON_HOSTS.has(url.hostname);
}

/**
 * The policy, in the shape `gtag('policy', 'all', …)` calls it: the container
 * id, the permission being exercised and that permission's data. Answers
 * whether the call may proceed. Every container this document loads is ours,
 * so the id is not consulted.
 *
 * The container also calls it once on registration with the permission
 * `"unknown"` and an empty object, to learn whether the policy refuses
 * everything; that, like any permission not named below, is allowed.
 */
export function containerPolicy(
  _containerId: string,
  permissionId: string,
  data: unknown,
): boolean {
  switch (permissionId) {
    case "inject_script":
      return isAdmittedScript(field(data, "url"));
    case "send_pixel":
    case "inject_hidden_iframe":
      return isAdmittedBeacon(field(data, "url"));
    case "access_globals": {
      const key = field(data, "key");
      return typeof key === "string" && isAdmittedGlobal(key);
    }
    case "unsafe_run_arbitrary_javascript":
    case "unsafe_inject_arbitrary_html":
      return false;
    default:
      return true;
  }
}

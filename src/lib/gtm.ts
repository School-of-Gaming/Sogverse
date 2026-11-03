/**
 * Google Tag Manager, loaded from app code rather than from the copy-paste
 * snippet.
 *
 * Client-safe and React-free: one function that installs the container, the
 * ones that report a page's own events through it (its view, a product page's
 * product view and its click into the sign-up flow), and one that pushes an
 * event the app has already decided to send — so the components above it are
 * only the gates and the effects.
 *
 * **Why not the official snippet.** Google's base code is an inline `<script>`
 * that builds `dataLayer`, announces the container and downloads it the moment
 * it parses — on whatever page the document happens to be, before anything in
 * the app has had a chance to decide that this page may be measured at all.
 * Moving the same work into a function the app calls is what makes "only on a
 * marketing page" expressible: nothing runs until a caller that has checked its
 * gates calls it. It also costs the app a nonce it no longer needs — under the
 * production CSP (`'nonce-…' 'strict-dynamic'`) a script element created by
 * already-trusted app code is trusted, so the insertion below needs nothing
 * named in `script-src`.
 *
 * **A container is not a vendor library, and that is what the fencing is for.**
 * A vendor's library is one company's code doing one company's job. This is a
 * loader for whatever tags somebody configures in the Tag Manager UI — a surface outside
 * this repository, outside code review and outside the deploy. So the order of
 * what happens below is the design: the allow- and blocklists that forbid
 * arbitrary JavaScript and every automatic trigger, then the policy that bounds
 * what a template may do, then the denied-by-default consent signals, then the
 * signals the visitor actually granted, then the Meta and Reddit globals the
 * container's tags will find, and only then the container itself.
 */

import {
  GTM_EVENTS,
  type GtmEvent,
  type GtmProductPageEvent,
} from "@/lib/gtm-events";
import { installAdPixelStubs } from "@/lib/ad-pixel-stubs";
import { containerPolicy } from "@/lib/gtm-policy";
import { isReportableQuery } from "@/lib/marketing-pages";
import { gtmMetaProduct, type MetaProductDetails } from "@/lib/marketing-events";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { sendPageEventTwin } from "@/lib/page-events";
import type { ConsentState } from "@/lib/consent";

const GTM_SRC = "https://www.googletagmanager.com/gtm.js?id=";

/**
 * **The most important lines in this file.**
 *
 * `gtm.allowlist` and `gtm.blocklist` are read by the container as it starts,
 * and a container cannot lift them from the inside, so they are the one
 * control this repository keeps over a surface anybody with Tag Manager access
 * can edit. Every id below is one of Google's own restrict-deployment ids, and
 * how the two lists combine is Google's, read off `gtm.js` itself as well as
 * its documentation (developers.google.com/tag-platform/tag-manager/web/restrict):
 * a blocklist wins over an allowlist; an allowlist admits an item only if its
 * own id is listed or *every* class it belongs to is; and a custom template —
 * every gallery template, Meta's and Reddit's included — belongs to exactly
 * one class, `sandboxedScripts`, which is blocked implicitly the moment any
 * other class is blocklisted unless the allowlist names it.
 *
 * **The allowlist: Google's own, and templates.** `google` is the class every
 * built-in Google tag, trigger and variable belongs to, and it has to be named
 * because an allowlist that exists refuses whatever it does not name.
 * `sandboxedScripts` is what lets the container run Meta's and Reddit's tags:
 * the owner's ruling is that the container is the one place Lynx runs browser
 * ad tags, and both vendors ship theirs only as gallery templates. Admitting
 * the class admits every template, a hand-written one included, and Google has
 * no per-template id — so what a template may *do* is fenced separately, by the
 * policy pushed beside these lists (`@/lib/gtm-policy`).
 *
 * **The blocklist: everything capable of bringing in code or a third party
 * outside a template.** A blocked class covers every tag and variable in it,
 * present and future:
 *
 *   - `customScripts` — capable of running JavaScript supplied through the
 *     container. Without it, adding a tag in a web form is enough to run
 *     arbitrary code on a platform children sign into: no review, no deploy,
 *     nothing in git.
 *   - `html` — Google documents this as an alias of `customScripts`, and it is
 *     also the id of the Custom HTML tag itself. Named anyway, because the
 *     alias is resolved in Google's table rather than in ours.
 *   - `nonGoogleScripts`, `nonGooglePixels`, `nonGoogleIframes`, `customPixels`
 *     — the built-in non-Google tag types (Google's own LinkedIn, Hotjar and
 *     similar tags, and the Custom Image tag), each able to run a script,
 *     request a pixel or inject a frame from a domain the configurer names.
 *     They stay blocked because a template does not belong to any of them, so
 *     blocking them costs Meta's and Reddit's templates nothing: only Meta and
 *     Reddit are admitted, and they arrive as templates.
 *
 *   - `k`, `j` and `d` — the 1st-Party Cookie, JavaScript Variable and DOM
 *     Element variables. Each is in the `google` class the allowlist admits,
 *     and each reads something no tag here needs and a tag could carry away:
 *     the Supabase session cookies are readable by page script, so a cookie
 *     variable fed into any field of an admitted tag sends a parent's session
 *     to that tag's host, and a JavaScript or DOM variable reaches whatever the
 *     page holds, a child's name on a private page included. The policy's
 *     cookie narrowing covers templates; these ids cover the built-ins, which
 *     are fenced only here.
 *
 * `sandboxedScripts` is deliberately *not* here: a blocklist wins, so naming
 * it would undo the allowlist above.
 *
 * The production CSP is `'strict-dynamic'`, which is what makes these lists and
 * the policy the whole control rather than half of one: anything `gtm.js`
 * inserts is transitively trusted by the policy, so a script the container is
 * allowed to add is a script the browser will run.
 *
 * **Every automatic trigger**, the blocklist's other group: `cl` click, `lcl`
 * link click, `fsl` form submit, `tl` timer, `hl` history, `sdl` scroll depth,
 * `evl` element visibility, `jel` JavaScript error and `ytl` YouTube. Each
 * installs a document-wide listener, and each fires with whatever
 * `document.location` holds at that moment. The container is loaded only from a
 * marketing page, but once loaded it stays loaded for every page the visitor
 * reaches afterwards — so a tag on any of these would report the child pages
 * and single-use-token URLs the marketing-page allowlist exists to keep out. A
 * click-tracked call to action is a nice-to-have; a scroll trigger firing on a
 * child's page URL is a breach, so all nine are blocked and a future need for
 * one argues its way back in.
 *
 * **What the browser enforces, and what it does not.** Enforced here: no
 * Custom HTML or Custom JavaScript, no built-in non-Google tag, no cookie,
 * JavaScript or DOM element variable, no automatic trigger; templates only
 * within the policy — scripts only from Google, Meta's `fbevents.js` and
 * Reddit's generic library, beacons and frames only to Google's hosts and the
 * two vendors' transports, globals only the vendors' and Google's, cookies only
 * the vendors' and Google's own ad and analytics ids. Not enforced, and so a constraint on whoever configures
 * the container: *which* templates are added (any template is admitted — a
 * third vendor's can load no library of its own, but one that only reads the
 * page and beacons to an admitted host would run); what each tag's fields
 * send; an analytics tag's *own* enhanced
 * measurement — its page views on history changes, its outbound-click and
 * scroll events — which runs inside the tag rather than on a container
 * trigger, and whose switch lives in the Analytics property where no code here
 * can touch it.
 */
const GTM_ALLOWLIST = ["google", "sandboxedScripts"] as const;

const GTM_BLOCKLIST = [
  "customScripts",
  "html",
  "nonGoogleScripts",
  "nonGooglePixels",
  "nonGoogleIframes",
  "customPixels",
  "k",
  "j",
  "d",
  "cl",
  "lcl",
  "fsl",
  "tl",
  "hl",
  "sdl",
  "evl",
  "jel",
  "ytl",
] as const;

/** `granted` or `denied`, the only two words a consent signal takes. */
type ConsentSignal = "granted" | "denied";

/**
 * The four Consent Mode signals, spelled the way Google reads them.
 *
 * `analytics_storage` covers the measurement cookies; the three `ad_*` signals
 * are advertising, split into storing an identifier at all, sending user data
 * to an ad platform, and using it to personalise. They are three because the
 * platform treats them as three, not because our strip asks three questions —
 * it asks one, and all three follow its answer.
 */
interface ConsentSignals {
  ad_storage: ConsentSignal;
  ad_user_data: ConsentSignal;
  ad_personalization: ConsentSignal;
  analytics_storage: ConsentSignal;
}

/**
 * Everything denied, pushed before the container is appended.
 *
 * This is the state the container starts in no matter what the visitor
 * answered, and the grant below relaxes it a moment later. It matters because
 * of what happens in between: a tag that fires before it has seen any consent
 * state at all assumes it may store, and the default is the only way to say
 * otherwise first. Google requires the pair — a default, then an update — for
 * traffic from the EEA and the UK, and a tag that never saw the default is a
 * tag that stored before anybody said it could.
 */
const ALL_DENIED: ConsentSignals = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
};

/**
 * What a stored answer grants.
 *
 * Every signal follows marketing, `analytics_storage` included. The container
 * is the marketing purpose's recipient and nothing else: `analytics` covers
 * Vercel's cookieless counting alone, so nothing in the container reads it,
 * and a visitor who granted marketing without analytics has still agreed to
 * everything the container stores. The container loads only where marketing
 * is granted, so all four are `granted` every time in practice. They are
 * derived from the answer rather than written as a constant because what
 * travels to Google should be the answer the visitor gave: this function is a
 * statement about the answer, and the gate above it is the statement about who
 * reaches it.
 */
function signalsFor(consent: ConsentState): ConsentSignals {
  const granted: ConsentSignal = consent.marketing ? "granted" : "denied";
  return {
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    analytics_storage: granted,
  };
}

declare global {
  interface Window {
    /**
     * The container's queue. An ordinary array until the container arrives and
     * replaces its `push`, which is why everything below can be pushed before
     * anything has loaded.
     */
    dataLayer?: unknown[];
  }
}

/**
 * Whether the container has been asked for, for the document this module was
 * loaded into. `null` until the first load is asked for; a `dataLayer` left
 * over from an earlier document (tests reset the global) starts the load over.
 */
let containerRequested: Promise<boolean> | null = null;

/**
 * Whether this document has a container coming. Set when the container is
 * requested rather than when it arrives — see `pushGtmEvent`, which is allowed
 * to land in the queue ahead of it — and cleared again if the request fails,
 * because a queue nothing will ever drain is not a container coming.
 */
let armed = false;

/**
 * Google's `gtag`, in Google's own shape: a function that declares no
 * parameters and hands its `arguments` object straight on.
 *
 * The shape is load-bearing rather than stylistic. The container recognises a
 * command by the pushed value being an **`arguments` object**; an ordinary
 * array holding the same three values is merged into the data model as
 * `{0: "consent", 1: "default", …}` and the command is silently lost, which on
 * the wire is indistinguishable from a container that ignores consent.
 *
 * Declaring no parameters is the other half of it. A rest parameter on this
 * same function would leave the `arguments` object to whatever the compiler and
 * the minifier decided to do with the rest binding, in a build nobody reads,
 * where the failure is silent and total. Zero parameters is the form Google
 * ships and the form every toolchain leaves alone; the call sites take their
 * typing from the alias below instead.
 */
function gtagArguments(): IArguments {
  // eslint-disable-next-line prefer-rest-params -- a real `arguments` object is the entire output of this function, and the rest parameters the rule asks for are an Array, which the container merges into its data model instead of reading as a command.
  return arguments;
}

/**
 * The typed front door to the function above. A function of no parameters is
 * assignable to a signature with three, so every call is checked for arity and
 * for the shape of the signals it passes while the function it reaches stays
 * the zero-parameter one.
 */
const gtagCommand: (
  command: "consent",
  stage: "default" | "update",
  signals: ConsentSignals,
) => IArguments = gtagArguments;

/**
 * The same typed front door for the `policy` command, which registers a check
 * the container runs before every permissioned call a template makes. `'all'`
 * rather than one registration per permission, so the decisions sit in one
 * function the tests can call directly (`@/lib/gtm-policy`).
 */
const gtagPolicy: (
  command: "policy",
  permission: "all",
  check: typeof containerPolicy,
) => IArguments = gtagArguments;

/** The two fields gtag reads for the page when it builds an event of its own. */
interface PinnedPage {
  page_location: string;
  page_title: string;
}

/**
 * The same typed front door for the `set` command, which writes into the data
 * model that every later event is read against. It is a second alias rather
 * than a widening of the one above because the arity and the field shape
 * differ; the function it reaches is still the zero-parameter one, so what
 * lands in the queue is a real `arguments` object either way.
 */
const gtagSet: (command: "set", page: PinnedPage) => IArguments = gtagArguments;

/**
 * The title pinned with every page view: a constant, deliberately, rather than
 * `document.title`.
 *
 * The report below is made from an effect that runs just after the route
 * changed, while the App Router updates the document title on a schedule of its
 * own — so reading the title here can capture the *previous* page's, and the
 * previous page may have been a private one naming a child. A constant cannot
 * be wrong at any moment. What it costs is the page-title dimension in
 * analytics, which is a price worth paying: `page_path` is our authoritative
 * identity for a page, and a title could only ever restate it.
 */
const PINNED_PAGE_TITLE = "Sogverse";

/**
 * Pin the page gtag will name in the events it generates for itself.
 *
 * **The defect this prevents.** Every event this app pushes states its own
 * `page_path`, so no tag of ours needs the address bar — but gtag also emits
 * events that pass through no tag at all, `user_engagement` above all, and it
 * fills those from `document.location` and `document.title` at the moment it
 * sends them. A container lives as long as its document, and this app
 * client-navigates without building a new one, so a visitor who arrives on a
 * marketing page and then walks into a signed-in area leaves a loaded container
 * sitting on a private URL. On unload gtag reports the page the tab ended on —
 * which on a gamer page is a child's record id, under a title carrying a
 * child's first name.
 *
 * **Why `set` and not the container's configuration.** Pinning the same two
 * fields in the Google tag's configuration settings was tried on the wire: the
 * settings published correctly and gtag went on reading the live document for
 * its automatic events. `set` writes into the shared data model that every
 * subsequent event is read against, including the ones gtag generates itself,
 * which is the difference between the two.
 *
 * **Sticky by design, and that is what makes refusing to pin the worst of the
 * available answers.** A value written here stands until it is written again,
 * so the question at a call site is never "pin or don't" — it is "which page
 * does the event this app cannot suppress name". Declining to answer does not
 * leave gtag silent; it leaves `document.location` in place, which is the one
 * value we already know we will not stand behind. So this is called as soon as
 * there is a container to pin against, and what it names is the marketing page
 * the caller vetted — a page the visitor genuinely was on, and one we were
 * willing to disclose — whatever the tab has drifted to since.
 *
 * **The query travels with the path, and that is not a widening.** `search` is
 * the query string the marketing-page allowlist approved, captured at the
 * moment of approval: the campaign parameters and click ids an ad link carries,
 * which is what an analytics property derives its attribution from. Dropping
 * them would discard measurement the policy has already blessed while
 * protecting nothing the same policy had not already cleared — and it would do
 * it silently, visible only in a reporting property weeks later.
 *
 * Gated on `armed` like every other push: a value queued for a container that
 * will never arrive is a record of the visit sitting in a global for any later
 * script to read.
 */
function pinGtmPage(internalPath: string, search: string): void {
  if (typeof window === "undefined") return;
  if (!armed) return;
  // Built from the internal path — the same value the page view states —
  // against the document's own origin, so staging and production are one piece
  // of code and no host is written down here. The query is assigned through the
  // parser rather than concatenated, and it is the vetted one handed in rather
  // than a fresh read of the address bar: by now the tab may be carrying a
  // query string nobody ever checked.
  const pinned = new URL(internalPath, window.location.origin);
  pinned.search = search;
  window.dataLayer?.push(
    gtagSet("set", {
      page_location: pinned.href,
      page_title: PINNED_PAGE_TITLE,
    }),
  );
}

/**
 * Install the container and initialise it for `containerId`. Idempotent: a
 * second call returns the first call's promise, so a caller may load on every
 * page it is allowed to report from without tracking whether it has loaded
 * already. Resolves `true` once the container has run, `false` if the browser
 * refused or failed to fetch it (an ad blocker, most often) — in which case
 * there is nothing to measure through and never will be in this document.
 *
 * **No page view here.** Loading and reporting are separate on purpose —
 * Google's snippet fuses them, which is how a page that merely *loads* the
 * container ends up reported. The caller reports, once it knows what page it is
 * on.
 *
 * **Every push happens before the script element is appended**, and the order
 * is load-bearing three times over: the lists and the policy have to be in the
 * queue before the container reads them, the consent defaults have to be in
 * the queue before the container can fire a tag that would otherwise assume it
 * may store, and the vendor globals have to exist before a tag looks for one
 * and, finding none, builds its own without our flags.
 *
 * **The answer travels with the load and is never sent again.** A container
 * loads only for a visitor who granted marketing, and marketing is the only
 * purpose it reads — so the one later change it could need to hear is
 * marketing taken away, and a purpose taken away cannot be sent to a script
 * that has already fired its tags. The strip reloads instead, and the fresh
 * document starts from denied like any other.
 */
export function loadGtm(
  containerId: string,
  consent: ConsentState,
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.dataLayer && containerRequested) return containerRequested;

  const dataLayer = (window.dataLayer ??= []);

  dataLayer.push({
    "gtm.allowlist": [...GTM_ALLOWLIST],
    "gtm.blocklist": [...GTM_BLOCKLIST],
  });
  dataLayer.push(gtagPolicy("policy", "all", containerPolicy));
  dataLayer.push(gtagCommand("consent", "default", ALL_DENIED));
  dataLayer.push(gtagCommand("consent", "update", signalsFor(consent)));
  installAdPixelStubs();
  // The container's own start signal, which the official snippet pushes and
  // which the container's initialisation triggers key on. It says the container
  // is starting and nothing about which page it started on: the page view is a
  // separate event this app pushes for itself, on a page it has checked.
  dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

  const script = document.createElement("script");
  script.async = true;
  script.src = `${GTM_SRC}${encodeURIComponent(containerId)}`;
  containerRequested = new Promise<boolean>((resolve) => {
    script.addEventListener("load", () => resolve(true));
    script.addEventListener("error", () => {
      // Nothing is coming, so nothing may go on being queued for it. Left set,
      // this would keep `pushGtmEvent` appending to a global array no container
      // will ever read — a growing record of a visit, sitting where any later
      // script can find it.
      armed = false;
      resolve(false);
    });
  });
  armed = true;
  document.head.appendChild(script);

  return containerRequested;
}

/**
 * Push an event the caller has already decided to send.
 *
 * Synchronous, and it lands in the queue whether or not the container has
 * arrived yet — which is safe here for one reason and one reason only: **every
 * event states its own `page_path`**. A tag reading that field reports the page
 * the app named when the event happened, so an event sitting in the queue
 * through a navigation is still a true statement when the container finally
 * reads it.
 *
 * **A page view cannot borrow that reasoning**, which is why it has its own
 * function below. What makes an event safe to queue is that its payload is
 * fixed at the moment it is created; what makes a page view unsafe is not the
 * payload at all but the *permission* — the question is whether the tab is
 * still on the page that authorised a report, and that answer expires. So a
 * page view waits for the container, re-reads the address bar, and is dropped
 * rather than queued.
 *
 * Nothing is pushed unless a container is coming. An unarmed push would be a
 * queue that no container will ever drain, and on a page where the gates said
 * no it would be a record of a visit nobody agreed to, sitting in a global for
 * any later script to read. Answers whether it pushed.
 *
 * **Every event is preceded by `{ ecommerce: null }`**, Google's own
 * instruction for ecommerce pushes and the only correct one here. The container
 * merges each push into one data model that keeps whatever it was last told, so
 * without the reset a field one event leaves out reads the previous event's:
 * a queue place would carry the price of the view before it, and a `sign_up`
 * from a page with no product would name the product looked at last. Clearing
 * before every event rather than only before product ones is what makes each
 * event state its product or none, whatever came before it.
 *
 * **A product event also carries `meta`**, the same product in the object
 * Meta's template takes whole (`gtmMetaProduct()` says why there is no Reddit
 * twin). It is reset beside `ecommerce` for the same reason: the data model
 * merges objects and lists key by key, so a `meta` left standing would lend a
 * page view the previous product.
 */
export function pushGtmEvent(event: GtmEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!armed || !window.dataLayer) return false;
  window.dataLayer.push({ ecommerce: null, meta: null }, withVendorFields(event));
  return true;
}

/** The event as pushed: with `meta` beside a product, unchanged without one. */
function withVendorFields(event: GtmEvent): GtmEvent & { meta?: MetaProductDetails } {
  if (!("ecommerce" in event) || event.ecommerce === null) return event;
  return { ...event, meta: gtmMetaProduct(event.ecommerce) };
}

/**
 * Whether this document has a container coming — for a caller with work to do
 * before it could push (a read, say) that is wasted where nothing will ever
 * take the push. `pushGtmEvent` still decides for itself; this only lets a
 * caller skip the preparation.
 */
export function isGtmArmed(): boolean {
  return armed;
}

/**
 * What loading the container needs: its id, and the visitor's stored answer
 * the Consent Mode signals are derived from. A caller holds one only when the
 * visitor-level gates have all said yes.
 */
export interface GtmGate {
  containerId: string;
  consent: ConsentState;
}

/**
 * Report a product page's own event — the product view — once the container
 * has arrived, through every check the page view goes through: the query that
 * may travel, a route of ours, and the address bar re-read at the moment of
 * sending. The id is minted here, at the push, and the path is the page's own.
 */
export async function reportGtmProductEvent(
  gate: GtmGate,
  pathname: string,
  event: GtmProductPageEvent,
): Promise<void> {
  await reportOnPage(gate, pathname, (pagePath) => ({
    ...event,
    event_id: crypto.randomUUID(),
    page_path: pagePath,
  }));
}

/**
 * Push a product page's click event now, or not at all — answering whether it
 * went out, so a click that was dropped leaves the page's once-only report
 * unspent.
 *
 * The click usually navigates, so this never loads the container and never
 * waits for it. The push itself does not need a vendor library's stricter rule
 * of dropping the event while the library is still downloading — a push states
 * its own page, so it is safe in the queue (`pushGtmEvent`), and the Meta and
 * Reddit globals apply that rule to whatever a tag hands them
 * (`@/lib/ad-pixel-stubs`). What it does need is the same
 * address-bar check the views get, made now, while the click is still on the
 * page that authorised it.
 */
export function pushGtmProductEventNow(
  pathname: string,
  event: GtmProductPageEvent,
): boolean {
  if (typeof window === "undefined") return false;
  const pagePath = authorisedPagePath(pathname);
  if (pagePath === null) return false;
  return pushWithServerTwin({
    ...event,
    event_id: crypto.randomUUID(),
    page_path: pagePath,
  });
}

/**
 * Push one of the browser's own moments and, once it has gone out, hand it to
 * the server for its Conversions API twin (`@/lib/page-events`). Called only
 * once the caller's address-bar check has passed, so the address bar is still
 * the page that authorised the push and its query the one that was vetted.
 */
function pushWithServerTwin(event: GtmEvent): boolean {
  if (!pushGtmEvent(event)) return false;
  sendPageEventTwin(
    event,
    `${window.location.pathname}${window.location.search}`,
  );
  return true;
}

/**
 * The internal path of `pathname` if the tab is still on it with a query that
 * may travel and it is a route of ours — `null` when any of that fails.
 */
function authorisedPagePath(pathname: string): string | null {
  // Both sides resolved through the URL parser, so a slug with a non-ASCII
  // character compares the same whether the router hands it over encoded or
  // not.
  const authorised = new URL(pathname, window.location.origin).pathname;
  if (window.location.pathname !== authorised) return null;
  if (!isReportableQuery(window.location.search)) return null;
  const { pathname: internalPath, template } = normalizeExternalPath(pathname);
  return template === null ? null : internalPath;
}

/**
 * Report a page view of `pathname`, the page the caller has already checked
 * against the marketing-page allowlist.
 *
 * The report goes out only once the container has arrived, and only if the tab
 * is still on that pathname with a query string that may travel — re-read from
 * the address bar at that moment, because a container downloads for a few
 * hundred milliseconds and a visitor can client-navigate out of a shop page
 * into a child's page inside that window. A visitor who moved on gets no report
 * for the page they left, and none for the page they reached: the caller
 * reports that one, or refuses it, on its own terms.
 *
 * The raw pathname is what arrives here, because the address-bar comparison has
 * to be made against what the address bar actually holds. What travels is the
 * **internal path** — locale prefix removed and the slug untranslated, with the
 * record's own id kept — which is the value every other event states too, so a
 * view and the enrolment that followed it name one page rather than two.
 *
 * **The pin for gtag's own events sits ahead of those re-checks, on purpose.**
 * The checks decide whether a *report* may be sent; the pin decides which page
 * the events this app cannot suppress will name, and that is a different
 * question settled on different grounds. By the time the checks run the
 * container is in the document and gtag's engagement timer is already running,
 * so a return with nothing pinned does not withhold a page — it leaves the live
 * document as the answer, which is the leak this file exists to close, arriving
 * through the one window the report guards cannot cover. Pinning the vetted
 * marketing path instead costs exactly one thing, and it is accepted:
 * engagement time spent on a private page is attributed to the marketing page
 * the visitor came from. The alternative is naming the private page.
 */
export async function reportGtmPageView(
  containerId: string,
  pathname: string,
  consent: ConsentState,
): Promise<void> {
  await reportOnPage({ containerId, consent }, pathname, (pagePath) => ({
    event: GTM_EVENTS.pageView,
    event_id: crypto.randomUUID(),
    page_path: pagePath,
  }));
}

/**
 * The checks every event reported from a page goes through — the page view's
 * docblock above is the reasoning — with the event built from the page's
 * internal path once they have all passed.
 */
async function reportOnPage(
  { containerId, consent }: GtmGate,
  pathname: string,
  build: (pagePath: string) => GtmEvent,
): Promise<void> {
  // Checked before loading as well as before sending: a page whose query may
  // not travel gets no container at all, not merely no report. The proxy's
  // bounce to the login page is the case — a marketing page by pathname,
  // carrying a private path in its query.
  const authorisedSearch = window.location.search;
  if (!isReportableQuery(authorisedSearch)) return;
  // A URL matching no route of ours is the last thing that should be reported
  // anywhere, and a null template is how the normalizer says so. The caller's
  // allowlist check has already refused it; this is the function standing on
  // its own.
  const { pathname: internalPath, template } = normalizeExternalPath(pathname);
  if (template === null) return;
  const ready = await loadGtm(containerId, consent);
  if (!ready) return;
  // Before the re-checks below, never after them — the docblock says why, and
  // tidying it down under the guards reopens the leak the pin exists to close.
  // The query handed over is the one approved at the top of this function, not
  // a fresh read: the address bar is exactly what has stopped being trusted by
  // the time these lines run.
  pinGtmPage(internalPath, authorisedSearch);
  // Both sides resolved through the URL parser, so a slug with a non-ASCII
  // character compares the same whether the router hands it over encoded or
  // not.
  const authorised = new URL(pathname, window.location.origin).pathname;
  if (window.location.pathname !== authorised) return;
  if (!isReportableQuery(window.location.search)) return;
  pushWithServerTwin(build(internalPath));
}

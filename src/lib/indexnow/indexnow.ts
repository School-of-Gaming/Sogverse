import "server-only";
import { after } from "next/server";
import { isProductionDeployment } from "@/lib/seo/deployment";

/*
 * **IndexNow — telling search engines the moment a public page changes.**
 * One POST of the changed URLs to the shared endpoint reaches every engine in
 * the protocol (Bing, Yandex, Seznam, Naver and others; Bing's index is what
 * ChatGPT's and Copilot's search read). Google is not among them, and reads
 * the sitemap's `lastmod` instead.
 *
 * Proof that a submission is ours is a key the site serves as a text file on
 * its own host: `/indexnow-key.txt`, rewritten to the key route under
 * `src/app/api/indexnow/key/` (`next.config.ts`), named in every submission as
 * `keyLocation`. At the root, so it vouches for every URL on the host.
 */

/** The protocol's shared endpoint, which forwards to every participating engine. */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Where the key file is served, at the site root. */
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/** How long a submission may take before it is given up on. */
const SUBMIT_TIMEOUT_MS = 5000;

/** The protocol's key shape: 8 to 128 letters, digits and dashes. */
const KEY_SHAPE = /^[A-Za-z0-9-]{8,128}$/;

/**
 * The configured key, or null when `INDEXNOW_KEY` is unset or not a key the
 * protocol accepts — which the key route answers with a 404 and a submission
 * with a skip.
 */
export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  return KEY_SHAPE.test(key) ? key : null;
}

/** What a submission needs: the key, and the site whose URLs it vouches for. */
export interface IndexNowTarget {
  key: string;
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL` — the key file's host. */
  siteUrl: string;
}

/**
 * Where submissions go, or null — with a log line saying why — when none
 * should be made: **off production**, because only the production site's URLs
 * may be pushed into a search index and every other deployment shares its
 * code; and **with no usable key**, the state of every environment until one
 * is set. Asked before anything is read for a submission, so a deployment
 * that never submits never pays for the reads.
 */
export function indexNowTarget(): IndexNowTarget | null {
  if (!isProductionDeployment()) {
    console.info("[indexnow] skipped: not the production deployment");
    return null;
  }
  const key = indexNowKey();
  if (key === null) {
    console.info("[indexnow] skipped: INDEXNOW_KEY is unset or not a valid key");
    return null;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!URL.canParse(siteUrl)) {
    console.error("[indexnow] skipped: NEXT_PUBLIC_SITE_URL is not a URL");
    return null;
  }
  return { key, siteUrl };
}

/**
 * **Submit changed URLs, and never fail.** Every outcome — an engine's
 * refusal, a timeout, a network error — is logged and swallowed: a search
 * engine hearing about a change late is a small loss, and the change itself
 * has already happened. A 200 or a 202 (key check pending) is success. URLs
 * are sent once each, in order; an empty set sends nothing.
 */
export async function submitToIndexNow(
  target: IndexNowTarget,
  urls: readonly string[],
): Promise<void> {
  const urlList = [...new Set(urls)];
  if (urlList.length === 0) return;
  const host = new URL(target.siteUrl).host;
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: target.key,
        keyLocation: `${target.siteUrl}${INDEXNOW_KEY_PATH}`,
        urlList,
      }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
    if (response.ok) {
      console.info(`[indexnow] submitted ${urlList.length} URL(s): ${response.status}`);
    } else {
      console.error(
        `[indexnow] the submission of ${urlList.length} URL(s) was refused: ${response.status}`,
      );
    }
  } catch (error) {
    console.error("[indexnow] the submission failed:", error);
  }
}

/** One live address, and the id of the item it shows. */
export type LiveAddress = readonly [url: string, owner: string];

/**
 * The URLs a change of what is live touches: every address that went away,
 * appeared or now shows a different item across the whole live set
 * (`beforeAll` against `afterAll` — a change can move another item's address
 * too, and hand one item's address to another), every address of the item
 * changed as it now stands (its content changed even where its address did
 * not), and the index pages that list it.
 */
export function changedUrls({
  beforeAll,
  afterAll,
  item,
  indexes,
}: {
  beforeAll: readonly LiveAddress[];
  afterAll: readonly LiveAddress[];
  /** The changed item's addresses after the change; none once it is unpublished. */
  item: readonly string[];
  indexes: readonly string[];
}): string[] {
  const before = new Map(beforeAll);
  const after = new Map(afterAll);
  const moved = (from: Map<string, string>, to: Map<string, string>) =>
    [...from].flatMap(([url, owner]) => (to.get(url) === owner ? [] : [url]));
  return [...new Set([...moved(before, after), ...moved(after, before), ...item, ...indexes])];
}

/**
 * Run a publish or an unpublish, then tell IndexNow what it changed.
 *
 * `snapshot` reads what is live — once before the change, once after — and
 * returns the URLs to compare; it is called only when a submission will be
 * made. Both reads run inside the request, on its own client; the submission
 * itself is sent **after the response**, through `after()`, so the third-party
 * round trip never holds up the admin's publish. **The change is the only
 * thing here that may fail the call**: a refusal from the change propagates
 * exactly as the change raised it, and every failure after it is logged and
 * swallowed — the deferred submission's included. A failed read before the
 * change is logged and read as nothing live, so the submission still carries
 * every address live after it.
 */
export async function changeAndSubmit<Snapshot>({
  label,
  change,
  snapshot,
  urls,
}: {
  label: string;
  change: () => Promise<void>;
  snapshot: () => Promise<Snapshot>;
  urls: (before: Snapshot | null, after: Snapshot, siteUrl: string) => string[];
}): Promise<void> {
  const target = indexNowTarget();
  const before =
    target === null
      ? null
      : await snapshot().catch((error: unknown) => {
          console.error(`[indexnow] ${label}: what was live was not read:`, error);
          return null;
        });

  await change();
  if (target === null) return;

  let urlList: string[];
  try {
    urlList = urls(before, await snapshot(), target.siteUrl);
  } catch (error) {
    console.error(`[indexnow] ${label}: nothing was submitted:`, error);
    return;
  }
  after(() => submitToIndexNow(target, urlList));
}

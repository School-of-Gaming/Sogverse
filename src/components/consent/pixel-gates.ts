import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
// The RAW pathname, deliberately, and for both halves of what this does. The
// wrapped `usePathname` answers with the internal *template*, which would make
// every product page the same string — so a visitor walking from one product to
// the next would report one page view between them. This is also the value the
// normalizer is written for: it takes what is in the address bar
// (`/fi/kauppa/abc`) and answers with the template.
import { usePathname } from "next/navigation";
import { isMarketingPage } from "@/lib/marketing-pages";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";
import { useAuth } from "@/providers/auth-provider";
import { useConsent } from "./consent-provider";

/**
 * The gates and the counting every browser pixel shares — the Meta Pixel's and
 * the Reddit Pixel's — so a gate added here is a gate on both. What differs
 * per vendor is only which id is configured and how its library is called,
 * and each pixel's component passes those in.
 */

const subscribeToNothing = () => () => {};

/**
 * Whether this render is in a browser. A server render, and the hydration
 * render that has to agree with it, read false; every client render after that
 * reads true. An external store rather than a flag set in an effect, so the
 * switch is React's own post-hydration re-render.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * The first three gates, which hold for the visitor rather than for a vendor
 * or a page: the visitor has said yes to marketing, this is a client render,
 * and the visitor is not — and cannot be — a signed-in gamer. The fourth, a
 * configured id, is each pixel's own; the last two, the allowlist and the
 * address bar, belong to each report.
 */
export function useMayReachAdvertising(): boolean {
  const { consent } = useConsent();
  const { user, profile, isLoading } = useAuth();
  const isClient = useIsClient();

  // **A signed-in visitor whose profile we could not read counts as a possible
  // gamer.** The rule is by who is signed in rather than by URL, so a child's
  // browsing never reaches an ad platform on any surface, whatever a parent once
  // answered on a shared device — and the doubt is resolved in the safe
  // direction: anonymous is fine, a known non-gamer is fine, and anything else
  // (still loading, or signed in with no profile) is not.
  const isNotAGamer =
    !isLoading &&
    (user === null || (profile !== null && profile.role !== "gamer"));

  return isClient && consent?.marketing === true && isNotAGamer;
}

/**
 * Report `report` once per marketing page reached, through `send`, behind all
 * six gates — `pixelId` is `null` whenever one of the first four is shut.
 * `null` as the report is "nothing to report on this page yet": it neither
 * reports nor counts the page as reached, so the report goes out once it stops
 * being `null`.
 *
 * `send` is the vendor's awaiting reporter, which loads its library on first
 * need and re-reads the address bar once it has arrived. It must be a stable
 * function — a module-level one — since a new one would be a new effect.
 */
export function usePixelReportPerPage<Report>(
  pixelId: string | null,
  report: Report | null,
  send: (pixelId: string, pathname: string, report: Report) => Promise<void>,
): void {
  const pathname = usePathname();
  /** The last pathname this effect has seen, reported or not. */
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (pixelId === null || report === null) return;

    // One report per marketing page *reached*, which is not the same as per
    // render and not the same as per distinct page: a re-render reports nothing,
    // and coming back to a page after another one is a second view of it. The
    // ref is updated for every pathname the effect accepts, marketing or not,
    // which is what makes the return trip a new view rather than a repeat.
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;

    const { template } = normalizeExternalPath(pathname);
    if (!isMarketingPage(template)) return;

    // Fire and forget: it cannot throw, and nothing here waits on it.
    void send(pixelId, pathname, report);
  }, [pathname, pixelId, report, send]);
}

/**
 * The function a click calls to report `report` through `sendNow`, the
 * vendor's synchronous reporter — once per page reached, and only when it
 * actually went out, so a click dropped because the library had not arrived
 * leaves the page's report unspent. `pixelId` is `null` whenever one of the
 * first four gates is shut; the allowlist is checked here and the address bar
 * by `sendNow`.
 */
export function usePixelClickReport<Report>(
  pixelId: string | null,
  report: Report | null,
  sendNow: (pathname: string, report: Report) => boolean,
): () => void {
  const pathname = usePathname();
  /** The page this hook has already reported from. */
  const reportedOn = useRef<string | null>(null);

  // A different page is a new page reached, even when this hook outlives the
  // move — so the guard is cleared on every pathname, including a return to
  // the page it was last set for.
  useEffect(() => {
    reportedOn.current = null;
  }, [pathname]);

  return useCallback(() => {
    if (pixelId === null || report === null) return;
    if (reportedOn.current === pathname) return;
    const { template } = normalizeExternalPath(pathname);
    if (!isMarketingPage(template)) return;
    if (sendNow(pathname, report)) reportedOn.current = pathname;
  }, [pixelId, report, pathname, sendNow]);
}

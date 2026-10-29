"use client";

import { useMemo } from "react";
import {
  isAdvertisedProduct,
  isValidRedditPixelId,
  REDDIT_PIXEL_EVENTS,
  redditProductDetails,
} from "@/lib/marketing-events";
import {
  reportRedditEvent,
  reportRedditEventNow,
  type RedditBrowserEvent,
} from "@/lib/reddit-pixel";
import {
  useMayReachAdvertising,
  usePixelClickReport,
  usePixelReportPerPage,
} from "./pixel-gates";

/** One object for the life of the module, so the effect never sees a new one. */
const PAGE_VIEW: RedditBrowserEvent = { event: REDDIT_PIXEL_EVENTS.pageView };

/**
 * The Reddit Pixel: every event the Meta Pixel sends, at the same moments,
 * behind the same six gates from the same hooks (`./pixel-gates`) — marketing
 * consent, a client render, not a gamer, a configured id, a marketing page,
 * and the address bar re-read at the moment of sending.
 *
 * An unset `NEXT_PUBLIC_REDDIT_PIXEL_ID` means the pixel is simply off. The id
 * is public and non-secret: it names the advertiser account, and the library
 * ships it to the browser anyway. No `<noscript><img>` fallback, for the
 * reason the Meta Pixel has none: its whole audience is visitors who cannot
 * run the consent banner.
 */
export function RedditPixel() {
  useRedditPixelReport(PAGE_VIEW);
  return null;
}

/**
 * A product view, reported from the product's own page — once per page
 * reached, once the product has been read, and only for a product we
 * advertise. Mounted beside the Meta Pixel's product view, for the same page.
 */
export function RedditProductView({
  product,
}: {
  /** `null` while the product has not been read yet. */
  product: ReportedProduct | null;
}) {
  const report = useMemo(
    () => productReport(REDDIT_PIXEL_EVENTS.productView, product),
    [product],
  );
  useRedditPixelReport(report);
  return null;
}

/** A product as the two product events read it. */
type ReportedProduct = Parameters<typeof redditProductDetails>[0] &
  Parameters<typeof isAdvertisedProduct>[0];

/**
 * A product event for `product`, or `null` — "nothing to report" — while it is
 * unread and for a product we do not advertise.
 */
function productReport(
  event:
    | typeof REDDIT_PIXEL_EVENTS.productView
    | typeof REDDIT_PIXEL_EVENTS.checkout,
  product: ReportedProduct | null,
): RedditBrowserEvent | null {
  return product !== null && isAdvertisedProduct(product)
    ? { event, product: redditProductDetails(product) }
    : null;
}

/**
 * The checkout start, as Reddit's `AddToCart`: the function to call from the
 * click that starts signing up for a product. Sent inside the click or not at
 * all — never loading the library, never queued, never holding up the
 * navigation — and once per product page reached, exactly as the Meta Pixel's.
 *
 * Call it from the component that stays mounted for the page's whole life, so
 * its once-per-page guard is not reset by a remount.
 */
export function useRedditCheckoutStart(
  product: ReportedProduct | null,
): () => void {
  const report = useMemo(
    () => productReport(REDDIT_PIXEL_EVENTS.checkout, product),
    [product],
  );
  return usePixelClickReport(
    useRedditPixelGate(),
    report,
    reportRedditEventNow,
  );
}

/** The first four gates: the pixel id when all of them hold, `null` otherwise. */
function useRedditPixelGate(): string | null {
  const allowed = useMayReachAdvertising();
  const rawPixelId = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
  const pixelId = isValidRedditPixelId(rawPixelId) ? rawPixelId : null;
  return allowed ? pixelId : null;
}

/** Report `report` once per marketing page reached, behind all six gates. */
function useRedditPixelReport(report: RedditBrowserEvent | null): void {
  usePixelReportPerPage(useRedditPixelGate(), report, reportRedditEvent);
}

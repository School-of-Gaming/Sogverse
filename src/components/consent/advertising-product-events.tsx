"use client";

import { useCallback } from "react";
import { GtmProductView, useGtmCheckoutStart } from "./google-tag-manager";
import { MetaProductView, useMetaCheckoutStart } from "./meta-pixel";
import { RedditProductView, useRedditCheckoutStart } from "./reddit-pixel";

type ReportedProduct = Parameters<typeof MetaProductView>[0]["product"] &
  Parameters<typeof RedditProductView>[0]["product"] &
  Parameters<typeof GtmProductView>[0]["product"];

/**
 * A product page's view, told to every pixel and to the container — so the
 * page names one thing and a recipient added later is added here, not on the
 * page. Each keeps its own gates and its own once-per-page guard.
 */
export function AdvertisingProductView({
  product,
}: {
  /** `null` while the product has not been read yet. */
  product: ReportedProduct;
}) {
  return (
    <>
      <MetaProductView product={product} />
      <RedditProductView product={product} />
      <GtmProductView product={product} />
    </>
  );
}

/**
 * A product page's checkout start, told to every pixel and to the container
 * from one click. Each decides for itself whether it may send — one pixel's
 * library still downloading drops that pixel's event and no other's.
 */
export function useAdvertisingCheckoutStart(
  product: ReportedProduct,
): () => void {
  const reportToMeta = useMetaCheckoutStart(product);
  const reportToReddit = useRedditCheckoutStart(product);
  const reportToGtm = useGtmCheckoutStart(product);
  return useCallback(() => {
    reportToMeta();
    reportToReddit();
    reportToGtm();
  }, [reportToMeta, reportToReddit, reportToGtm]);
}

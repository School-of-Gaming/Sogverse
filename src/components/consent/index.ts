/**
 * Cookie consent: the question, the answer, and everything gated on it.
 *
 * `ConsentProvider` holds the answer (seeded on the server by
 * `getServerConsent()` from `@/lib/consent.server`); `ConsentBanner` asks;
 * `AnalyticsScripts`, `MetaPixel`, `RedditPixel` and `GoogleTagManager` are the
 * four things the answer switches on, and `AdvertisingProductView` and
 * `useAdvertisingCheckoutStart` tell every pixel about a product page; `PrivacyChoicesLink` is the way back to the question.
 */
export { AnalyticsScripts } from "./analytics-scripts";
export { ConsentBanner } from "./consent-banner";
export {
  ConsentBannerView,
  type ConsentBannerPlacement,
} from "./consent-banner-view";
export {
  ConsentProvider,
  useConsent,
  useConsentOptional,
} from "./consent-provider";
export {
  AdvertisingProductView,
  useAdvertisingCheckoutStart,
} from "./advertising-product-events";
export { GoogleTagManager } from "./google-tag-manager";
export { PrivacyChoicesLink } from "./privacy-choices-link";
export {
  MetaPixel,
  MetaProductView,
  useMetaCheckoutStart,
} from "./meta-pixel";
export {
  RedditPixel,
  RedditProductView,
  useRedditCheckoutStart,
} from "./reddit-pixel";

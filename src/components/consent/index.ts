/**
 * Cookie consent: the question, the answer, and everything gated on it.
 *
 * `ConsentProvider` holds the answer (seeded on the server by
 * `getServerConsent()` from `@/lib/consent.server`); `ConsentBanner` asks;
 * `AnalyticsScripts` and `GoogleTagManager` are the two things the answer
 * switches on, and `GtmProductView` and `useGtmCheckoutStart` tell the
 * container about a product page; `PrivacyChoicesLink` is the way back to the
 * question.
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
  GoogleTagManager,
  GtmProductView,
  useGtmCheckoutStart,
} from "./google-tag-manager";
export { PrivacyChoicesLink } from "./privacy-choices-link";

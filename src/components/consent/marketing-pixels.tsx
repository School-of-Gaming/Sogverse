"use client";

import Script from "next/script";
import { CONVERSION_COOKIE_NAME, REGISTRATION_CONVERSION } from "@/lib/consent";
import { useAuth } from "@/providers/auth-provider";
import { useConsent } from "./consent-provider";

/**
 * The Meta Pixel's official base snippet, with the queueing stub that makes an
 * `fbq(…)` call safe before the real library has finished loading.
 *
 * **`fbq('set','autoConfig',false,…)` comes before `init`, and it is the whole
 * of what makes our privacy copy true.** Left at its default, the pixel takes
 * its behaviour from the Meta Ads dashboard, where Automatic Advanced Matching
 * and automatic events can be switched on by anyone with access to the ad
 * account: the library then scrapes form fields and button clicks on the page
 * and hashes what it finds — email addresses, phone numbers, names — into every
 * event. We tell families that Meta learns they visited and whether they created
 * an account, and nothing else; a setting in somebody else's dashboard must not
 * be able to make that sentence false, so it is turned off here, in the page,
 * before the pixel is initialised. It has to precede `init` because that is when
 * the library reads the flag.
 */
function metaPixelSnippet(pixelId: string): string {
  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('set','autoConfig',false,'${pixelId}');fbq('init','${pixelId}');fbq('track','PageView');`;
}

/**
 * TikTok's official base snippet, same shape: define a queueing `ttq`, then
 * load the real events library and report the page.
 */
function tiktokPixelSnippet(pixelId: string): string {
  return `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{},n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${pixelId}');ttq.page()}(window,document,'ttq');`;
}

/**
 * The registration conversion, reported to whichever pixels are on this page.
 *
 * **It reads and clears the marker cookie itself, inside the script**, rather
 * than in a React effect, and that is a decision worth keeping. `next/script`
 * gives no usable "this inline snippet has run" callback — for an inline
 * script it fires `onReady` *before* appending the element — so the only thing
 * that reliably orders this after both stubs is being a third
 * `afterInteractive` script, appended after them. Once it is that, doing the
 * cookie work in React buys nothing and costs a state update in an effect.
 *
 * Clearing the cookie first is what makes it fire exactly once: a later page
 * view finds nothing to report. The `window.x &&` guards are for the case
 * where only one of the two pixels is configured.
 */
const REGISTRATION_CONVERSION_SNIPPET = `(function(){if(document.cookie.indexOf('${CONVERSION_COOKIE_NAME}=${REGISTRATION_CONVERSION}')===-1)return;document.cookie='${CONVERSION_COOKIE_NAME}=;path=/;max-age=0';window.fbq&&window.fbq('track','CompleteRegistration');window.ttq&&window.ttq.track('CompleteRegistration');})();`;

interface MarketingPixelsProps {
  /**
   * The proxy's per-request CSP nonce (`x-nonce`). Production `script-src` is
   * `'nonce-…' 'strict-dynamic'`, so the nonce is what lets these inline
   * snippets run — and `strict-dynamic` is what lets the scripts they insert
   * load without either vendor host being named in the policy.
   */
  nonce: string;
}

/**
 * The Meta and TikTok pixels — the only scripts on the site that exist to serve
 * somebody other than the visitor, and therefore the ones with the most gates
 * in front of them. All three must hold:
 *
 *   1. the visitor has said yes to marketing;
 *   2. the visitor is not a signed-in gamer;
 *   3. the platform's id is configured at all.
 *
 * An unset `NEXT_PUBLIC_*_PIXEL_ID` means that pixel is simply off, which is
 * what every non-production environment gets by default. Both ids are public,
 * non-secret values — they identify the advertiser account, and the snippet
 * ships them to the browser anyway.
 *
 * Deliberately no `<noscript><img>` fallback. Meta's is a bare tracking pixel
 * in markup: it fires on render, before and regardless of any consent logic,
 * which is precisely the thing this component exists to prevent.
 */
export function MarketingPixels({ nonce }: MarketingPixelsProps) {
  const { consent } = useConsent();
  const { profile, isLoading } = useAuth();

  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const tiktokPixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

  // One rule, by who is signed in rather than by URL: marketing consent is on
  // this device, and the visitor is either anonymous or not a gamer. A child's
  // browsing never reaches an ad platform, on their own surface or on the
  // public shop, whatever a parent once clicked on a shared device. Until the
  // profile is known nothing mounts — the doubt is resolved in the safe
  // direction — and the pixels on the page after registration still fire the
  // conversion, since the new account is a customer.
  const allowed =
    consent?.marketing === true && !isLoading && profile?.role !== "gamer";

  if (!allowed) return null;
  if (!metaPixelId && !tiktokPixelId) return null;

  return (
    <>
      {metaPixelId ? (
        <Script id="meta-pixel" nonce={nonce} strategy="afterInteractive">
          {metaPixelSnippet(metaPixelId)}
        </Script>
      ) : null}
      {tiktokPixelId ? (
        <Script id="tiktok-pixel" nonce={nonce} strategy="afterInteractive">
          {tiktokPixelSnippet(tiktokPixelId)}
        </Script>
      ) : null}
      {/* Last, and it has to stay last: it calls into the globals the two
          snippets above define, and `next/script` appends inline scripts in
          render order. */}
      <Script
        id="pixel-registration-conversion"
        nonce={nonce}
        strategy="afterInteractive"
      >
        {REGISTRATION_CONVERSION_SNIPPET}
      </Script>
    </>
  );
}

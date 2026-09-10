import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL!;

/**
 * The prefixes no crawler is invited into — the four role dashboards and
 * settings. They are all behind a login, so this is tidiness rather than a
 * control; the controls are the proxy's role gates and RLS.
 *
 * **Their segments are English in every locale** (dashboards are app surfaces,
 * not indexable content), so only the locale prefix varies — which is exactly
 * why the prefixed variants are derived from the locale list below instead of
 * being written out five times each. A locale added to `SUPPORTED_LOCALES`
 * would otherwise leave `/es/admin` crawlable with nothing to notice.
 *
 * Every locale, Klingon included: `tlh` is excluded from the sitemap and from
 * `hreflang`, but `/tlh/admin` is as much a dashboard URL as any other.
 */
const GATED_PREFIXES = ["/admin", "/parent", "/gamer", "/gedu", "/settings"];

export default function robots(): MetadataRoute.Robots {
  const disallow = GATED_PREFIXES.flatMap((prefix) => [
    // The bare path stays listed: it is a real URL that redirects into its
    // prefixed form, and a crawler should not follow it there either.
    prefix,
    ...SUPPORTED_LOCALES.map((locale) => `/${locale}${prefix}`),
  ]);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow,
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

/**
 * Is this deployment the production site? The one question every crawler
 * affordance asks before deciding whether to invite machines in.
 *
 * **Everything that is not production is invisible to crawlers** — staging,
 * every feature-branch preview, a local `next build`/`next dev`, CI's smoke
 * build. Not private: a direct link opens it and a chat app still unfurls it.
 * But no deployment other than production may pull search traffic, appear in
 * a search listing, or feed an AI model, so off production every response says
 * `noindex, nofollow` (`next.config.ts`), `robots.txt` admits only the search
 * engines that must crawl to read that, and the sitemap and `llms.txt` are not
 * served at all.
 *
 * **Vercel's own `VERCEL_ENV` decides it**, set on every Vercel build and at
 * runtime: `production` for the production deployment, `preview` for every
 * other (staging included, whatever domain it is served on). Unset anywhere
 * that is not Vercel, which is exactly the set of places that must also be
 * invisible. A function rather than a constant so a test can stub the
 * variable per case.
 *
 * Imported by `next.config.ts`, so it stays free of `@/` imports.
 */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

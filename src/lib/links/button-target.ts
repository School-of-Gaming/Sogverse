import type { SupportedLocale } from "@/lib/constants/locales";
import {
  localizeOwnSiteHref,
  resolveCanonicalHref,
  type SlugResolver,
} from "./own-site";

/**
 * **Where a button goes**: a page on our own site, stored as its locale-less
 * internal route path (`/shop/<id>`) and shown in the page's language, or
 * another site's address, stored as written.
 */
export type ButtonTarget =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string };

/**
 * Why an address cannot be a button's target: `dead` is our own site at a
 * path no page is served from; `same-page` is a fragment or query alone
 * (`#faq`), which names no page; `not-web` is a non-web scheme (`mailto:`),
 * which a button does not lead to; `unusable` is nothing a browser should
 * follow (empty, unparseable, `javascript:` and the like).
 */
export type ButtonTargetRefusal = "dead" | "same-page" | "not-web" | "unusable";

export type ButtonTargetResult =
  | { ok: true; target: ButtonTarget }
  | { ok: false; reason: ButtonTargetRefusal };

/**
 * **A button's target from whatever was pasted** — an address in any language,
 * relative or absolute, or a target already stored, which is canonicalised
 * again so a save never keeps a stale form. Own-site addresses become
 * `internal` at their canonical path (a slug address at its id, through
 * `resolver`); another site's http(s) address is `external` as written.
 */
export async function canonicalizeButtonTarget(
  input: string | ButtonTarget,
  resolver: SlugResolver,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): Promise<ButtonTargetResult> {
  const href =
    typeof input === "string"
      ? input
      : input.kind === "internal"
        ? input.path
        : input.url;
  const resolved = await resolveCanonicalHref(href, resolver, siteUrl);
  switch (resolved.kind) {
    case "internal":
      return resolved.path.startsWith("/")
        ? { ok: true, target: { kind: "internal", path: resolved.path } }
        : { ok: false, reason: "same-page" };
    case "external": {
      const url = resolved.href.trim();
      return /^https?:\/\//i.test(url)
        ? { ok: true, target: { kind: "external", url } }
        : { ok: false, reason: "not-web" };
    }
    case "dead":
    case "unusable":
      return { ok: false, reason: resolved.kind };
  }
}

/** The href a button renders with, on a page in `locale`. */
export function buttonTargetHref(
  target: ButtonTarget,
  locale: SupportedLocale,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  return target.kind === "internal"
    ? localizeOwnSiteHref(target.path, locale, siteUrl)
    : target.url;
}

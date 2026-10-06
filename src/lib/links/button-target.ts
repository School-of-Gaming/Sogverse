import type { SupportedLocale } from "@/lib/constants/locales";
import {
  localizeOwnSiteHref,
  resolveCanonicalHref,
  type SlugResolver,
} from "./own-site";

/**
 * **Where a button goes**: a page on our own site, stored as its locale-less
 * internal route path (`/shop/<id>`) and shown in the page's language;
 * another site's address, stored as written; or an email to one address.
 */
export type ButtonTarget =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string }
  | { kind: "email"; to: string };

/**
 * Why an address cannot be a button's target: `dead` is our own site at a
 * path no page is served from; `same-page` is a fragment or query alone
 * (`#faq`), which names no page; `not-web` is a non-web scheme pasted as an
 * address (`mailto:`), since an email button is a target of its own kind; `unusable` is nothing a browser should
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
 * `resolver`); another site's http(s) address is `external` as written. An
 * email target names no page, so it is kept as it is.
 */
export async function canonicalizeButtonTarget(
  input: string | ButtonTarget,
  resolver: SlugResolver,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): Promise<ButtonTargetResult> {
  if (typeof input !== "string" && input.kind === "email") {
    return { ok: true, target: input };
  }
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

/**
 * The href a button renders with, on a page in `locale`. An email target opens
 * a message to its address, with `subject` — the page's words in that
 * language — as its subject line when one is written.
 */
export function buttonTargetHref(
  target: ButtonTarget,
  locale: SupportedLocale,
  {
    subject,
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
  }: { subject?: string; siteUrl?: string } = {},
): string {
  switch (target.kind) {
    case "internal":
      return localizeOwnSiteHref(target.path, locale, siteUrl);
    case "external":
      return target.url;
    case "email": {
      const line = subject?.trim();
      return line
        ? `mailto:${target.to}?subject=${encodeURIComponent(line)}`
        : `mailto:${target.to}`;
    }
  }
}

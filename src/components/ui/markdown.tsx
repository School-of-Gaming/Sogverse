"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";
import {
  MARKDOWN_CONTAINER,
  MARKDOWN_LOOK,
  MARKDOWN_USE_CASES,
  OUTLINE_TAGS,
  authoredLinkKind,
  inQuietInk,
  type MarkdownEmphasis,
  type MarkdownLook,
  type MarkdownOutline,
  type MarkdownUseCase,
  type StyledMarkdownElement,
} from "@/lib/authored-markdown";
import { resolveLocale } from "@/lib/constants/locales";
import { localizeOwnSiteHref } from "@/lib/links/own-site";

export type { MarkdownEmphasis, MarkdownUseCase };

/**
 * The app's one markdown renderer, for authored prose that is *stored* as
 * markdown — a gedu's session report, a product's marketing long description,
 * a team member's bio, a Library article's body, and the email a report
 * is later converted into.
 *
 * **Authored markdown looks the same wherever it appears, a mail included.**
 * The look — every element's size, weight, ink and spacing, and the body's —
 * is defined once in `lib/authored-markdown`, and every use case renders
 * through it; the email renderer writes the same values inline. The body size
 * comes from there too, not from the surrounding context, so `className` is
 * for placing the block (a margin, a width), never for restyling what is
 * inside it. The one thing a surface does choose is `emphasis`: whether its
 * authored text is set in the ink or in the quiet ink, since colour is the
 * surface's and not the markdown's. Size never changes with it.
 *
 * **A deliberately small subset, enforced twice.** Markdown's full grammar is
 * far wider than anything worth typing into these fields, and the wide half is
 * exactly the half that breaks a layout: an image or a table dropped into a
 * card in a one-third-width rail has nowhere to go. So the allowed element list
 * is a whitelist rather than a blocklist — anything outside it is unwrapped to
 * its text rather than dropped, so a stray table still shows its words instead
 * of silently deleting a paragraph of somebody's writing.
 *
 * **No HTML passthrough.** Raw HTML in the source is never markup — the
 * library shows it as its own literal text, and the mail does the same. That
 * is the library's default and is kept that way on purpose: enabling it would need
 * `rehype-raw` plus a sanitizer, and would put a `dangerouslySetInnerHTML`
 * behind a field that any writer can type into. (The codebase has one, in the
 * JSON-LD data block under `src/components/seo/`, and its content is our own
 * serialized JSON rather than anyone's markup.)
 *
 * **A field names its use case, and a use case is a set of feature flags,
 * never a property of the reader.** The use cases, their flags, the allow-lists
 * derived from them and their outlines are defined in `lib/authored-markdown`,
 * beside the look, because the editor and the email renderer take the same
 * use case names and must keep exactly what this one keeps.
 */
export function Markdown({
  children,
  variant = "feed",
  emphasis = "normal",
  className,
}: {
  /** The markdown source. */
  children: string;
  /**
   * The field's use case. Defaults to `feed`, the staff-authored,
   * family-facing case — the conservative one, so a caller that has not
   * thought about it gets no links rather than accidental ones.
   */
  variant?: MarkdownUseCase;
  /**
   * SOG-UI's two inks: `quiet` sets every element, links included, in the
   * quiet ink. Nothing else about the look changes.
   */
  emphasis?: MarkdownEmphasis;
  /** Placement only — a margin or a width. The typography is the one style's. */
  className?: string;
}) {
  const { allowedElements, outline } = MARKDOWN_USE_CASES[variant];
  return (
    <div className={cn(MARKDOWN_CLASSES[emphasis].container, className)}>
      <ReactMarkdown
        allowedElements={[...allowedElements]}
        unwrapDisallowed
        components={COMPONENTS[emphasis][outline]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** A look's classes as the app paints them, behaviour-only ones included. */
function paintedClasses(look: MarkdownLook): string {
  return look.appOnly === undefined
    ? look.classes
    : `${look.classes} ${look.appOnly}`;
}

/** Every styled element's classes, with each look passed through `ink`. */
function elementClasses(ink: (look: MarkdownLook) => MarkdownLook) {
  return {
    h1: paintedClasses(ink(MARKDOWN_LOOK.h1)),
    h2: paintedClasses(ink(MARKDOWN_LOOK.h2)),
    h3: paintedClasses(ink(MARKDOWN_LOOK.h3)),
    p: paintedClasses(ink(MARKDOWN_LOOK.p)),
    ul: paintedClasses(ink(MARKDOWN_LOOK.ul)),
    ol: paintedClasses(ink(MARKDOWN_LOOK.ol)),
    strong: paintedClasses(ink(MARKDOWN_LOOK.strong)),
    a: paintedClasses(ink(MARKDOWN_LOOK.a)),
  } as const satisfies Record<StyledMarkdownElement, string>;
}

/**
 * **The one style, as classes.** Exported because the editor restates them:
 * its writing surface paints the same elements with the same classes, and a
 * unit test holds the two equal — what the writer sees while typing is what
 * the reader sees once it is saved.
 */
export const MARKDOWN_ELEMENT_CLASSES = elementClasses((look) => look);

/** Body size, leading and ink for everything inside, and the first block flush. */
export const MARKDOWN_CONTAINER_CLASSES = paintedClasses(MARKDOWN_CONTAINER);

interface EmphasisClasses {
  readonly container: string;
  readonly elements: Readonly<Record<StyledMarkdownElement, string>>;
}

/** The one style in each emphasis — the quiet one derived from it, never restated. */
export const MARKDOWN_CLASSES: Record<MarkdownEmphasis, EmphasisClasses> = {
  normal: {
    container: MARKDOWN_CONTAINER_CLASSES,
    elements: MARKDOWN_ELEMENT_CLASSES,
  },
  quiet: {
    container: paintedClasses(inQuietInk(MARKDOWN_CONTAINER)),
    elements: elementClasses(inQuietInk),
  },
};

/** A markdown heading level, painted in the one style under its outline tag. */
function Heading({
  outline,
  level,
  className,
  children,
}: {
  outline: MarkdownOutline;
  level: "h1" | "h2" | "h3";
  className: string;
  children?: ReactNode;
}) {
  const Tag = OUTLINE_TAGS[outline][level];
  return <Tag className={className}>{children}</Tag>;
}

function componentsFor(
  outline: MarkdownOutline,
  classes: EmphasisClasses["elements"],
): Components {
  return {
    h1: ({ children }) => (
      <Heading outline={outline} level="h1" className={classes.h1}>
        {children}
      </Heading>
    ),
    h2: ({ children }) => (
      <Heading outline={outline} level="h2" className={classes.h2}>
        {children}
      </Heading>
    ),
    h3: ({ children }) => (
      <Heading outline={outline} level="h3" className={classes.h3}>
        {children}
      </Heading>
    ),
    p: ({ children }) => <p className={classes.p}>{children}</p>,
    ul: ({ children }) => <ul className={classes.ul}>{children}</ul>,
    ol: ({ children }) => <ol className={classes.ol}>{children}</ol>,
    strong: ({ children }) => (
      <strong className={classes.strong}>{children}</strong>
    ),
    a: ({ href, children }) => (
      <AuthoredLink href={href} className={classes.a}>
        {children}
      </AuthoredLink>
    ),
  };
}

/**
 * **A link in authored markdown.** Reached only in a use case with the `links`
 * flag.
 *
 * **An anchor with nothing to point at renders as its own label.** The library
 * sanitises hrefs before this component ever sees them: a scheme outside its
 * allow-list (`javascript:`, `data:`, `vbscript:` and every
 * character-reference spelling of them) is replaced with an empty string
 * rather than dropped. An empty `href` is not inert — it resolves to the
 * current page — so a blocked link would still look and behave like a control.
 * Degrading it to plain text is the same shape the no-links policy already
 * produces elsewhere, which makes it the honest fallback here too.
 *
 * **Our own site opens in the same tab, another site in a new one** — the
 * rule for every use case that keeps links, decided here once by where the
 * address points (`authoredLinkKind`). A link off the site says so: an icon
 * for the eye and words for a screen reader, since a new tab it did not ask
 * for otherwise strands a reader who cannot see it open. `rel` withholds the
 * referrer from every destination, our own included, which buys the same as
 * inspecting each href would; `noopener` is spelled out beside the new tab.
 * The mail never adds a target — a link in a mail opens the browser anyway.
 *
 * **A link to one of our pages is shown in the page's language.** It is stored
 * without one (`/shop/123`), or carries whichever language its writer was
 * browsing in, so it is localised to the locale of the page it is read on:
 * `/shop/123` and `/sv/butik/123` both become `/fi/kauppa/123` on a Finnish
 * page (`localizeOwnSiteHref`).
 */
function AuthoredLink({
  href,
  className,
  children,
}: {
  href: string | undefined;
  className: string;
  children?: ReactNode;
}) {
  const locale = resolveLocale(useLocale());
  if (href === undefined || href === "") return <>{children}</>;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (authoredLinkKind(href, siteUrl) !== "other-site") {
    return (
      <a
        href={localizeOwnSiteHref(href, locale, siteUrl)}
        rel="noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
      <NewTabMarker />
    </a>
  );
}

/**
 * The "opens in a new tab" marker at the end of a link off the site. The
 * attribute names the marker, so a check comparing the page with the mail —
 * which has no new tabs to mark — can set it aside.
 */
function NewTabMarker() {
  const t = useTranslations("richText");
  return (
    <span data-new-tab-marker="">
      <ExternalLink aria-hidden className="ml-0.5 inline h-3.5 w-3.5 align-baseline" />
      <span className="sr-only">{` ${t("opensInNewTab")}`}</span>
    </span>
  );
}

function outlineComponents(
  classes: EmphasisClasses["elements"],
): Record<MarkdownOutline, Components> {
  return {
    section: componentsFor("section", classes),
    card: componentsFor("card", classes),
  };
}

const COMPONENTS: Record<MarkdownEmphasis, Record<MarkdownOutline, Components>> = {
  normal: outlineComponents(MARKDOWN_CLASSES.normal.elements),
  quiet: outlineComponents(MARKDOWN_CLASSES.quiet.elements),
};

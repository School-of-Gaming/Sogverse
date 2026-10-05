import { BRAND, DARK_THEME } from "@/lib/constants/colors";

/**
 * **Authored markdown's one definition: which elements a field keeps, and what
 * each of them looks like — on a page and in a mail.**
 *
 * Two renderers read it. The app's `Markdown` component (`components/ui/`)
 * paints each element with its `classes`; the email renderer
 * (`lib/email-templates/`) writes the same element's resolved values into
 * inline styles, because a mail can carry neither a stylesheet nor a class. A
 * parent reading a session report on the site and in their inbox is reading
 * one document, so the two have to agree, and this table is the only place
 * either of them learns anything about the look.
 *
 * **Each entry states its look twice, as token classes and as the values those
 * tokens resolve to, and a unit test holds the two equal.** The classes cannot
 * be generated from the values: Tailwind finds a class by reading source text,
 * so a computed class never reaches the stylesheet, and a class has to be a
 * SOG-UI or Tailwind token rather than a pixel value written in brackets. So
 * the test reads the tokens' definitions out of the theme stylesheets and
 * resolves every class to what it paints; a class changed without its value, or
 * a value changed without its class, fails the build. The email renderer is
 * held to the values by a second test, over what it actually emits.
 *
 * `appOnly` classes are the ones with no mail counterpart to hold equal — a
 * focus ring (a mail has no focus) and the container's first-block reset,
 * which the mail makes by position instead. They are not part of the look.
 *
 * **Where mail cannot follow, the gap is written beside the value.**
 */

/** One element's look, as the values its classes resolve to. Pixels unless noted. */
export interface MarkdownLook {
  /** The element's own token classes — everything the look is, and nothing else. */
  readonly classes: string;
  /** Classes the app paints that are behaviour rather than look; see above. */
  readonly appOnly?: string;
  readonly marginTop?: number;
  readonly fontSize?: number;
  /** Unitless. */
  readonly lineHeight?: number;
  /**
   * The CSS weight. **Mail gap:** the mail face draws 400 and 700 only, so a
   * mail asks for whichever of the two a browser's own font matching would land
   * on — 600 draws as 700, 500 as 400.
   */
  readonly fontWeight?: number;
  readonly color?: string;
  /**
   * The one class in `classes` that paints `color`, stated wherever `color`
   * is — the class the quiet emphasis swaps for the quiet ink.
   */
  readonly ink?: string;
  readonly listStyle?: "disc" | "decimal";
  /**
   * How far a list's items sit in from its edge. **Mail gap:** written as a
   * `margin-left` on the list rather than the app's `padding-left`, because
   * Outlook's Word engine ignores padding on a list and would flatten a nested
   * one; the indent is the same distance either way.
   */
  readonly indent?: number;
  /** The gap below every item of a list but its last. */
  readonly itemGap?: number;
  /**
   * A list's top margin where it sits inside a list item — a sub-list. It is
   * the item gap, so a sub-bullet sits as close under its bullet as the next
   * sibling would; the ordinary block margin there reads as a paragraph break.
   * The app paints it from the parent list (its classes reach the lists
   * nested in it), and a mail writes it on the nested list itself.
   */
  readonly nestedMarginTop?: number;
  readonly underline?: boolean;
  /**
   * **Mail gap:** `text-underline-offset` is honoured by Apple Mail and the
   * browser-based clients and ignored by Gmail and Outlook, which draw the
   * underline at the face's own offset. Accepted: the underline, which is the
   * affordance, arrives everywhere.
   */
  readonly underlineOffset?: number;
}

/**
 * Body size, leading and ink for everything inside, and the first block flush.
 *
 * Body is 16px in a mail too, above the 14px of the mail's own paragraphs
 * around a report: the report is somebody's writing and reads as it does on
 * the page (owner's ruling — one style, mail included).
 */
export const MARKDOWN_CONTAINER = {
  classes: "text-base leading-relaxed text-foreground",
  appOnly: "[&>*:first-child]:mt-0",
  fontSize: 16,
  lineHeight: 1.625,
  color: DARK_THEME.foreground,
  ink: "text-foreground",
} as const satisfies MarkdownLook;

/**
 * **What every allowed element looks like, in every variant and every medium.**
 *
 * Keyed by the element the markdown produces, so `h1` is the writer's top
 * level whatever tag it is finally painted as. Sizes come from SOG-UI's type
 * scale where it has the step — the top heading level is its `h3` step, the
 * card and sub-section title — and from the base scale where it does not yet:
 * the library ships no 16px body step and no 20px heading step, so those two
 * are `text-base` and `text-xl` until SOG-UI's Heading adoption rules on them.
 *
 * **A heading is plainly not a paragraph.** Body copy is 16px; the three levels
 * the editor offers are 24px, 20px and 18px, all semibold, so three toolbar
 * buttons produce three visible sizes.
 *
 * Spacing is a top margin per block rather than a container gap, because the
 * rhythm is not uniform: a heading stands clear of the block above it, while
 * the block beneath a heading sits at the ordinary paragraph gap, so the
 * heading reads as the start of what follows. Only the outermost first block is
 * flush; a block inside a list item keeps its margin, in both media — except a
 * sub-list, which takes the item gap instead (`nestedMarginTop`).
 *
 * `li` and `em` have no entry: an item takes its list's look, and emphasis is
 * the element's own italic.
 */
export const MARKDOWN_LOOK = {
  h1: {
    classes: "mt-8 text-h3",
    marginTop: 32,
    fontSize: 24,
    lineHeight: 1.3,
    fontWeight: 600,
  },
  h2: {
    classes: "mt-6 text-xl font-semibold leading-snug",
    marginTop: 24,
    fontSize: 20,
    lineHeight: 1.375,
    fontWeight: 600,
  },
  h3: {
    classes: "mt-6 text-lg font-semibold leading-snug",
    marginTop: 24,
    fontSize: 18,
    lineHeight: 1.375,
    fontWeight: 600,
  },
  p: { classes: "mt-4", marginTop: 16 },
  ul: {
    classes: "mt-4 list-disc space-y-1 pl-5 [&_ul]:mt-1 [&_ol]:mt-1",
    marginTop: 16,
    listStyle: "disc",
    itemGap: 4,
    nestedMarginTop: 4,
    indent: 20,
  },
  ol: {
    classes: "mt-4 list-decimal space-y-1 pl-5 [&_ul]:mt-1 [&_ol]:mt-1",
    marginTop: 16,
    listStyle: "decimal",
    itemGap: 4,
    nestedMarginTop: 4,
    indent: 20,
  },
  strong: { classes: "font-semibold", fontWeight: 600 },
  /**
   * **The underline is persistent, not a hover treatment.** It is what the
   * editor paints while the same sentence is being written, so writer and
   * reader see one thing; and colour plus weight alone is a thin non-colour
   * cue, so an always-on underline is what satisfies WCAG 1.4.1 without asking
   * the reader to hover first. The focus ring and its corner are the app's
   * alone: nothing in a mail takes focus.
   */
  a: {
    classes: "font-medium text-act underline underline-offset-4",
    appOnly:
      "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
    fontWeight: 500,
    color: BRAND.act,
    ink: "text-act",
    underline: true,
    underlineOffset: 4,
  },
} as const satisfies Record<string, MarkdownLook>;

export type StyledMarkdownElement = keyof typeof MARKDOWN_LOOK;

/**
 * **How strongly a surface sets its authored text: in the ink, or in the quiet
 * ink** — SOG-UI's two inks, and nothing between them.
 *
 * Colour is the one part of the look markdown cannot express, so it belongs to
 * the surface: a staff-only note set beneath a family-visible report reads as
 * the quieter of the two. Size, weight and spacing are the markdown's own
 * hierarchy and are the same in both. A mail has no quiet emphasis, since
 * nothing mailed is set back.
 */
export type MarkdownEmphasis = "normal" | "quiet";

/** The quiet ink, as its token class and the value that class resolves to. */
export const MARKDOWN_QUIET_INK = {
  classes: "text-muted-foreground",
  color: DARK_THEME.mutedFg,
} as const;

/**
 * **A look in the quiet ink**: its ink class swapped for the quiet one and its
 * colour with it, everything else untouched. Only the container and the link
 * name an ink; every other element inherits the container's, so quieting
 * those two quiets the whole block evenly — headings and list markers
 * included. A link keeps its weight and its underline, which is what marks it
 * as a link once its colour no longer does.
 */
export function inQuietInk(look: MarkdownLook): MarkdownLook {
  if (look.ink === undefined) return look;
  const ink = look.ink;
  return {
    ...look,
    classes: look.classes
      .split(/\s+/)
      .map((token) => (token === ink ? MARKDOWN_QUIET_INK.classes : token))
      .join(" "),
    color: MARKDOWN_QUIET_INK.color,
    ink: MARKDOWN_QUIET_INK.classes,
  };
}

/**
 * **The formatting a field can hold beyond plain prose, one flag per kind.**
 * Paragraphs, bold, italic, lists and hard breaks are in every field; a flag
 * adds a kind of construct on top of them, in every place that has to agree
 * about it at once — the renderer's allow-list, the editor's toolbar and
 * schema, and the mail. A new kind (images, tables, quotes) is a new flag, and
 * every use case below then has to say whether it has it.
 */
const MARKDOWN_FEATURES = ["headings", "links"] as const;
export type MarkdownFeature = (typeof MARKDOWN_FEATURES)[number];

/** The elements every field keeps, whatever its flags. */
const BASE_ELEMENTS = ["p", "strong", "em", "ul", "ol", "li", "br"] as const;

/**
 * What each flag adds to the allow-list.
 *
 * - `headings` is three levels, because the editor offers three: `h4`–`h6`
 *   are unreachable from the toolbar and so absent everywhere.
 * - `links` keeps `a`. *Which* addresses survive is a second, narrower list,
 *   and it is not written here: react-markdown's default URL transform keeps a
 *   relative address plus `http`, `https`, `irc`, `ircs`, `mailto` and `xmpp`,
 *   and blanks the rest. Both renderers call that one function, and the editor
 *   restates its list so it cannot offer a scheme the renderers would strip.
 *
 * An element no flag keeps is unwrapped to its text wherever it appears, and
 * **a childless element vanishes entirely** — an `img` has no text to unwrap to.
 */
const FEATURE_ELEMENTS: Record<MarkdownFeature, readonly string[]> = {
  headings: ["h1", "h2", "h3"],
  links: ["a"],
};

/**
 * **Where a use case's headings sit in the document outline** — which tag the
 * writer's top level is painted as. Structure for assistive tech, not
 * appearance: the look above is the same whichever tag carries it.
 *
 * - `section` (`h2`/`h3`/`h4`): the text is the body of its page, beneath the
 *   page's own `h1`.
 * - `card` (`h3`/`h4`/`h5`): the text is one entry in a feed — or a report in a
 *   mail, beneath the mail's own title.
 */
export type MarkdownOutline = "section" | "card";

export const OUTLINE_TAGS = {
  section: { h1: "h2", h2: "h3", h3: "h4" },
  card: { h1: "h3", h2: "h4", h3: "h5" },
} as const satisfies Record<
  MarkdownOutline,
  Record<"h1" | "h2" | "h3", "h2" | "h3" | "h4" | "h5">
>;

/**
 * **A use case is what a field is for, and it is a set of feature flags plus
 * an outline.** It is a property of the field, never of the reader or the
 * medium: a field names its use case once, and every surface showing that
 * field, a mail included, passes the same one. Use cases differ in which
 * constructs survive and which outline tag a heading takes, never in how an
 * element they allow looks.
 *
 * Two use cases with the same flags today stay two use cases: the flags are
 * where they may part later, and a field that shares another's name would be
 * dragged along when that one changes.
 */
export type MarkdownUseCase =
  | "feed"
  | "marketing"
  | "profile"
  | "article"
  | "landing";

export interface MarkdownUseCaseDefinition {
  /** Every flag, stated — a new flag is a decision for every use case. */
  readonly features: Readonly<Record<MarkdownFeature, boolean>>;
  readonly outline: MarkdownOutline;
  /** Derived from `features`: the elements the renderers keep. */
  readonly allowedElements: readonly string[];
}

function defineUseCase(
  features: Record<MarkdownFeature, boolean>,
  outline: MarkdownOutline,
): MarkdownUseCaseDefinition {
  const flagged = MARKDOWN_FEATURES.flatMap((feature) =>
    features[feature] ? FEATURE_ELEMENTS[feature] : [],
  );
  return { features, outline, allowedElements: [...BASE_ELEMENTS, ...flagged] };
}

export const MARKDOWN_USE_CASES: Record<MarkdownUseCase, MarkdownUseCaseDefinition> = {
  /**
   * **A gedu's write-up, read by a family.**
   *
   * **No links, and that is a safeguarding rule rather than a limitation.** A
   * report is written by a gedu and read by a child's parent, so a link in one
   * is this platform pointing a family somewhere it does not control. A
   * markdown link therefore unwraps to its own label, on every surface and in
   * the mail.
   */
  feed: defineUseCase({ headings: true, links: false }, "card"),
  /**
   * **A product's long description, on our own public pages.** Admin-authored
   * copy read by a stranger browsing the shop, so links are part of its job.
   */
  marketing: defineUseCase({ headings: true, links: true }, "section"),
  /**
   * **A team member's "About me", on their public page.** No headings, since
   * the page already sets the heading it sits under, and no links. No heading
   * survives, so its outline is never reached; `section` is nominal.
   */
  profile: defineUseCase({ headings: false, links: false }, "section"),
  /** **A Library article's body**: admin-authored, on our own public pages. */
  article: defineUseCase({ headings: true, links: true }, "section"),
  /**
   * **A landing page's prose** — a text section's body, an FAQ answer:
   * admin-authored copy on our own public pages, read by a stranger arriving
   * from a search, so links are part of its job.
   */
  landing: defineUseCase({ headings: true, links: true }, "section"),
};

/**
 * **Where a kept link goes, which decides how the page opens it.**
 *
 * - `own-site` — a relative address, or an absolute one on the site's own
 *   host. It opens in the same tab, like every other link on the site.
 * - `other-site` — a web address anywhere else. It opens in a new tab, and
 *   says so, so the reader keeps the page they were reading.
 * - `other-scheme` — `mailto:` and the other non-web schemes the renderers
 *   keep. The browser hands these to another app and the page stays put, so
 *   a new tab would only be an empty one.
 *
 * The site's own host is `NEXT_PUBLIC_SITE_URL`'s, the canonical origin, and
 * no other: it is the one both the server and the browser render with, so the
 * two agree on every link. An address that cannot be parsed counts as another
 * site's, the cautious answer.
 */
export type AuthoredLinkKind = "own-site" | "other-site" | "other-scheme";

/** A base no real address shares, so a relative href resolves onto it. */
const RELATIVE_BASE = "https://relative.invalid";

export function authoredLinkKind(
  href: string,
  siteUrl: string | undefined,
): AuthoredLinkKind {
  let url: URL;
  try {
    url = new URL(href, RELATIVE_BASE);
  } catch {
    return "other-site";
  }
  // Resolved onto the base, so it named no origin of its own. A
  // protocol-relative `//host` names one, and does not land here.
  if (url.origin === RELATIVE_BASE) return "own-site";
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "other-scheme";
  }
  return url.host === siteHost(siteUrl) ? "own-site" : "other-site";
}

function siteHost(siteUrl: string | undefined): string | null {
  if (siteUrl === undefined || siteUrl === "") return null;
  try {
    return new URL(siteUrl).host;
  } catch {
    return null;
  }
}

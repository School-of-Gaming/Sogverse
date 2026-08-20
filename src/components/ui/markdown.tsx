"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * The app's one markdown renderer, for authored prose that is *stored* as
 * markdown — a gedu's session report, a product's marketing long description,
 * and the email either is later converted into.
 *
 * **A deliberately small subset, enforced twice.** Markdown's full grammar is
 * far wider than anything worth typing into these fields, and the wide half is
 * exactly the half that breaks a layout: an image or a table dropped into a
 * card in a one-third-width rail has nowhere to go. So the allowed element list
 * is a whitelist rather than a blocklist — anything outside it is unwrapped to
 * its text rather than dropped, so a stray table still shows its words instead
 * of silently deleting a paragraph of somebody's writing.
 *
 * **No HTML passthrough.** Raw HTML in the source is ignored, which is the
 * library's default and is kept that way on purpose: enabling it would need
 * `rehype-raw` plus a sanitizer, and would put the first `dangerouslySetInnerHTML`
 * in this codebase behind a field that any writer can type into.
 *
 * **The variant is a property of the field, never of the reader.** Two things
 * differ between them — whether links survive, and how loud a heading is — and
 * both are decided by *what is stored*, not by who is looking at it. Keying
 * either to a role or a surface would mean one stored value rendering
 * differently in two places, so the same sentence could carry a live link on
 * one page and a dead label on another. A field picks its variant once, where
 * it is rendered, and every surface showing that field passes the same one.
 */
export type MarkdownVariant = "feed" | "marketing";

export function Markdown({
  children,
  variant = "feed",
  className,
}: {
  /** The markdown source. */
  children: string;
  /**
   * Which field this is. Defaults to `feed`, the staff-authored, family-facing
   * case — the conservative half of the pair, so a caller that has not thought
   * about it gets no links rather than accidental ones.
   */
  variant?: MarkdownVariant;
  className?: string;
}) {
  const style = VARIANT_STYLES[variant];
  return (
    <div className={cn(style.container, className)}>
      <ReactMarkdown
        allowedElements={style.allowedElements}
        unwrapDisallowed
        components={style.components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

interface MarkdownVariantStyle {
  /** Wrapper classes: the type scale and, for `feed`, the block rhythm. */
  container: string;
  /** The whitelist. Anything outside it is unwrapped to its text. */
  allowedElements: string[];
  components: Components;
}

/**
 * **The feed subset: a gedu's write-up, rendered in a card in a column.**
 *
 * Headings are scaled to their context, not to the page. A report renders
 * inside a card inside a feed, and an `h1` typed in the editor is the writer
 * titling their own write-up — it is not competing with the page title. So
 * every heading level lands within a step or two of body copy; the hierarchy
 * survives, the shouting doesn't.
 *
 * **The top three levels are three different sizes**, because the editor offers
 * three of them and a writer who picks between Title, Heading and Subheading
 * has to be able to see which one they picked. Two levels sharing a size and
 * differing only in colour made the choice invisible in the rendered report —
 * and a real report opens with a title line, so the level that matters most was
 * the one hardest to tell apart.
 *
 * **There is no `a`, and that is a policy rather than a limitation.** A report
 * is written by a gedu and read by a family, so a link in one is this platform
 * pointing a child's parent somewhere it does not control. A markdown link
 * therefore unwraps to its own label, which keeps the sentence readable and
 * takes the destination away — and it does so on every surface, because the
 * variant travels with the field.
 *
 * `h4`–`h6` are absent as well: the editor caps headings at three levels, so
 * they are unreachable from the toolbar and a deeper one pasted in would
 * flatten on the first save anyway. **A childless element vanishes entirely** —
 * an `img` has no text to unwrap to, the one case where "unwrapped, not
 * dropped" saves nothing, and there is nothing to save.
 *
 * Exported because the email renderer under `lib/email-templates` emits the
 * same subset from a string walker, and a unit test holds the two lists equal
 * — a report has to read the same in the mail it is sent as.
 */
export const FEED_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "br",
];

/**
 * **The marketing subset: a product's long description, on a public page.**
 *
 * Two things widen. **Links are in it**, because this field is written by an
 * admin for the shop's own product pages: pointing a parent at the game's
 * store page or at our own policies is the copy doing its job, which is a
 * different act from a session report sending a family off-site mid-write-up.
 * And **headings are scaled to the page** rather than to a card: this text is
 * the body of the page it sits on, so its sections need to read as sections
 * beneath the product's own `h1`.
 *
 * *Which* addresses survive is a second, narrower list, and it is not written
 * here: the library's default URL transform keeps a relative address plus
 * `http`, `https`, `irc`, `ircs`, `mailto` and `xmpp`, and blanks the rest. The
 * editor restates that list so it cannot offer a scheme this end would strip —
 * one decision in two places, and changing it means changing both.
 */
const MARKETING_ELEMENTS = [...FEED_ELEMENTS, "a"];

/**
 * Semantic levels, one step down from the markdown level.
 *
 * The page's `h1` is the product's name, so the highest heading a writer can
 * type opens at `h2` and the three levels land on `h2`/`h3`/`h4`. Sizes step
 * down with them, for the same reason the feed's do: three toolbar buttons that
 * produce two visible sizes is a choice the writer cannot see themselves
 * making.
 *
 * **The top level is a step above the body, not two.** It is the size of a
 * section heading inside a card in a reading column, which is what these are —
 * not the size of a page title, which the product's own name already holds a
 * few centimetres above. The scale was briefly a step louder, and the argument
 * against it is that the loudest text on the page below the title was a
 * subheading of it.
 *
 * `text-foreground` is explicit on every heading because this variant renders
 * inside a muted body — the block-based long description it replaces set the
 * same contrast between its headings and its paragraphs, and losing it would
 * flatten the page in a way that has nothing to do with the level.
 */
const MARKETING_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2 className="mt-5 text-lg font-semibold leading-snug text-foreground">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 text-base font-semibold leading-snug text-foreground">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-5 text-sm font-semibold leading-snug text-foreground">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="mt-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  /**
   * **An anchor with nothing to point at renders as its own label.**
   *
   * The library sanitises hrefs before this component ever sees them: a scheme
   * outside its allow-list (`javascript:`, `data:`, `vbscript:` and every
   * character-reference spelling of them) is replaced with an empty string
   * rather than dropped. An empty `href` is not inert — it resolves to the
   * current page — so a blocked link would still look and behave like a
   * control. Degrading it to plain text is the same shape the no-links policy
   * already produces elsewhere, which makes it the honest fallback here too.
   *
   * No `target`: a link in body copy behaves like every other link on the site,
   * and forcing a new tab takes the decision away from the reader. `rel` is
   * unconditional and withholds the referrer from every destination, our own
   * included: the alternative is inspecting each href to decide, which buys
   * nothing — an internal page has no use for a referrer header it could read
   * off the URL anyway.
   *
   * **The underline is persistent, not a hover treatment.** It is what the
   * editor paints while the same sentence is being written, so writer and
   * reader see one thing; and against this variant's muted body copy, colour
   * plus weight is a thin non-colour cue, so an always-on underline is what
   * satisfies WCAG 1.4.1 without asking the reader to hover first.
   */
  a: ({ href, children }) =>
    href === undefined || href === "" ? (
      <>{children}</>
    ) : (
      <a
        href={href}
        rel="noreferrer"
        className="rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </a>
    ),
};

const FEED_COMPONENTS: Components = {
  // The three levels step down a size each, so a writer can see which one they
  // picked.
  h1: ({ children }) => (
    <h3 className="pt-1 text-lg font-semibold leading-snug">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="pt-1 text-base font-semibold leading-snug">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="pt-1 text-sm font-semibold leading-snug text-muted-foreground">
      {children}
    </h5>
  ),
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
};

const VARIANT_STYLES: Record<MarkdownVariant, MarkdownVariantStyle> = {
  /**
   * `space-y` rather than margins on each block: the children come from a
   * parser, so styling the gaps from the container is the only way to get
   * consistent rhythm without knowing which blocks a report happens to use.
   */
  feed: {
    container: "space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0",
    allowedElements: FEED_ELEMENTS,
    components: FEED_COMPONENTS,
  },
  /**
   * Per-block margins rather than a container `space-y`, because the rhythm is
   * not uniform here: a section heading needs to stand clear of the paragraph
   * above it while consecutive paragraphs sit close together. Those are the
   * exact gaps the block-based long description used, so the only thing that
   * changes when a product's copy is converted is the heading level.
   */
  marketing: {
    container: "text-sm leading-relaxed [&>*:first-child]:mt-0",
    allowedElements: MARKETING_ELEMENTS,
    components: MARKETING_COMPONENTS,
  },
};

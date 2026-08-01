"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * The app's one markdown renderer, for short authored prose that is *stored* as
 * markdown — today a gedu's session report, tomorrow the same text converted to
 * email HTML for the families it is written for.
 *
 * **A deliberately small subset, enforced twice.** Markdown's full grammar is far
 * wider than anything worth typing into a session write-up, and the wide half is
 * exactly the half that breaks a layout: an image or a table dropped into a card
 * in a one-third-width rail has nowhere to go. So the allowed element list is a
 * whitelist rather than a blocklist — anything outside it is unwrapped to its
 * text rather than dropped, so a stray table still shows its words instead of
 * silently deleting a paragraph of somebody's write-up.
 *
 * **No HTML passthrough.** Raw HTML in the source is ignored, which is the
 * library's default and is kept that way on purpose: enabling it would need
 * `rehype-raw` plus a sanitizer, and would put the first `dangerouslySetInnerHTML`
 * in this codebase behind a field that any gedu can type into.
 *
 * **Headings are scaled to their context, not to the page.** A report renders
 * inside a card inside a feed, and an `h1` typed in the editor is the writer
 * titling their own write-up — it is not competing with the page title. So every
 * heading level lands within a step or two of body copy; the hierarchy survives,
 * the shouting doesn't. Colours are semantic tokens throughout, so the same
 * markup reads correctly in both themes.
 *
 * **The top three levels are three different sizes**, because the editor offers
 * three of them and a writer who picks between Title, Heading and Subheading
 * has to be able to see which one they picked. Two levels sharing a size and
 * differing only in colour made the choice invisible in the rendered report —
 * and a real report opens with a title line, so the level that matters most was
 * the one hardest to tell apart.
 */
export function Markdown({
  children,
  className,
}: {
  /** The markdown source. */
  children: string;
  className?: string;
}) {
  return (
    // `space-y` rather than margins on each block: the children come from a
    // parser, so styling the gaps from the container is the only way to get
    // consistent rhythm without knowing which blocks a report happens to use.
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0",
        className,
      )}
    >
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * The subset a report may render. Everything a gedu can produce from the
 * editor's toolbar is here, plus the inline marks a paste can bring with it.
 * Anything else is unwrapped to its text content.
 */
const ALLOWED_ELEMENTS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "br",
];

const COMPONENTS = {
  // The top three levels step down a size each; h4–h6 all land on the same
  // quiet weight, because a session report six levels deep has other problems.
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="pt-1 text-lg font-semibold leading-snug">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="pt-1 text-base font-semibold leading-snug">{children}</h4>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h5 className="pt-1 text-sm font-semibold leading-snug text-muted-foreground">
      {children}
    </h5>
  ),
  h4: headingLeaf,
  h5: headingLeaf,
  h6: headingLeaf,
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

function headingLeaf({ children }: { children?: React.ReactNode }) {
  return (
    <p className="pt-1 text-sm font-medium leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

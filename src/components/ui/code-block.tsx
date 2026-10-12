/**
 * A block of code: a request, a header, a response body, a command — text a
 * reader copies whole rather than reads in a sentence. Its sibling for a few
 * words inside prose is {@link InlineCode}.
 *
 * Set in the machine face on the lifted grey, inside an edge: the frame
 * belongs to the code and travels with it, so the block keeps its border even
 * inside a card. Whitespace is kept exactly as written, and a line is never
 * wrapped, because a wrapped command or JSON body no longer reads as what to
 * type; the frame scrolls sideways instead, so a long line never pushes the
 * page wider than a phone.
 *
 * The optional `title` is a caption bar above the code naming what it is (the
 * tool, the base URL, the envelope), split from the code by a divider so the
 * label never reads as part of what to copy. The title is copy and arrives
 * translated; the code itself is never translated.
 */
export function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-lifted">
      {title && (
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="p-4 font-mono text-sm leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

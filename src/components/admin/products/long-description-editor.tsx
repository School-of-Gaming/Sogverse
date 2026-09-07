"use client";

import dynamic from "next/dynamic";

/**
 * Height of the writing surface, matched by the placeholder that stands in for
 * it while the chunk is in flight. Toolbar (`h-10`) plus the editor body's
 * `min-h-40`, so the box does not change size when the real editor arrives.
 */
const RICH_EDITOR_MIN_HEIGHT = "min-h-[12.5rem]";

/**
 * The rich editor is loaded on demand and never rendered on the server.
 *
 * ProseMirror plus a markdown parser and serialiser is a large dependency, and
 * the product form is opened far more often to change a price, a date or a seat
 * count than to write a page of marketing copy. Splitting it out keeps it off
 * the first load; the loading state is the same box at the same height, so the
 * swap moves nothing.
 */
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <RichEditorPlaceholder />,
  },
);

/**
 * **A product's marketing long description, edited as rich text.**
 *
 * The value is stored as markdown, and the admin writing it never meets the
 * syntax: they see headings, emphasis, lists and links, and the column keeps
 * the markdown. `marketing` is the field's variant and it names a matched pair
 * — the toolbar offers exactly what the public page's renderer styles, links
 * included, and headings are scaled to a page rather than to a card. The same
 * name is passed at both ends, so nothing typed here can render as a surprise.
 *
 * **One editor exists at a time, and that is a property of the form rather than
 * a gate bolted on.** The field is per locale and the form shows one locale at
 * a time behind language tabs, so only the open tab's editor is ever mounted —
 * a form carrying four translations does not carry four ProseMirror documents.
 * Switching tabs remounts it against the new locale's draft, which is what
 * `key` is doing at the call site: the editor reads its content once at mount
 * and ignores later prop changes by design.
 */
export function LongDescriptionEditor({
  value,
  placeholder,
  ariaLabel,
  describedBy,
  onChange,
  disabled,
}: {
  /** The stored markdown. Read once, at mount. */
  value: string;
  placeholder: string;
  ariaLabel: string;
  /** Id of the field's hint, so the writing surface points at it. */
  describedBy?: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
}) {
  return (
    <RichTextEditor
      variant="marketing"
      initialValue={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      describedBy={describedBy}
      disabled={disabled}
    />
  );
}

/** The editor's footprint, holding its space before the chunk lands. */
function RichEditorPlaceholder() {
  return (
    <div
      aria-hidden
      className={`w-full rounded-md border border-border bg-background ${RICH_EDITOR_MIN_HEIGHT}`}
    />
  );
}

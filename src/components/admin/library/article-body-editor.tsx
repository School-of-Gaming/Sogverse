"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * The rich editor, loaded on demand and never rendered on the server; the
 * placeholder is the same box at the same height (toolbar plus the writing
 * surface's minimum), so the swap moves nothing.
 */
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="min-h-[12.5rem] w-full rounded-md border border-border bg-background"
      />
    ),
  },
);

/**
 * **A Library article's body, edited as rich text** in the `article` variant —
 * the toolbar offers exactly what the article page's renderer keeps, links
 * included. The editor reads `value` once, at mount.
 */
export function ArticleBodyEditor({
  value,
  placeholder,
  ariaLabel,
  describedBy,
  onChange,
  onSeeded,
  disabled,
}: {
  /** The stored markdown. Read once, at mount. */
  value: string;
  placeholder: string;
  ariaLabel: string;
  describedBy?: string;
  onChange: (markdown: string) => void;
  /**
   * Once, when the editor is up: the markdown it was seeded with, and the
   * editor's own serialisation of it — see the rich editor's `onSeeded`.
   */
  onSeeded?: (seed: { value: string; markdown: string }) => void;
  disabled?: boolean;
}) {
  // What the editor was seeded with, as it was at mount, so the pair handed to
  // `onSeeded` always belongs together.
  const [seed] = useState(value);

  return (
    <RichTextEditor
      variant="article"
      initialValue={value}
      onChange={onChange}
      onSeeded={(markdown) => onSeeded?.({ value: seed, markdown })}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      describedBy={describedBy}
      disabled={disabled}
    />
  );
}

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MarkdownUseCase } from "@/lib/authored-markdown";

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
 * **An admin-authored markdown body, edited as rich text** — a Library
 * article's or a spotlight's. The toolbar offers exactly what the field's
 * renderer keeps, decided by `useCase`, which every surface showing the field
 * passes alike. The editor reads `value` once, at mount.
 */
export function AuthoredBodyEditor({
  useCase,
  value,
  placeholder,
  ariaLabel,
  describedBy,
  onChange,
  onSeeded,
  disabled,
}: {
  /** The field's use case, the same one its renderer is given. */
  useCase: MarkdownUseCase;
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
      variant={useCase}
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

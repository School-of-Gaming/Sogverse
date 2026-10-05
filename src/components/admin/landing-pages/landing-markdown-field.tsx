"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Pencil } from "lucide-react";

/**
 * The rich editor, loaded on demand and never rendered on the server; the
 * placeholder is the same box at the same height, so the swap moves nothing.
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
 * **A landing page's rich text field** — a text section's body, an answer —
 * edited in the `landing` use case, so the toolbar offers exactly what the
 * public page's renderer keeps, links and headings included.
 *
 * A page can hold many of them (twenty answers in one questions section), so
 * an editor is only built once its field is opened: until then the field is a
 * button showing the words as written, and pressing it swaps in the editor.
 * The editor reads `value` once, at mount.
 */
export function LandingMarkdownField({
  value,
  placeholder,
  openLabel,
  ariaLabel,
  describedBy,
  onChange,
  onSeeded,
}: {
  value: string;
  placeholder: string;
  /** The closed field's accessible name: what pressing it does. */
  openLabel: string;
  ariaLabel: string;
  describedBy?: string;
  onChange: (markdown: string) => void;
  /** Once, when the editor is up: the value it was seeded with and its own serialisation of it. */
  onSeeded?: (seed: { value: string; markdown: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState(value);

  if (!open) {
    return (
      <button
        type="button"
        aria-label={openLabel}
        aria-describedby={describedBy}
        onClick={() => {
          setSeed(value);
          setOpen(true);
        }}
        className="group flex w-full items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
      >
        <span
          className={
            value.trim() === ""
              ? "text-muted-foreground"
              : "line-clamp-4 whitespace-pre-wrap break-words"
          }
        >
          {value.trim() === "" ? placeholder : value}
        </span>
        <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }

  return (
    <RichTextEditor
      variant="landing"
      initialValue={seed}
      onChange={onChange}
      onSeeded={(markdown) => onSeeded?.({ value: seed, markdown })}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      describedBy={describedBy}
    />
  );
}

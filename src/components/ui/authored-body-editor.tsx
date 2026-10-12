"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AuthoredBodies } from "@/lib/authored-bodies";
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
 * The body record an editor form holds, with what the shared body editor
 * needs to fill it and to be re-seeded.
 */
export interface AuthoredBodiesHandle extends AuthoredBodies {
  /**
   * Bumped by `reset`: every body editor on the form remounts on it, seeded
   * afresh from the value it is handed.
   */
  readonly generation: number;
  /** Note what the editor made of a seed — the body editor calls it. */
  record: (seed: string, serialised: string) => void;
  /**
   * Re-seed every body editor from the form's values. Called after the form's
   * values are put back to a baseline — a Discard — since the editor reads its
   * value once, at mount, and would otherwise go on showing what was thrown
   * away.
   */
  reset: () => void;
}

/** A form's body record: one per form, shared by all its body editors. */
export function useAuthoredBodies(): AuthoredBodiesHandle {
  const [serialised, setSerialised] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [generation, setGeneration] = useState(0);
  const record = useCallback(
    (seed: string, markdown: string) =>
      setSerialised((current) =>
        current.get(seed) === markdown
          ? current
          : new Map(current).set(seed, markdown),
      ),
    [],
  );
  const reset = useCallback(() => setGeneration((current) => current + 1), []);
  return useMemo(
    () => ({ serialised, generation, record, reset }),
    [serialised, generation, record, reset],
  );
}

/**
 * **A body written per locale, edited as rich text** — the one way an editor of
 * content written per locale puts a rich body on screen, so every one of them
 * handles the editor's respelling the same way.
 *
 * The rich editor writes markdown back in its own dialect and reports the
 * document on its first transaction whether or not anything was typed (its
 * `onSeeded`), so an untouched body can come back spelled differently from the
 * stored one. This component records what the editor made of its seed in the
 * form's body record (`useAuthoredBodies`), and the per-locale comparison reads
 * the record, so an untouched body never reads as an unsaved change. The record
 * is required: a body edited without one is the bug this exists to rule out.
 *
 * The editor reads `value` once, at mount. The caller keys this component on
 * whatever the body belongs to — the locale of the tab being shown — so a
 * switch remounts it on that draft; the record's `reset` remounts it in place,
 * on the value it is handed then.
 */
export function AuthoredBodyEditor({
  bodies,
  useCase,
  value,
  onChange,
  placeholder,
  ariaLabel,
  describedBy,
  disabled,
}: {
  bodies: AuthoredBodiesHandle;
  /** The field's use case — the same one its renderer is given. */
  useCase: MarkdownUseCase;
  /** The body as the form holds it. Read once, at mount. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder: string;
  ariaLabel: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <SeededEditor
      key={bodies.generation}
      record={bodies.record}
      useCase={useCase}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      describedBy={describedBy}
      disabled={disabled}
    />
  );
}

function SeededEditor({
  record,
  useCase,
  value,
  ...rest
}: {
  record: AuthoredBodiesHandle["record"];
  useCase: MarkdownUseCase;
  value: string;
  onChange: (markdown: string) => void;
  placeholder: string;
  ariaLabel: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  // What the editor was seeded with, as it was at mount, so the pair recorded
  // always belongs together.
  const [seed] = useState(value);

  return (
    <RichTextEditor
      variant={useCase}
      initialValue={seed}
      onSeeded={(markdown) => record(seed, markdown)}
      {...rest}
    />
  );
}

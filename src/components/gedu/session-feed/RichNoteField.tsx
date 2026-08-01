"use client";

import dynamic from "next/dynamic";
import { Field } from "@/components/ui/field";

/**
 * Height of the writing surface, matched by the placeholder that stands in for
 * it before it is loaded or mounted. Toolbar (`h-10`) plus the editor body's
 * `min-h-40`, so the box never changes size when the real editor arrives.
 */
const RICH_EDITOR_MIN_HEIGHT = "min-h-[12.5rem]";

/**
 * The rich editor is loaded on demand and never rendered on the server.
 *
 * ProseMirror plus a markdown parser and serialiser is the heaviest thing on a
 * gedu surface by a wide margin, and the overwhelmingly common visit to a
 * product page does not open an editor at all — it reads last week and leaves.
 * Splitting it out means that visit never downloads it. The loading state is the
 * same box at the same height, so the swap is invisible.
 *
 * One import for every rich field on the page: two fields inside one session
 * editor share this chunk, so the second one costs nothing to download.
 */
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <RichEditorPlaceholder />,
  },
);

interface RichNoteFieldProps {
  label: string;
  hint?: string;
  placeholder: string;
  /** Markdown to seed the editor with. Re-read whenever `seed` changes. */
  value: string;
  /**
   * Bumped by the caller each time the surrounding editor is opened. It is the
   * editor's React key, so a reopen genuinely re-seeds the document instead of
   * leaving a cancelled draft sitting in it.
   */
  seed: number;
  /**
   * Whether to instantiate the editor at all.
   *
   * A feed holds fifty-odd entries and every one of them keeps its editor
   * mounted-but-collapsed so the fields survive a close. Instantiating a rich
   * editor per field would mean a hundred ProseMirror documents on a page where
   * at most one is ever being typed into, so an editor only comes into
   * existence once its entry has actually been opened — and then stays.
   */
  ready: boolean;
  onChange: (markdown: string) => void;
}

/**
 * A labelled rich-text editor over one markdown field.
 *
 * **The gedu never sees markdown syntax.** These values are stored as markdown
 * because that is what converts cleanly into the email a report is eventually
 * sent as — but the person writing one is a gedu at the end of a session, and
 * asking them to remember what `##` does is how a formatting feature ends up
 * never being used. They see headings, bold and bullets; the syntax stays an
 * implementation detail of the column.
 *
 * **Both session-level notes use it — the family-facing report and the
 * gedu-only note.** The gedu note was a plain textarea, on the reasoning that a
 * couple of lines to a colleague does not deserve a toolbar. What that actually
 * produced was two different writing experiences inside one editor, and the
 * note nobody outside the team reads is exactly where a handover is written:
 * three things to know about the room, which is a list. The two fields differ
 * in *audience*, and the padlocked treatment around this one is what says so —
 * not the absence of formatting.
 *
 * **No "(optional)" marker on either.** Both genuinely are optional — attendance
 * is the half a gedu is paid on — but marking them says, at the exact moment
 * somebody is deciding whether to bother, that nobody minds if they don't. The
 * `Field` primitive keeps the capability for the forms that need it.
 *
 * **The hint is announced, not merely printed.** One of these fields is the
 * gedu-only note, whose hint is the sentence saying families never see it — the
 * single most important thing to know before typing into it. The writing
 * surface is a contenteditable rather than an input, so it carries the
 * association itself: the field generates the hint's id and the editor points at
 * it.
 */
export function RichNoteField({
  label,
  hint,
  placeholder,
  value,
  seed,
  ready,
  onChange,
}: RichNoteFieldProps) {
  return (
    <Field label={label} hint={hint}>
      {({ hintId }) =>
        ready ? (
          <RichTextEditor
            key={seed}
            initialValue={value}
            onChange={onChange}
            placeholder={placeholder}
            ariaLabel={label}
            describedBy={hintId}
          />
        ) : (
          <RichEditorPlaceholder />
        )
      }
    </Field>
  );
}

/** The editor's footprint, holding its space before it exists. */
function RichEditorPlaceholder() {
  return (
    <div
      aria-hidden
      className={`w-full rounded-md border border-input bg-background ${RICH_EDITOR_MIN_HEIGHT}`}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";

/**
 * Height of the writing surface, matched by the placeholder that stands in for
 * it before it is loaded or mounted. Toolbar (`h-10`) plus the editor body's
 * `min-h-40`, so the box never changes size when the real editor arrives.
 */
const REPORT_EDITOR_MIN_HEIGHT = "min-h-[12.5rem]";

/**
 * The rich editor is loaded on demand and never rendered on the server.
 *
 * ProseMirror plus a markdown parser and serialiser is the heaviest thing on a
 * gedu surface by a wide margin, and the overwhelmingly common visit to a
 * product page does not open an editor at all — it reads last week and leaves.
 * Splitting it out means that visit never downloads it. The loading state is the
 * same box at the same height, so the swap is invisible.
 */
const RichTextEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <ReportEditorPlaceholder />,
  },
);

interface SessionReportFieldProps {
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
   * mounted-but-collapsed so the close can animate. Instantiating a rich editor
   * per entry would mean fifty ProseMirror documents on a page where at most one
   * is ever being typed into, so the editor only comes into existence once its
   * entry has actually been opened — and then stays, which is what keeps the
   * close animation.
   */
  ready: boolean;
  onChange: (markdown: string) => void;
}

/**
 * The session report field: a labelled rich-text editor over the report's
 * markdown.
 *
 * **The gedu never sees markdown syntax.** The value is stored as markdown
 * because that is what converts cleanly into the email these reports are
 * eventually sent as — but the person writing one is a gedu at the end of a
 * session, and asking them to remember what `##` does is how a formatting
 * feature ends up never being used. They see headings, bold and bullets; the
 * syntax stays an implementation detail of the column.
 *
 * The gedu note beside it deliberately stays a plain textarea. It is a couple of
 * lines to a colleague, nobody outside the team ever reads it, and a toolbar over
 * it would suggest it deserves the same care as the family-facing one.
 *
 * **It carries no "(optional)" marker, and that is a deliberate exception to the
 * house convention.** A report genuinely is optional — nothing is blocked by its
 * absence, and attendance is the half a gedu is paid on — but this is the field
 * families read, and it is the field that replaced the Padlet. Marking it
 * optional is the UI telling the writer, at the exact moment they are deciding
 * whether to bother, that nobody minds if they don't. The gedu note beside it
 * keeps its marker: nobody outside the team ever reads that one.
 */
export function SessionReportField({
  value,
  seed,
  ready,
  onChange,
}: SessionReportFieldProps) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <Field label={t("reportLabel")} hint={t("reportFormattingHint")}>
      {ready ? (
        <RichTextEditor
          key={seed}
          initialValue={value}
          onChange={onChange}
          placeholder={t("reportPlaceholder")}
          ariaLabel={t("reportLabel")}
        />
      ) : (
        <ReportEditorPlaceholder />
      )}
    </Field>
  );
}

/** The editor's footprint, holding its space before it exists. */
function ReportEditorPlaceholder() {
  return (
    <div
      aria-hidden
      className={`w-full rounded-md border border-input bg-background ${REPORT_EDITOR_MIN_HEIGHT}`}
    />
  );
}

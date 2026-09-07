/**
 * A stand-in for the rich-text editor, for the tests that treat a note field as
 * an opaque box. Applied with a factory naming this module:
 *
 * ```ts
 * vi.mock("@/components/ui/rich-text-editor", () => import("../../mocks/rich-text-editor"));
 * ```
 *
 * **Why it exists.** The real editor is ProseMirror plus a markdown parser and
 * serialiser, pulled in through a dynamic import that a test's module graph
 * resolves whether or not the test ever opens a field. It is by a wide margin
 * the heaviest thing a session-feed suite loads, and a suite that renders a
 * feed to check attendance marks, photo affordances or a send button pays for
 * all of it to assert nothing about it.
 *
 * **What it preserves.** The editor's prop contract as a field: an accessible
 * name, the hint it is described by, the placeholder, the seeded value, the
 * disabled state, and a change handler fed the field's own text. The writing
 * surface keeps `role="textbox"` because the real one does — a query that finds
 * a textbox with or without this stub is a query whose meaning did not change.
 *
 * **What it does not preserve, and the line that draws.** Everything markdown:
 * the toolbar, the schema, the serialiser, the link row. A test that types into
 * a note and asserts on the markdown that comes out — or that exercises any
 * editor behaviour at all — must keep the real editor, because against this
 * stub it would be asserting on a textarea's raw text. The stub is only for
 * fields the test never looks inside.
 */
export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
  ariaLabel,
  describedBy,
  className,
  disabled = false,
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel: string;
  describedBy?: string;
  variant?: "feed" | "marketing";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      className={className}
      defaultValue={initialValue}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

"use client";

import { Bold, Heading2, Heading3, Italic, List, ListOrdered } from "lucide-react";
import { useTranslations } from "next-intl";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown as MarkdownExtension } from "tiptap-markdown";
import { cn } from "@/lib/utils";

/**
 * A small rich-text editor over a **markdown** value: markdown goes in, the
 * writer sees formatting rather than syntax, markdown comes back out.
 *
 * **Why rich rather than a textarea.** The text this edits is read by families,
 * and the person writing it is a gedu at the end of a session, not somebody who
 * knows what `##` does. A textarea over markdown asks every writer to hold two
 * pictures at once — what they typed and what it will look like — and the ones
 * who don't know the syntax simply never use it, so the formatting the feature
 * exists for never gets written. Storage stays markdown regardless: it is what
 * converts cleanly to the email these reports will eventually be sent as.
 *
 * **The toolbar is deliberately six buttons and cannot grow into a word
 * processor.** Bold, italic, two heading levels, two list kinds — exactly the
 * subset the read-only renderer styles, so nothing can be produced here that
 * renders as a surprise. They are icon-only and never wrap: this editor has to
 * survive a one-third-width rail and a phone, and a toolbar that reflows to two
 * rows as the viewport narrows moves the writing surface underneath it.
 *
 * **Everything the toolbar cannot produce degrades rather than breaks.** Pasted
 * markdown goes through the same parser, so a table or a code fence arrives as
 * nodes the schema has no home for and is dropped to its text — the words
 * survive, the structure doesn't, and nothing throws.
 *
 * **Re-seeding is the caller's job, via `key`.** The editor owns its document
 * once mounted; handing it a new `initialValue` prop does nothing. A caller that
 * needs to reset it (an inline editor reopening on a different draft) remounts
 * it with a changed React key, which is both cheaper and less surprising than an
 * effect racing the user's typing.
 */
export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
}: {
  /** Markdown to seed the document with. Read once, at mount. */
  initialValue: string;
  /** Fires with the serialised markdown on every edit. */
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Accessible name for the writing surface. */
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("richText");

  const editor = useEditor({
    // Next.js renders client components on the server too, and ProseMirror
    // needs a DOM — rendering immediately would throw during SSR.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        // Everything the toolbar can't produce and the renderer doesn't style
        // is switched off at the schema, so it cannot be typed, pasted or
        // undone into existence.
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      MarkdownExtension.configure({
        // No HTML in, no HTML out: the read-only renderer refuses raw HTML for
        // the same reason, and a value that round-trips through this editor
        // must stay inside the subset that renderer knows how to style.
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: false,
        breaks: false,
      }),
    ],
    content: initialValue,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
        class: cn(
          // Matches the Textarea primitive's inner padding and type scale so a
          // report field and a gedu-note field read as the same kind of box.
          "min-h-40 w-full px-3 py-2 text-base focus-visible:outline-none",
          // The rendered subset, styled with the same tokens the read-only
          // renderer uses — what you type is what the feed shows.
          "[&_p]:leading-relaxed [&_p:not(:first-child)]:mt-2",
          "[&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-snug",
          "[&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-muted-foreground",
          "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:leading-relaxed",
          "[&_strong]:font-semibold",
          // Placeholder: the extension marks the first empty node, and the
          // text is drawn as a non-selectable pseudo-element so it never
          // becomes content.
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        ),
      },
    },
    onUpdate: ({ editor: instance }) => onChange(readMarkdown(instance)),
  });

  // Built as data rather than as six near-identical JSX blocks: the toolbar is
  // a list, the separators are where the list changes subject, and describing it
  // that way is what keeps "add a button" from meaning "paste twelve lines".
  const toolGroups: ToolbarTool[][] = [
    [
      {
        key: "bold",
        label: t("bold"),
        icon: Bold,
        active: editor?.isActive("bold") ?? false,
        run: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        key: "italic",
        label: t("italic"),
        icon: Italic,
        active: editor?.isActive("italic") ?? false,
        run: () => editor?.chain().focus().toggleItalic().run(),
      },
    ],
    [
      {
        key: "heading",
        label: t("heading"),
        icon: Heading2,
        active: editor?.isActive("heading", { level: 2 }) ?? false,
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        key: "subheading",
        label: t("subheading"),
        icon: Heading3,
        active: editor?.isActive("heading", { level: 3 }) ?? false,
        run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        key: "bulletList",
        label: t("bulletList"),
        icon: List,
        active: editor?.isActive("bulletList") ?? false,
        run: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        key: "orderedList",
        label: t("orderedList"),
        icon: ListOrdered,
        active: editor?.isActive("orderedList") ?? false,
        run: () => editor?.chain().focus().toggleOrderedList().run(),
      },
    ],
  ];

  const toolsDisabled = editor === null || !editor.isEditable;

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* `flex-nowrap` and a fixed height: six shrink-proof buttons is under
          200px, so the row fits every width this editor is used at, and
          pinning the height means focusing or toggling a button can never
          change where the writing surface starts. */}
      <div className="flex h-10 flex-nowrap items-center gap-0.5 border-b border-input px-1">
        {toolGroups.map((group, index) => (
          <div key={group[0].key} className="flex items-center gap-0.5">
            {index > 0 && (
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            )}
            {group.map((tool) => (
              <ToolbarButton
                key={tool.key}
                tool={tool}
                disabled={toolsDisabled}
              />
            ))}
          </div>
        ))}
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

interface ToolbarTool {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  run: () => void;
}

function ToolbarButton({
  tool,
  disabled,
}: {
  tool: ToolbarTool;
  disabled: boolean;
}) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      // `onMouseDown` preventing default keeps the selection alive: without it
      // the click blurs the document first and the command applies to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={tool.run}
      disabled={disabled}
      aria-label={tool.label}
      aria-pressed={tool.active}
      title={tool.label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        tool.active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Read the document back as markdown.
 *
 * The serialiser lives on the editor's extension storage. Tiptap's `Storage`
 * interface is the declared extension point for exactly this, and the markdown
 * extension's slot on it is declared in `src/types/tiptap.d.ts` — so this is a
 * plain typed property access rather than an assertion.
 */
function readMarkdown(editor: Editor): string {
  return editor.storage.markdown.getMarkdown();
}

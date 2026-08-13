"use client";

import { useState } from "react";
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Unlink,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Placeholder } from "@tiptap/extensions";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown as MarkdownExtension } from "tiptap-markdown";
import { cn } from "@/lib/utils";

/**
 * A small rich-text editor over a **markdown** value: markdown goes in, the
 * writer sees formatting rather than syntax, markdown comes back out.
 *
 * **Why rich rather than a textarea.** The text this edits is read by families,
 * and the person writing it is a gedu at the end of a session or an admin
 * drafting a product page, not somebody who knows what `##` does. A textarea
 * over markdown asks every writer to hold two pictures at once — what they
 * typed and what it will look like — and the ones who don't know the syntax
 * simply never use it, so the formatting the feature exists for never gets
 * written. Storage stays markdown regardless: it is what converts cleanly to
 * the email these values are eventually sent as.
 *
 * **The toolbar is the rendered subset, and cannot grow into a word
 * processor.** Bold, italic, three heading levels, two list kinds — exactly
 * what the read-only renderer styles, so nothing can be produced here that
 * renders as a surprise. The buttons are icon-only and never wrap: this editor
 * has to survive a one-third-width rail and a phone, and a toolbar that reflows
 * to two rows as the viewport narrows moves the writing surface underneath it.
 *
 * **The variant matches the renderer's, and is a property of the field.**
 * `feed` is a staff-authored, family-facing note: no links, and headings scaled
 * to the card a report renders in. `marketing` is a product's long description
 * on our own public pages: links are part of the copy's job there, and headings
 * are scaled to a page. Whichever a field stores, both ends of it use the same
 * name — a toolbar wider than the renderer is a trap, and a renderer wider than
 * the toolbar is a construct that can only arrive by paste.
 *
 * **Everything the toolbar cannot produce degrades rather than breaks.** Pasted
 * markdown genuinely goes through the same parser — plain text on the clipboard
 * is parsed as markdown rather than inserted verbatim — so a table or a code
 * fence arrives as nodes the schema has no home for and is dropped to its text:
 * the words survive, the structure doesn't, and nothing throws.
 *
 * **Re-seeding is the caller's job, via `key`.** The editor owns its document
 * once mounted; handing it a new `initialValue` prop does nothing. A caller that
 * needs to reset it (an inline editor reopening on a different draft) remounts
 * it with a changed React key, which is both cheaper and less surprising than an
 * effect racing the user's typing.
 */
export type RichTextEditorVariant = "feed" | "marketing";

export function RichTextEditor({
  initialValue,
  onChange,
  placeholder,
  ariaLabel,
  describedBy,
  variant = "feed",
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
  /**
   * Id of the element describing this field — the hint under a `Field`, which
   * is otherwise rendered as text nothing points at. Read once, at mount, like
   * every other editor attribute.
   */
  describedBy?: string;
  /**
   * Which field this is, matching the read-only renderer's variant of the same
   * name. Defaults to `feed`, the conservative half: a caller that has not
   * thought about it gets no link control rather than one whose output the
   * renderer would strip. Read once, at mount — the schema is built from it.
   */
  variant?: RichTextEditorVariant;
  className?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("richText");
  const linksAllowed = variant === "marketing";

  /**
   * The URL row's draft, and whether it is open.
   *
   * Local state rather than a popover: the row is one input and three buttons,
   * it belongs to this editor and nothing else, and opening it is the direct
   * result of the writer clicking the link button — so pushing the writing
   * surface down by a row is a shift they asked for.
   */
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

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
        // Links exist only where the field's own policy allows them, and only
        // ever deliberately: `autolink` off, so typing an address does not
        // silently mark it up (the markdown serialiser's `linkify` is off for
        // the same reason), and `openOnClick` off, so a click inside a link
        // while editing puts the caret there instead of navigating away from
        // an unsaved draft.
        link: linksAllowed ? { autolink: false, openOnClick: false } : false,
        // Three levels, because a real write-up opens with a title line and
        // then sections under it. Anything deeper is switched off at the
        // schema, so it cannot be typed, pasted or undone into existence.
        heading: { levels: [1, 2, 3] },
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
        // Plain text arriving on the clipboard is parsed as markdown rather
        // than pasted literally, so a write-up drafted elsewhere keeps its
        // headings and lists instead of showing the writer their own `##`.
        // Only plain text: a paste carrying HTML already has structure and
        // goes through the schema's own parser.
        transformPastedText: true,
      }),
    ],
    content: initialValue,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        ...(describedBy === undefined
          ? {}
          : { "aria-describedby": describedBy }),
        role: "textbox",
        "aria-multiline": "true",
        class: cn(
          // Matches the Textarea primitive's inner padding and type scale so a
          // report field and a gedu-note field read as the same kind of box.
          "min-h-40 w-full px-3 py-2 text-base focus-visible:outline-none",
          // The rendered subset, styled with the same tokens the read-only
          // renderer uses — what you type is what the reader sees.
          "[&_p]:leading-relaxed [&_p:not(:first-child)]:mt-2",
          "[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:leading-relaxed",
          "[&_strong]:font-semibold",
          linksAllowed ? MARKETING_PROSE : FEED_PROSE,
          // Placeholder: the extension marks the first empty node, and the
          // text is drawn as a non-selectable pseudo-element so it never
          // becomes content.
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        ),
      },
    },
    onUpdate: ({ editor: instance }) => onChange(readMarkdown(instance)),
  });

  /**
   * Which of the marks the caret currently sits in, recomputed on every
   * transaction.
   *
   * It has to be a subscription rather than a read taken during render: this
   * editor is uncontrolled and a selection change produces no React state
   * update, so a plain `editor.isActive(…)` in the render body would answer for
   * whatever the document looked like at mount and never change again — Bold
   * would stay unlit inside bold text, and toggling it with a collapsed cursor
   * (a stored mark, with nothing else on screen to show for it) would give no
   * feedback at all. `useEditorState` re-renders only when one of these booleans
   * actually flips, so the subscription costs a comparison per transaction
   * rather than a render per keystroke.
   *
   * `link` is asked for unconditionally. Tiptap answers `false` for a mark its
   * schema has never heard of, so the feed variant reads a permanent `false`
   * and renders no button to show it on.
   */
  const activeTools =
    useEditorState({
      editor,
      selector: ({ editor: instance }): Record<ToolbarToolKey, boolean> =>
        instance === null
          ? NOTHING_ACTIVE
          : {
              bold: instance.isActive("bold"),
              italic: instance.isActive("italic"),
              title: instance.isActive("heading", { level: 1 }),
              heading: instance.isActive("heading", { level: 2 }),
              subheading: instance.isActive("heading", { level: 3 }),
              bulletList: instance.isActive("bulletList"),
              orderedList: instance.isActive("orderedList"),
              link: instance.isActive("link"),
            },
    }) ?? NOTHING_ACTIVE;

  /**
   * Open the URL row on whatever the caret is in: the current link's address
   * when there is one (so the row edits rather than replaces), empty otherwise.
   * Clicking the button a second time closes it, which is what an active-state
   * toggle is expected to do.
   */
  function toggleLinkRow() {
    if (linkDraft !== null) {
      setLinkDraft(null);
      return;
    }
    const href: unknown = editor?.getAttributes("link").href;
    setLinkDraft(typeof href === "string" ? href : "");
  }

  /**
   * Commit the row.
   *
   * Three cases, and the third is the one worth naming: with a collapsed caret
   * and no link under it there is no text to mark up, so the address becomes
   * its own label. The alternative — a stored mark waiting for the next
   * keystroke — gives the writer a button click with nothing on screen to show
   * for it.
   */
  function applyLink() {
    if (editor === null || linkDraft === null) return;
    const href = linkDraft.trim();
    if (href === "") {
      removeLink();
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDraft(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
  }

  // Built as data rather than as near-identical JSX blocks: the toolbar is a
  // list, the separators are where the list changes subject, and describing it
  // that way is what keeps "add a button" from meaning "paste twelve lines".
  const toolGroups: ToolbarTool[][] = [
    [
      {
        key: "bold",
        label: t("bold"),
        icon: Bold,
        run: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        key: "italic",
        label: t("italic"),
        icon: Italic,
        run: () => editor?.chain().focus().toggleItalic().run(),
      },
    ],
    [
      {
        key: "title",
        label: t("title"),
        icon: Heading1,
        run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        key: "heading",
        label: t("heading"),
        icon: Heading2,
        run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        key: "subheading",
        label: t("subheading"),
        icon: Heading3,
        run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        key: "bulletList",
        label: t("bulletList"),
        icon: List,
        run: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        key: "orderedList",
        label: t("orderedList"),
        icon: ListOrdered,
        run: () => editor?.chain().focus().toggleOrderedList().run(),
      },
    ],
  ];

  // Last, and only where the field allows one: the link is the only tool that
  // needs a value typed rather than a state toggled, so it is the one that
  // opens a row.
  if (linksAllowed) {
    toolGroups.push([
      { key: "link", label: t("link"), icon: LinkIcon, run: toggleLinkRow },
    ]);
  }

  // The `disabled` prop, not `editor.isEditable`: the editor's own flag is read
  // during render and only changes through a method call, so a toolbar keyed to
  // it would keep answering for the value the editor was constructed with.
  const toolsDisabled = editor === null || disabled;

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* `flex-nowrap` and a fixed height: the seven shrink-proof buttons come
          to roughly 260px including their separators, which fits the narrowest
          place the feed variant is used — a one-third-width rail on a phone —
          and pinning the height means focusing or toggling a button can never
          change where the writing surface starts. The link group takes that to
          roughly 305px, and it only ever appears on the marketing variant,
          which lives on a full-width admin form. **A ninth button is a decision
          about the narrow case, not a paste job.** */}
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
                active={activeTools[tool.key]}
                disabled={toolsDisabled}
              />
            ))}
          </div>
        ))}
      </div>

      {/* The address row, between the toolbar and the writing surface. It is
          not reserved space — it exists only while the writer is typing an
          address, and the surface below moves down as the direct result of the
          click that opened it. Buttons rather than a form: this editor is used
          inside admin forms, and an Enter that submitted the page while
          somebody was typing a URL would be a disaster with a keyboard
          shortcut. */}
      {linkDraft !== null && (
        <div className="flex items-center gap-1 border-b border-input px-1 py-1">
          <input
            type="url"
            autoFocus
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setLinkDraft(null);
              }
            }}
            aria-label={t("linkUrl")}
            className="h-8 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <IconButton label={t("linkApply")} icon={Check} onClick={applyLink} />
          <IconButton
            label={t("linkRemove")}
            icon={Unlink}
            onClick={removeLink}
            disabled={!activeTools.link}
          />
          <IconButton
            label={t("linkCancel")}
            icon={X}
            onClick={() => setLinkDraft(null)}
          />
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}

/** The things the toolbar can toggle, and the keys the active map uses. */
type ToolbarToolKey =
  | "bold"
  | "italic"
  | "title"
  | "heading"
  | "subheading"
  | "bulletList"
  | "orderedList"
  | "link";

/** What the toolbar shows before there is an editor to ask. */
const NOTHING_ACTIVE: Record<ToolbarToolKey, boolean> = {
  bold: false,
  italic: false,
  title: false,
  heading: false,
  subheading: false,
  bulletList: false,
  orderedList: false,
  link: false,
};

/**
 * The writing surface's heading scale, per variant — the read-only renderer's
 * own scale, restated in the arbitrary-variant form the editor's single class
 * attribute needs. The two have to move together: a heading that looks like a
 * section title while being typed and like body copy once saved is the trap the
 * same-subset rule exists to close.
 */
const FEED_PROSE = cn(
  "[&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:leading-snug",
  "[&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:leading-snug",
  "[&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-muted-foreground",
);

const MARKETING_PROSE = cn(
  "[&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-snug",
  "[&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-snug",
  "[&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
);

interface ToolbarTool {
  key: ToolbarToolKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

function ToolbarButton({
  tool,
  active,
  disabled,
}: {
  tool: ToolbarTool;
  active: boolean;
  disabled: boolean;
}) {
  return (
    <IconButton
      label={tool.label}
      icon={tool.icon}
      onClick={tool.run}
      disabled={disabled}
      active={active}
    />
  );
}

/**
 * One square icon control — a toolbar button, or one of the address row's
 * three. Shared because they sit two rows apart in the same box and any drift
 * in size or hover treatment would read as a rendering fault.
 *
 * `onMouseDown` preventing default keeps the document's selection alive:
 * without it the click blurs the editor first and the command applies to
 * nothing.
 */
function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  active,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Omitted on the address row's three, which do a thing rather than hold a
   * state — `aria-pressed="false"` on a button that never lights up announces a
   * toggle that isn't there.
   */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        active === true
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

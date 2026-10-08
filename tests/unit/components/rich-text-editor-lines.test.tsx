import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";

/**
 * **A heading applies to lines, never holds a line break, and pasted lines stay
 * lines** — against the real editor, its real schema and its real serialiser.
 *
 * Writers lay a report out with Shift+Enter, so a title on its own line is
 * often the first line of one paragraph. A heading used to convert the whole
 * paragraph, and then save as a title ending in `\` with the rest demoted to
 * body text on reload.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  RichTextEditor,
  readMarkdown,
  richTextExtensions,
} from "@/components/ui/rich-text-editor";
import type { MarkdownUseCase } from "@/lib/authored-markdown";

const editors: Editor[] = [];

/**
 * A paste event carrying plain text, which jsdom cannot build: it has no
 * ClipboardEvent and no DataTransfer. The clipboard is read only through
 * `getData`, so that is all this one has.
 */
class PlainTextPaste extends Event {
  readonly clipboardData: Pick<DataTransfer, "getData">;
  constructor(text = "") {
    super("paste", { bubbles: true, cancelable: true });
    this.clipboardData = {
      getData: (format) => (format === "text/plain" ? text : ""),
    };
  }
}
// ProseMirror's `pasteText` builds an empty ClipboardEvent to carry a paste.
vi.stubGlobal("ClipboardEvent", PlainTextPaste);

/** An ordinary paste of plain text, as Ctrl+V delivers it. */
function paste(editor: Editor, text: string) {
  editor.view.dom.dispatchEvent(new PlainTextPaste(text));
}

/** A Shift+Ctrl+V paste, which asks for the text as typed rather than parsed. */
function pasteAsTyped(editor: Editor, text: string) {
  editor.view.pasteText(text);
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function makeEditor(content: string, variant: MarkdownUseCase = "feed"): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: richTextExtensions({ variant }),
    content,
  });
  editors.push(editor);
  return editor;
}

/** A key pressed on the writing surface, as the browser delivers one. */
function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }),
  );
}

/**
 * Characters typed one at a time, through the input-rule hook the browser's
 * text input reaches first, and inserted when no rule takes them.
 */
function type(editor: Editor, text: string) {
  for (const character of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)),
    );
    if (handled !== true) view.dispatch(view.state.tr.insertText(character, from, to));
  }
}

/**
 * Each top-level block as its type, level and text, with breaks shown as `⏎` —
 * less the empty paragraph the schema appends after a document ending in a
 * heading, which is not what these cases are about.
 */
function blocks(editor: Editor): string[] {
  const described = editor.getJSON().content.map((block: JSONContent) => {
    const text = (block.content ?? [])
      .map((inline) => (inline.type === "hardBreak" ? "⏎" : (inline.text ?? "")))
      .join("");
    const level: unknown = block.attrs?.level;
    return block.type === "heading" ? `h${String(level)}:${text}` : `${block.type ?? ""}:${text}`;
  });
  return described.at(-1) === "paragraph:" ? described.slice(0, -1) : described;
}

/** The position just inside the start of the `index`th top-level block. */
function startOf(editor: Editor, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  return pos + 1;
}

function headingsHoldNoBreak(editor: Editor): boolean {
  let clean = true;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      node.forEach((child) => {
        if (child.type.name === "hardBreak") clean = false;
      });
    }
  });
  return clean;
}

/** Three lines in one paragraph, written the way the bug report's writer did. */
function threeShiftEnterLines(): Editor {
  const editor = makeEditor("");
  editor.commands.focus();
  type(editor, "line1");
  press(editor, "Enter", { shiftKey: true });
  type(editor, "line2");
  press(editor, "Enter", { shiftKey: true });
  type(editor, "line3");
  return editor;
}

describe("a heading applies to the lines it is given", () => {
  it("the owner's repro: Shift+Enter three lines, caret in line 1, Title — only line 1 is a heading", () => {
    const editor = threeShiftEnterLines();
    expect(blocks(editor)).toEqual(["paragraph:line1⏎line2⏎line3"]);

    editor.commands.setTextSelection(3);
    editor.chain().focus().toggleHeading({ level: 1 }).run();

    expect(blocks(editor)).toEqual(["h1:line1", "paragraph:line2⏎line3"]);
    const markdown = readMarkdown(editor);
    expect(markdown).toBe("# line1\n\nline2\\\nline3");
    expect(markdown.split("\n")[0]).toBe("# line1");

    const reloaded = makeEditor(markdown);
    expect(blocks(reloaded)).toEqual(blocks(editor));
  });

  it("the same, through the toolbar's Title button on the mounted editor", async () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        initialValue={"line1\\\nline2\\\nline3"}
        onChange={onChange}
        ariaLabel="Report"
      />,
    );
    const surface = await screen.findByRole("textbox", { name: "Report" });
    const editor = (surface as HTMLElement & { editor?: Editor }).editor;
    if (!editor) throw new Error("no editor on the writing surface");
    await waitFor(() => expect(editor.isInitialized).toBe(true));

    act(() => {
      editor.commands.setTextSelection(3);
    });
    fireEvent.click(screen.getByRole("button", { name: "title" }));

    expect(onChange).toHaveBeenLastCalledWith("# line1\n\nline2\\\nline3");
  });

  it("a caret at the very end of line 1 is still line 1", () => {
    const editor = makeEditor("line1\\\nline2\\\nline3");
    editor.commands.setTextSelection(1 + "line1".length);
    editor.commands.toggleHeading({ level: 2 });
    expect(blocks(editor)).toEqual(["h2:line1", "paragraph:line2⏎line3"]);
  });

  it("the lines around a heading stay one paragraph each, their breaks intact", () => {
    const editor = makeEditor("a\\\nb\\\nc\\\nd\\\ne");
    // A caret in line 3.
    editor.commands.setTextSelection(1 + "a".length + 1 + "b".length + 1 + 1);
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["paragraph:a⏎b", "h1:c", "paragraph:d⏎e"]);
    expect(readMarkdown(editor)).toBe("a\\\nb\n\n# c\n\nd\\\ne");
  });

  it("a selection across lines 1 and 2 of four leaves lines 3 and 4 together", () => {
    const editor = makeEditor("a\\\nb\\\nc\\\nd");
    editor.commands.setTextSelection({ from: 1, to: 4 });
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["h1:a", "h1:b", "paragraph:c⏎d"]);
  });

  it("empty lines at a new boundary are dropped, and kept away from it", () => {
    const editor = makeEditor("a\\\n\\\nb\\\n\\\nc\\\n\\\nd");
    expect(blocks(editor)).toEqual(["paragraph:a⏎⏎b⏎⏎c⏎⏎d"]);
    // A caret in `c`, the fifth line.
    editor.commands.setTextSelection(1 + "a⏎⏎b⏎⏎".length);
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["paragraph:a⏎⏎b", "h1:c", "paragraph:d"]);
  });

  it("a caret on line 1 of a list item heads that line and lifts it, and the rest stays together", () => {
    const editor = makeEditor("- a\\\n  b\\\n  c");
    expect(blocks(editor)).toEqual(["bulletList:"]);
    editor.commands.setTextSelection(3);
    editor.chain().focus().toggleHeading({ level: 1 }).run();
    expect(blocks(editor)).toEqual(["h1:a", "paragraph:b⏎c"]);
    expect(headingsHoldNoBreak(editor)).toBe(true);
    editor.commands.undo();
    expect(readMarkdown(editor)).toBe("- a\\\n  b\\\n  c");
  });

  it("a caret in a middle line makes only that line a heading", () => {
    const editor = makeEditor("line1\\\nline2\\\nline3");
    editor.commands.setTextSelection(1 + "line1".length + 1 + 2);
    editor.commands.toggleHeading({ level: 3 });
    expect(blocks(editor)).toEqual(["paragraph:line1", "h3:line2", "paragraph:line3"]);
  });

  it("a selection across lines 1 and 2 makes both headings, and not line 3", () => {
    const editor = makeEditor("line1\\\nline2\\\nline3");
    editor.commands.setTextSelection({ from: 2, to: 1 + "line1".length + 1 + 3 });
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["h1:line1", "h1:line2", "paragraph:line3"]);
  });

  it("is one undo step back to the paragraph the writer had", () => {
    const editor = makeEditor("line1\\\nline2\\\nline3");
    editor.commands.setTextSelection(3);
    editor.commands.toggleHeading({ level: 1 });
    editor.commands.undo();
    expect(blocks(editor)).toEqual(["paragraph:line1⏎line2⏎line3"]);
  });

  it("toggling a heading off still makes it a paragraph", () => {
    const editor = makeEditor("# Title\n\nBody");
    editor.commands.setTextSelection(3);
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["paragraph:Title", "paragraph:Body"]);
  });

  it("a typed `# ` at the start of a multi-line paragraph heads only its first line", () => {
    const editor = makeEditor("line1\\\nline2");
    editor.commands.setTextSelection(1);
    type(editor, "# ");
    expect(blocks(editor)).toEqual(["h1:line1", "paragraph:line2"]);
  });

  it("a typed `## ` still makes its level, and a level the field lacks stays as typed", () => {
    const editor = makeEditor("");
    editor.commands.focus();
    type(editor, "## Section");
    expect(blocks(editor)).toEqual(["h2:Section"]);

    const deeper = makeEditor("");
    deeper.commands.focus();
    type(deeper, "#### Deep");
    expect(blocks(deeper)).toEqual(["paragraph:#### Deep"]);
  });

  it("bold still applies to just the selection", () => {
    const editor = makeEditor("line1\\\nline2");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.toggleBold();
    expect(readMarkdown(editor)).toBe("**line1**\\\nline2");
  });
});

describe("a heading never holds a line break", () => {
  it("Shift+Enter at the end of a heading starts a new paragraph, as Enter does", () => {
    const editor = makeEditor("# Title");
    editor.commands.focus("end");
    press(editor, "Enter", { shiftKey: true });
    type(editor, "body");
    expect(blocks(editor)).toEqual(["h1:Title", "paragraph:body"]);
    expect(readMarkdown(editor)).toBe("# Title\n\nbody");
  });

  it("Mod+Enter, the other hard-break key, does the same", () => {
    const editor = makeEditor("# Title");
    editor.commands.focus("end");
    // Ctrl on this platform. Without the heading's own binding the break would
    // land in the heading and be split into a second heading, not a paragraph.
    press(editor, "Enter", { ctrlKey: true });
    type(editor, "body");
    expect(blocks(editor)).toEqual(["h1:Title", "paragraph:body"]);
  });

  it("Shift+Enter in a paragraph is still a line break, and round-trips", () => {
    const editor = makeEditor("line1");
    editor.commands.focus("end");
    press(editor, "Enter", { shiftKey: true });
    type(editor, "line2");
    expect(blocks(editor)).toEqual(["paragraph:line1⏎line2"]);
    const markdown = readMarkdown(editor);
    expect(markdown).toBe("line1\\\nline2");
    expect(blocks(makeEditor(markdown))).toEqual(["paragraph:line1⏎line2"]);
  });

  it("a break put into a heading any other way splits it into a heading per line", () => {
    const editor = makeEditor("# Title");
    editor.commands.setTextSelection(4);
    editor.commands.setHardBreak();
    expect(blocks(editor)).toEqual(["h1:Tit", "h1:le"]);
  });

  it("a paragraph of lines joined onto a heading keeps every line and every word", () => {
    const editor = makeEditor("# Title\n\nline1\\\nline2");
    editor.commands.setTextSelection(startOf(editor, 1));
    editor.commands.joinBackward();
    expect(headingsHoldNoBreak(editor)).toBe(true);
    expect(blocks(editor)).toEqual(["h1:Titleline1", "h1:line2"]);
  });

  it("the corrupted shape a report was saved in loads with no heading holding a break", () => {
    const editor = makeEditor("# a\\\nb");
    expect(headingsHoldNoBreak(editor)).toBe(true);
    expect(blocks(editor)).toEqual(["h1:a\\", "paragraph:b"]);
  });

  it("a stored heading that does carry a break is saved as a heading per line", () => {
    // A setext heading is the one markdown heading that can span lines.
    const editor = makeEditor("a\\\nb\n===");
    expect(readMarkdown(editor)).toBe("# a\n\n# b");
  });
});

describe("pasted plain text keeps its lines", () => {
  it("a single line break is a hard break, and a blank line starts a paragraph", () => {
    const editor = makeEditor("");
    paste(editor, "a\nb\nc\n\nd");
    expect(blocks(editor)).toEqual(["paragraph:a⏎b⏎c", "paragraph:d"]);
    expect(readMarkdown(editor)).toBe("a\\\nb\\\nc\n\nd");
  });

  it("lands as the same document as the same lines pasted from a formatted document", () => {
    const fromNotepad = makeEditor("");
    paste(fromNotepad, "a\nb\nc");
    const fromDocs = makeEditor("");
    fromDocs.view.pasteHTML("<p>a<br>b<br>c</p>");
    expect(blocks(fromNotepad)).toEqual(["paragraph:a⏎b⏎c"]);
    expect(fromNotepad.getJSON()).toEqual(fromDocs.getJSON());
  });

  it("a paste taken as typed has the same shape, with no markdown read into it", () => {
    const editor = makeEditor("");
    pasteAsTyped(editor, "## a\nb\n\nc");
    expect(blocks(editor)).toEqual(["paragraph:## a⏎b", "paragraph:c"]);
  });

  it("a pasted `## heading` is still a heading, holding no break", () => {
    const editor = makeEditor("");
    paste(editor, "## Title\nbody line 1\nbody line 2");
    expect(blocks(editor)).toEqual(["h2:Title", "paragraph:body line 1⏎body line 2"]);
  });

  it("a pasted list is still a list", () => {
    const editor = makeEditor("");
    paste(editor, "- one\n- two");
    expect(readMarkdown(editor)).toBe("- one\n- two");
  });

  it("the first and last lines merge into the paragraph the caret is in", () => {
    const editor = makeEditor("XY");
    editor.commands.setTextSelection(2);
    paste(editor, "a\nb\n\nc\nd");
    expect(blocks(editor)).toEqual(["paragraph:Xa⏎b", "paragraph:c⏎dY"]);
  });

  it("a one-line paste is still read as inline markdown", () => {
    const editor = makeEditor("XY");
    editor.commands.setTextSelection(2);
    paste(editor, "**bold** ");
    expect(readMarkdown(editor)).toBe("X**bold** Y");
  });
});

describe("pasted formatted text", () => {
  it("a pasted heading holding a break lands as a heading per line", () => {
    const editor = makeEditor("");
    editor.view.pasteHTML("<h1>a<br>b</h1>");
    expect(blocks(editor)).toEqual(["h1:a", "h1:b"]);
  });

  it("a pasted paragraph of lines heads only the line the caret is on", () => {
    const editor = makeEditor("");
    editor.view.pasteHTML("<p>Title<br>b<br>c</p>");
    expect(blocks(editor)).toEqual(["paragraph:Title⏎b⏎c"]);
    editor.commands.setTextSelection(3);
    editor.commands.toggleHeading({ level: 1 });
    expect(blocks(editor)).toEqual(["h1:Title", "paragraph:b⏎c"]);
  });
});

describe("the profile use case, which has no headings", () => {
  it("has no heading in its schema, so no heading tool reaches it", () => {
    const editor = makeEditor("# Not a title", "profile");
    expect(editor.schema.nodes.heading).toBeUndefined();
    expect(blocks(editor)).toEqual(["paragraph:Not a title"]);
  });

  it("keeps Shift+Enter as a line break that round-trips", () => {
    const editor = makeEditor("line1", "profile");
    editor.commands.focus("end");
    press(editor, "Enter", { shiftKey: true });
    type(editor, "line2");
    expect(readMarkdown(editor)).toBe("line1\\\nline2");
  });
});

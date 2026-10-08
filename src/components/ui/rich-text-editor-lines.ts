import { Heading } from "@tiptap/extension-heading";
import {
  DOMParser as SchemaDOMParser,
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
  type NodeType,
} from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { Extension, InputRule } from "@tiptap/react";

/**
 * **A line is the unit the writer sees, so it is the unit a heading takes.**
 *
 * Writers lay a report out with Shift+Enter, or paste text whose line breaks
 * arrive as hard breaks, so what looks like a title on its own line is often
 * the first line of one paragraph. A heading converts a whole textblock, and
 * markdown writes a heading on one line — so a heading over such a paragraph
 * swallowed every line under the title, and was then saved as a title ending
 * in a stray `\` with the rest demoted to body text on reload. Everything here
 * keeps the two pictures equal:
 *
 * - **Applying a heading splits the paragraph at its hard breaks first**, and
 *   then converts only the lines the selection touches: a caret is its own
 *   line, a selection is every line it reaches.
 * - **A heading never holds a hard break.** Shift+Enter in one starts a new
 *   block exactly as Enter does; any other path that leaves a break inside a
 *   heading — a paste, a join, stored content — is split into one heading per
 *   line by the end of the same transaction; and the serialiser writes a
 *   heading per line, so a backslash break cannot be saved inside one.
 * - **Pasted plain text keeps its lines.** Each line of a multi-line paste is
 *   its own paragraph rather than one paragraph joined by spaces.
 *
 * The schema is left allowing a break inside a heading on purpose. Excluding it
 * there would make ProseMirror *delete* the break wherever a paragraph is turned
 * into a heading or joined onto one, running the writer's lines together into
 * one word; splitting keeps every word where the writer put it.
 */

const HARD_BREAK = "hardBreak";

function isHardBreak(node: ProseMirrorNode): boolean {
  return node.type.name === HARD_BREAK;
}

function hasHardBreak(block: ProseMirrorNode): boolean {
  let found = false;
  block.forEach((child) => {
    if (isHardBreak(child)) found = true;
  });
  return found;
}

/**
 * A textblock's lines: its inline content cut at every hard break, with empty
 * lines dropped. A block with nothing in it is one empty line.
 */
function linesOf(block: ProseMirrorNode): Fragment[] {
  const lines: Fragment[] = [];
  let current: ProseMirrorNode[] = [];
  block.forEach((child) => {
    if (isHardBreak(child)) {
      if (current.length > 0) lines.push(Fragment.from(current));
      current = [];
    } else {
      current.push(child);
    }
  });
  if (current.length > 0) lines.push(Fragment.from(current));
  return lines.length > 0 ? lines : [Fragment.empty];
}

/**
 * Turn the textblock at `pos` into one block of its own type per line, inside
 * `tr`.
 *
 * Each break between two lines becomes a block boundary; a break with no line
 * on one side of it — at either end, or the second of a run — is deleted
 * instead, so the split never leaves an empty block behind. Done as one replace
 * per break rather than by rebuilding the block, so the selection maps through
 * it: a caret at the end of a line stays on that line, and one at the start of
 * the next lands on the next.
 */
function splitLines(tr: Transaction, pos: number, block: ProseMirrorNode) {
  const children: ProseMirrorNode[] = [];
  block.forEach((child) => children.push(child));
  const lastLine = children.findLastIndex((child) => !isHardBreak(child));

  const breaks: { at: number; split: boolean }[] = [];
  let offset = pos + 1;
  children.forEach((child, index) => {
    if (isHardBreak(child)) {
      breaks.push({
        at: offset,
        split:
          index > 0 && !isHardBreak(children[index - 1]) && index < lastLine,
      });
    }
    offset += child.nodeSize;
  });

  const boundary = new Slice(
    Fragment.from([
      block.type.create(block.attrs),
      block.type.create(block.attrs),
    ]),
    1,
    1,
  );
  // Last first, so the positions still to be replaced are not moved.
  for (const { at, split } of breaks.reverse()) {
    tr.step(new ReplaceStep(at, at + 1, split ? boundary : Slice.empty));
  }
}

/** Every textblock `include` accepts that holds a hard break, in document order. */
function blocksWithBreaks(
  tr: Transaction,
  from: number,
  to: number,
  include: (
    block: ProseMirrorNode,
    parent: ProseMirrorNode | null,
    index: number,
  ) => boolean,
): { pos: number; block: ProseMirrorNode }[] {
  const found: { pos: number; block: ProseMirrorNode }[] = [];
  tr.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (!node.isTextblock) return true;
    if (hasHardBreak(node) && include(node, parent, index)) {
      found.push({ pos, block: node });
    }
    return false;
  });
  return found;
}

/**
 * Split every paragraph the selection touches into its lines, ahead of making
 * the selected ones headings. Only a paragraph whose place could hold a heading
 * is split: one that cannot (the first paragraph of a list item) is left as the
 * writer had it, since the heading command will not convert it anyway.
 */
function splitSelectedParagraphs(tr: Transaction, headingType: NodeType) {
  const targets = tr.selection.ranges.flatMap((range) =>
    blocksWithBreaks(
      tr,
      range.$from.pos,
      range.$to.pos,
      (block, parent, index) =>
        block.type.name === "paragraph" &&
        parent !== null &&
        parent.canReplaceWith(index, index + 1, headingType),
    ),
  );
  for (const { pos, block } of targets.reverse()) splitLines(tr, pos, block);
}

/** The slice of the serialiser's state this heading writes with. */
interface HeadingSerializerState {
  write(content: string): void;
  renderInline(parent: ProseMirrorNode, fromBlockStart?: boolean): void;
  closeBlock(node: ProseMirrorNode): void;
}

/**
 * The heading node, with every way of making one working on lines.
 *
 * `toggleHeading` and `setHeading` are what the toolbar and the `Mod-Alt-n`
 * shortcuts call; the input rule is the typed `# ` at the start of a block.
 * Each splits the block into its lines first and then converts as before.
 */
export const LineHeading = Heading.extend({
  addCommands() {
    return {
      setHeading:
        (attributes) =>
        ({ tr, dispatch, commands }) => {
          if (!this.options.levels.includes(attributes.level)) return false;
          if (dispatch) splitSelectedParagraphs(tr, this.type);
          return commands.setNode(this.name, attributes);
        },
      toggleHeading:
        (attributes) =>
        ({ tr, dispatch, commands }) => {
          if (!this.options.levels.includes(attributes.level)) return false;
          if (dispatch) splitSelectedParagraphs(tr, this.type);
          return commands.toggleNode(this.name, "paragraph", attributes);
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        // As many `#` as the level, then a space; a level the field does not
        // offer is left as typed.
        find: /^(#+)\s$/,
        handler: ({ state, range, match }) => {
          const level = this.options.levels.find(
            (offered) => offered === match[1].length,
          );
          if (level === undefined) return null;
          const $start = state.doc.resolve(range.from);
          const container = $start.node(-1);
          if (
            !container.canReplaceWith(
              $start.index(-1),
              $start.indexAfter(-1),
              this.type,
            )
          ) {
            return null;
          }
          // The `#` is typed at the start of the block, before any break, so
          // neither the delete nor the split moves `range.from`.
          const { tr } = state;
          const blockPos = $start.before();
          tr.delete(range.from, range.to);
          const block = tr.doc.nodeAt(blockPos);
          if (block !== null) splitLines(tr, blockPos, block);
          tr.setBlockType(range.from, range.from, this.type, { level });
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const headingType = this.type;
    return [
      new Plugin({
        key: new PluginKey("headingLines"),
        // The backstop for every path the commands above do not own: a pasted
        // or dropped heading that carries a break, a paragraph with breaks
        // joined onto a heading by Backspace. Each line becomes a heading of
        // the same level, in the same transaction, so it is never seen whole.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const { tr } = newState;
          const broken = blocksWithBreaks(
            tr,
            0,
            tr.doc.content.size,
            (block) => block.type === headingType,
          );
          if (broken.length === 0) return null;
          for (const { pos, block } of broken.reverse()) {
            splitLines(tr, pos, block);
          }
          return tr;
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        /**
         * One markdown heading per line. A heading is a single line in
         * markdown, so a break inside one cannot be written: it would come
         * back as a title ending in `\` with its other lines as body text.
         * Nothing in the editor leaves a break in a heading, and this makes
         * that true of the saved value as well rather than merely likely.
         */
        serialize(state: HeadingSerializerState, node: ProseMirrorNode) {
          const marker = "#".repeat(Number(node.attrs.level));
          for (const line of linesOf(node)) {
            state.write(`${marker} `);
            state.renderInline(node.copy(line), false);
            state.closeBlock(node);
          }
        },
      },
    };
  },
});

/**
 * Shift+Enter (and Mod+Enter, its twin) inside a heading starts a new block,
 * exactly as Enter does, rather than inserting the break a heading cannot keep.
 *
 * Its own extension, at a high priority, because the hard-break extension binds
 * the same keys and the first keymap to answer wins; the heading node cannot
 * be given that priority itself without moving it ahead of the paragraph in the
 * schema, which would make it the document's default block.
 */
export const HeadingLineBreak = Extension.create({
  name: "headingLineBreak",
  priority: 1000,
  addKeyboardShortcuts() {
    const enterInHeading = () =>
      this.editor.state.selection.$from.parent.type.name === "heading" &&
      this.editor.commands.enter();
    return { "Shift-Enter": enterInHeading, "Mod-Enter": enterInHeading };
  },
});

/**
 * In a paste's markdown, the paragraphs' single line breaks — the ones
 * markdown would join with a space — made into hard breaks, which
 * `splitPastedLines` then turns into paragraphs. A line break inside a list
 * item is left alone: it continues that item.
 */
function lineBreaksToHardBreaks(root: HTMLElement) {
  for (const paragraph of root.querySelectorAll("p")) {
    if (paragraph.closest("li") !== null) continue;
    const walker = root.ownerDocument.createTreeWalker(
      paragraph,
      NodeFilter.SHOW_TEXT,
    );
    const texts: Text[] = [];
    while (walker.nextNode() !== null) {
      const { currentNode } = walker;
      if (currentNode instanceof Text && currentNode.data.includes("\n")) {
        texts.push(currentNode);
      }
    }
    for (const text of texts) {
      const parts = text.data.split("\n");
      const replacement = parts.flatMap((part, index) => [
        ...(index > 0 ? [root.ownerDocument.createElement("br")] : []),
        root.ownerDocument.createTextNode(part),
      ]);
      text.replaceWith(...replacement);
    }
  }
}

/** A pasted slice with each top-level paragraph cut into one per line. */
function splitPastedLines(slice: Slice): Slice {
  const blocks: ProseMirrorNode[] = [];
  slice.content.forEach((node) => {
    if (node.type.name === "paragraph" && hasHardBreak(node)) {
      for (const line of linesOf(node)) blocks.push(node.copy(line));
    } else {
      blocks.push(node);
    }
  });
  return new Slice(Fragment.from(blocks), slice.openStart, slice.openEnd);
}

/** Markdown rendered to HTML, as a detached element the schema can parse. */
function htmlRoot(html: string): HTMLElement {
  return new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
    .body;
}

/**
 * **Plain text on the clipboard: markdown, one paragraph per line.**
 *
 * Pasted plain text is parsed as markdown, so a write-up drafted elsewhere
 * keeps its headings and lists instead of showing the writer their own `##`.
 * But markdown joins lines with no blank line between them into one paragraph,
 * which is not what a writer pasting a few lines from their notes is looking
 * at — so a paste with a line break inside it is parsed block by block, and each
 * line of each paragraph is then made a paragraph of its own. The parse is
 * opened at both ends, so the first and last lines still merge into the block
 * the caret is in.
 *
 * A one-line paste is read exactly as the markdown extension reads it, inline
 * and keeping its surrounding spaces. A Shift-paste (`plainText`) is taken as
 * typed text, one paragraph per line, as ProseMirror's own parser takes it.
 *
 * This replaces the markdown extension's own paste handling outright, which is
 * switched off where the extension is configured: a clipboard parser has to
 * answer every paste it is given, so two of them cannot share the job.
 */
export const PastedText = Extension.create({
  name: "pastedText",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey("pastedText"),
        props: {
          clipboardTextParser: (text, $context, plainText) => {
            const { schema } = editor;
            if (plainText) {
              const marks = $context.marks();
              const paragraphs = text
                .split(/\r\n?|\n/)
                .filter((line) => line !== "")
                .map((line) =>
                  schema.nodes.paragraph.create(null, schema.text(line, marks)),
                );
              return Slice.maxOpen(Fragment.from(paragraphs));
            }
            const { parser } = editor.storage.markdown;
            const parse = (root: HTMLElement) =>
              SchemaDOMParser.fromSchema(schema).parseSlice(root, {
                preserveWhitespace: true,
                context: $context,
              });
            if (!/[\r\n]/.test(text.trim())) {
              return parse(htmlRoot(parser.parse(text, { inline: true })));
            }
            const root = htmlRoot(parser.parse(text));
            lineBreaksToHardBreaks(root);
            return splitPastedLines(parse(root));
          },
        },
      }),
    ];
  },
});

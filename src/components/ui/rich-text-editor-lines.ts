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
import { setBlockType } from "@tiptap/pm/commands";
import {
  Extension,
  InputRule,
  isNodeActive,
  type Command,
} from "@tiptap/react";

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
 * - **Applying a heading converts only the lines the selection touches**: a
 *   caret is its own line, a selection is every line it reaches. The paragraph
 *   is cut at the breaks bordering those lines and nowhere else, so the lines
 *   above and below stay one paragraph each, their own breaks intact.
 * - **A heading never holds a hard break.** Shift+Enter in one starts a new
 *   block exactly as Enter does; any other path that leaves a break inside a
 *   heading — a paste, a join, stored content — is split into one heading per
 *   line by the end of the same transaction; and the serialiser writes a
 *   heading per line, so a backslash break cannot be saved inside one.
 * - **Pasted plain text keeps its lines.** A single line break in a paste is a
 *   hard break rather than a space, as it is when the same lines are pasted
 *   from a formatted document; a blank line still separates paragraphs.
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
 * Where the textblock at `pos` breaks: the position of each hard break, and
 * for each of the lines between them (one more than there are breaks, empty
 * ones included) whether it holds nothing.
 */
function breaksOf(
  pos: number,
  block: ProseMirrorNode,
): { breaks: number[]; empty: boolean[] } {
  const breaks: number[] = [];
  const empty: boolean[] = [true];
  let offset = pos + 1;
  block.forEach((child) => {
    if (isHardBreak(child)) {
      breaks.push(offset);
      empty.push(true);
    } else {
      empty[empty.length - 1] = false;
    }
    offset += child.nodeSize;
  });
  return { breaks, empty };
}

/** A run of a textblock's lines, by index, first and last included. */
type LineRun = readonly [first: number, last: number];

/** Every line of a block with `lineCount` lines, each a run of its own. */
function everyLine(lineCount: number): LineRun[] {
  return Array.from({ length: lineCount }, (_, line) => [line, line] as const);
}

/**
 * The runs that make lines `first` to `last` blocks of their own: the lines
 * before them stay together as one block, each of them is one, and the lines
 * after them stay together as one.
 */
function aroundLines(
  lineCount: number,
  first: number,
  last: number,
): LineRun[] {
  return [
    ...(first > 0 ? [[0, first - 1] as const] : []),
    ...everyLine(lineCount).slice(first, last + 1),
    ...(last < lineCount - 1 ? [[last + 1, lineCount - 1] as const] : []),
  ];
}

/**
 * Cut the textblock at `pos` into one block of its own type per run of lines,
 * inside `tr`. `runs` covers every line, in order.
 *
 * A break inside a run stays a break. A break between two runs becomes a block
 * boundary — except that a run does not start or end on an empty line at a
 * boundary: those empty lines are dropped with the breaks around them, and a
 * run of nothing but empty lines is dropped whole, so the cut never leaves an
 * empty block or one starting or ending in a stray break. Done as one replace
 * per break rather than by rebuilding the block, so the selection maps through
 * it: a caret at the end of a line stays on that line, and one at the start of
 * the next lands on the next.
 */
function splitRuns(
  tr: Transaction,
  pos: number,
  block: ProseMirrorNode,
  runs: readonly LineRun[],
) {
  const { breaks, empty } = breaksOf(pos, block);
  const kept: LineRun[] = [];
  runs.forEach(([first, last], index) => {
    const filled: number[] = [];
    for (let line = first; line <= last; line++) {
      if (!empty[line]) filled.push(line);
    }
    if (filled.length === 0) return;
    kept.push([
      index === 0 ? first : filled[0],
      index === runs.length - 1 ? last : filled[filled.length - 1],
    ]);
  });

  const boundary = new Slice(
    Fragment.from([
      block.type.create(block.attrs),
      block.type.create(block.attrs),
    ]),
    1,
    1,
  );
  // Break `index` sits between lines `index` and `index + 1`. Last first, so
  // the positions still to be replaced are not moved.
  for (let index = breaks.length - 1; index >= 0; index--) {
    if (kept.some(([first, last]) => first <= index && index < last)) continue;
    const ending = kept.findIndex(([, last]) => last === index);
    const at = breaks[index];
    tr.step(
      new ReplaceStep(
        at,
        at + 1,
        ending !== -1 && ending < kept.length - 1 ? boundary : Slice.empty,
      ),
    );
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
 * Cut every paragraph the selection touches at the breaks bordering the lines
 * it touches, ahead of making those lines headings: a caret is its own line, a
 * selection is every line it reaches. The lines before the touched ones stay
 * together as one paragraph with their breaks, and so do the lines after.
 *
 * A paragraph whose place cannot hold a heading — one inside a list item — is
 * not cut where it stands, since a second paragraph there would make the list
 * loose. The heading command lifts it out of the list instead and then calls
 * this again, cutting it once it stands where a heading can.
 */
function splitSelectedParagraphs(tr: Transaction, headingType: NodeType) {
  const { from, to } = tr.selection;
  const targets = blocksWithBreaks(
    tr,
    from,
    to,
    (block, parent, index) =>
      block.type.name === "paragraph" &&
      parent !== null &&
      parent.canReplaceWith(index, index + 1, headingType),
  );
  for (const { pos, block } of targets.reverse()) {
    const { breaks } = breaksOf(pos, block);
    const starts = [pos + 1, ...breaks.map((at) => at + 1)];
    const ends = [...breaks, pos + block.nodeSize - 1];
    const touched = starts.flatMap((start, line) =>
      start <= to && ends[line] >= from ? [line] : [],
    );
    splitRuns(
      tr,
      pos,
      block,
      aroundLines(starts.length, touched[0], touched[touched.length - 1]),
    );
  }
}

/**
 * Make the selected lines headings, as Tiptap's own `setNode` makes a block
 * one but with the lines cut out first: cut the selected paragraphs at the
 * lines' borders; only if a heading still cannot stand there (a list item),
 * lift the selection out to the top level; cut again, now that it is there;
 * convert. All in one transaction, so it is one undo step.
 */
function setLineHeading(
  headingType: NodeType,
  attributes: Record<string, unknown>,
): Command {
  const cut: Command = ({ tr, dispatch }) => {
    if (dispatch) splitSelectedParagraphs(tr, headingType);
    return true;
  };
  return ({ chain }) =>
    chain()
      .command(cut)
      .command(
        ({ state, commands }) =>
          setBlockType(headingType, attributes)(state) || commands.clearNodes(),
      )
      .command(cut)
      .command(({ state, dispatch }) =>
        setBlockType(headingType, attributes)(state, dispatch),
      )
      .run();
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
 * shortcuts call; the input rule is the typed `# ` at the start of a block,
 * which heads the block's first line. Each cuts the lines it converts out of
 * their paragraph first.
 */
export const LineHeading = Heading.extend({
  addCommands() {
    return {
      setHeading:
        (attributes) =>
        (props) => {
          if (!this.options.levels.includes(attributes.level)) return false;
          return setLineHeading(this.type, attributes)(props);
        },
      toggleHeading:
        (attributes) =>
        (props) => {
          if (!this.options.levels.includes(attributes.level)) return false;
          if (isNodeActive(props.state, this.type, attributes)) {
            return props.commands.setNode("paragraph");
          }
          return setLineHeading(this.type, attributes)(props);
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
          if (block !== null) {
            const lineCount = breaksOf(blockPos, block).breaks.length + 1;
            splitRuns(tr, blockPos, block, aroundLines(lineCount, 0, 0));
          }
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
            const lineCount = breaksOf(pos, block).breaks.length + 1;
            splitRuns(tr, pos, block, everyLine(lineCount));
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
 * markdown would join with a space — made into hard breaks. A line break
 * inside a list item is left alone: it continues that item.
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

/** Markdown rendered to HTML, as a detached element the schema can parse. */
function htmlRoot(html: string): HTMLElement {
  return new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
    .body;
}

/**
 * **Plain text on the clipboard: markdown, with its line breaks kept.**
 *
 * Pasted plain text is parsed as markdown, so a write-up drafted elsewhere
 * keeps its headings and lists instead of showing the writer their own `##`.
 * But markdown joins lines with no blank line between them with a space, which
 * is not what a writer pasting a few lines from their notes is looking at — so
 * each single line break inside a paragraph becomes a hard break, and a blank
 * line still starts a new paragraph. That is the shape a formatted paste of the
 * same lines arrives in, so plain and formatted pastes agree. The parse is
 * opened at both ends, so the first and last lines still merge into the block
 * the caret is in.
 *
 * A one-line paste is read exactly as the markdown extension reads it, inline
 * and keeping its surrounding spaces. A Shift-paste (`plainText`) is taken as
 * typed text with no markdown read into it, in the same shape: a hard break per
 * line break, a paragraph per run of lines between blank ones.
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
              // Runs of lines, a blank line ending each.
              const runs: string[][] = [[]];
              for (const line of text.split(/\r\n?|\n/)) {
                if (line.trim() === "") runs.push([]);
                else runs[runs.length - 1].push(line);
              }
              const paragraphs = runs
                .filter((lines) => lines.length > 0)
                .map((lines) =>
                  schema.nodes.paragraph.create(
                    null,
                    lines.flatMap((line, index) => [
                      ...(index > 0 ? [schema.nodes[HARD_BREAK].create()] : []),
                      schema.text(line, marks),
                    ]),
                  ),
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
            return parse(root);
          },
        },
      }),
    ];
  },
});

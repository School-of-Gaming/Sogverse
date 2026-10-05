import type { Nodes } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Authored markdown as plain text: the words a reader sees, without the
 * syntax — for the places a page's words are restated outside its markup (a
 * `FAQPage` answer, the plain text of a section). Parsed with the same
 * markdown grammar the shared renderer reads, so a construct is the same
 * construct in both; each block is one paragraph of the result, a link is its
 * label, and a hard break is a space.
 */
export function markdownToPlainText(source: string): string {
  const tree = unified().use(remarkParse).parse(source);
  const blocks: string[] = [];
  collectBlocks(tree, blocks);
  return blocks
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block !== "")
    .join("\n\n");
}

function collectBlocks(node: Nodes, blocks: string[]): void {
  switch (node.type) {
    case "paragraph":
    case "heading":
      blocks.push(inlineText(node));
      return;
    case "code":
      blocks.push(node.value);
      return;
    default:
      if ("children" in node) {
        for (const child of node.children) collectBlocks(child, blocks);
      }
  }
}

function inlineText(node: Nodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "break":
      return " ";
    default:
      return "children" in node
        ? node.children.map((child) => inlineText(child)).join("")
        : "";
  }
}

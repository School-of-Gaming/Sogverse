import type { MarkdownStorage } from "tiptap-markdown";

/**
 * Teach the editor's extension storage about the markdown serialiser.
 *
 * Tiptap ships `Storage` as an empty interface precisely so extensions can
 * declare what they put on it, and every first-party extension does. The
 * markdown extension we use is third-party and does not, so it declares its
 * storage *shape* but never attaches it to the editor's — which leaves
 * `editor.storage.markdown` unknown to the compiler at every call site.
 *
 * Declaring it here is the mechanism working as designed, and it is the only
 * honest option available: the alternatives are an assertion (banned, and it
 * would be lying about a shape rather than describing one) or a runtime guard on
 * a value that is statically guaranteed to be there whenever the extension is
 * registered.
 */
declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage;
  }
}

/**
 * The markdown extension's parser, which its storage carries and its declared
 * shape leaves out. The rich-text editor reads pasted plain text through this
 * same parser, so a paste is read in the one dialect a stored value is.
 */
declare module "tiptap-markdown" {
  interface MarkdownStorage {
    parser: {
      /** Markdown in, the HTML the editor's schema parses. */
      parse(content: string, options?: { inline?: boolean }): string;
    };
  }
}

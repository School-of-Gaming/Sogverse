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

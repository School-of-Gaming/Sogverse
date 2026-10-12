import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

/**
 * **The shared body editor, with the real rich editor**: what every editor of
 * content written per locale puts a rich body on screen with.
 *
 * Two things are pinned. The rich editor respells a stored body in its own
 * dialect and reports it on its first transaction with nothing typed, so a
 * form comparing what it is handed with the stored body would read an
 * untouched body as edited; the body record this editor fills is what stops
 * that. And the editor reads its value once, at mount, so a form put back to
 * its baseline — a Discard — would go on showing the discarded text; the
 * record's `reset` re-seeds it.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  AuthoredBodyEditor,
  useAuthoredBodies,
} from "@/components/ui/authored-body-editor";
import { sameAuthoredBody } from "@/lib/authored-bodies";

/**
 * `*` bullets, `__strong__` and a run of blank lines, ending in a list, so the
 * first transaction respells it and appends a paragraph.
 */
const FOREIGN_DIALECT = ["Some __strong__ words.", "", "", "", "* one", "* two"].join("\n");

/** A form holding one body, with its unsaved state and a Discard. */
function Form({ saved }: { saved: string }) {
  const bodies = useAuthoredBodies();
  const [body, setBody] = useState(saved);
  const dirty = !sameAuthoredBody(body, saved, bodies);
  return (
    <>
      <AuthoredBodyEditor
        bodies={bodies}
        useCase="article"
        value={body}
        onChange={setBody}
        placeholder=""
        ariaLabel="Body"
      />
      <output aria-label="dirty">{String(dirty)}</output>
      <button
        type="button"
        onClick={() => {
          setBody(saved);
          bodies.reset();
        }}
      >
        Discard
      </button>
    </>
  );
}

/** The editor loads on demand; loaded once here, every case resolves it from the module cache. */
beforeAll(async () => {
  await import("@/components/ui/rich-text-editor");
});

/** The rich editor on the writing surface, once it is up. */
async function editorOnScreen(): Promise<Editor> {
  const surface = await screen.findByRole("textbox", { name: "Body" });
  // Tiptap hangs the instance on its writing surface.
  const editor = (surface as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error("no editor on the writing surface");
  await waitFor(() => expect(editor.isInitialized).toBe(true));
  return editor;
}

const dirty = () => screen.getByRole("status", { name: "dirty" }).textContent;

describe("the shared body editor", () => {
  it("does not count a body it respelled, untouched, as a change", async () => {
    render(<Form saved={FOREIGN_DIALECT} />);
    const editor = await editorOnScreen();
    expect(dirty()).toBe("false");

    // A caret placed, as a click places one: the editor's first transaction,
    // which reports the body respelled.
    act(() => {
      editor.commands.focus("end");
    });
    const reported: unknown = editor.storage.markdown.getMarkdown();
    expect(typeof reported === "string" && reported.trim()).not.toBe(
      FOREIGN_DIALECT.trim(),
    );
    expect(dirty()).toBe("false");
  });

  it("re-seeds the editor with the baseline on a reset", async () => {
    render(<Form saved="Hello world" />);
    const editor = await editorOnScreen();
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertContent(" and more");
    });
    expect(dirty()).toBe("true");
    expect(editor.getText()).toContain("and more");

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    const reseeded = await editorOnScreen();
    expect(reseeded).not.toBe(editor);
    expect(reseeded.getText()).toBe("Hello world");
    expect(dirty()).toBe("false");
  });
});

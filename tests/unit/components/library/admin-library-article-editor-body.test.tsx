import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";

/**
 * **Save stays off on an article nobody has edited — with the real editor.**
 *
 * The rich editor writes markdown back in its own dialect, and it reports the
 * document on its first transaction whether or not anything was typed: a caret
 * placed by a click is enough, and a body ending in a list gains its trailing
 * paragraph then. So a stored body spelled differently from the editor's own
 * dialect came back through `onChange` as an "edit", and Save lit up on an
 * untouched article. The other editor tests replace the editor with a
 * textarea and cannot see this; this one keeps it.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ list: (items: string[]) => items.join(" + ") }),
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
  useNow: () => new Date("2026-09-21T09:30:00Z"),
}));

import { LibraryArticleEditor } from "@/components/admin/library/library-article-editor";
import type { AdminLibraryArticle } from "@/services/library";

/** A saved draft, never published; each case puts its own body in it. */
const DRAFT: AdminLibraryArticle = {
  draft: {
    id: "bb744329-6849-4d79-be8e-da6b5bdec6fa",
    versions: [
      { locale: "en", title: "Setting up a family gaming agreement", summary: "", body: "" },
    ],
    category: "screen_time",
    coverImageId: null,
    coverPath: null,
    coverLabel: null,
    createdAt: "2026-09-12T11:00:00Z",
    updatedAt: "2026-09-15T08:05:00Z",
  },
  publication: null,
  hasUnpublishedChanges: false,
};

/**
 * Every spelling here means what the editor would write differently: `*`
 * bullets, `__strong__`, a two-space hard break, extra blank lines, a stray
 * escape, a bare `<` — and it ends in a list, so the first transaction
 * appends a paragraph.
 */
const FOREIGN_DIALECT = [
  "Some __strong__ words and a hard  ",
  "break, 1\\. an escape and a < sign.",
  "",
  "",
  "",
  "* one",
  "* two",
].join("\n");

/**
 * The bodies the rich seed writes — every article an admin previewing a local
 * stack opens. Read from the seed itself, so a new or rewritten seed article
 * is covered without anybody copying it here.
 */
const SEEDED_BODIES = [
  // From the checkout root, which vitest runs in; `import.meta.url` is not a
  // file URL under jsdom.
  ...readFileSync(join(process.cwd(), "supabase", "rich-seed.sql"), "utf8").matchAll(/'body',\s*\$md\$([\s\S]*?)\$md\$/g),
].map((match) => match[1]);

function article(body: string): AdminLibraryArticle {
  return {
    ...DRAFT,
    draft: {
      ...DRAFT.draft,
      versions: [{ ...DRAFT.draft.versions[0], body }],
    },
  };
}

/**
 * The body field loads the rich editor on demand, and a cold load of it —
 * ProseMirror, the parser, the serialiser — can outlast `findByRole`'s window
 * when the whole suite is running. Loaded once here, the on-demand import
 * resolves from the module cache, so no case depends on how long the first
 * load took.
 */
beforeAll(async () => {
  await import("@/components/ui/rich-text-editor");
});

/** Render the editor and wait for the real rich editor to be up. */
async function renderEditor(body: string): Promise<Editor> {
  // The cover field's upload is a mutation, so the editor needs a query client.
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LibraryArticleEditor
        article={article(body)}
        actions={{
          save: async () => {},
          publish: async () => {},
          unpublish: async () => {},
        }}
      />
    </QueryClientProvider>,
  );
  const surface = await screen.findByRole("textbox", { name: "fields.body" });
  // Tiptap hangs the instance on its writing surface.
  const editor = (surface as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error("no editor on the writing surface");
  // `onSeeded` fires from the editor's create event, a tick after mount.
  await waitFor(() => expect(editor.isInitialized).toBe(true));
  return editor;
}

const saveDisabled = () =>
  screen.getByRole("button", { name: "actions.save" }).hasAttribute("disabled");

describe("Save on an untouched article, with the real editor", () => {
  it("finds the rich seed's articles", () => {
    expect(SEEDED_BODIES.length).toBeGreaterThanOrEqual(5);
  });

  it.each<[string, string]>([
    ["a body in another markdown dialect", FOREIGN_DIALECT],
    ...SEEDED_BODIES.map((body, index): [string, string] => [
      `rich-seed body ${index + 1}`,
      body,
    ]),
  ])("stays off after the editor reports %s untouched", async (_name, body) => {
    const editor = await renderEditor(body);
    expect(saveDisabled()).toBe(true);

    // A caret placed, as a click places one: the editor's first transaction.
    act(() => {
      editor.commands.focus("end");
    });
    expect(saveDisabled()).toBe(true);
  });

  it("the body the editor reports untouched is not the stored one — the case the fix exists for", async () => {
    const editor = await renderEditor(FOREIGN_DIALECT);
    const reported = vi.fn();
    editor.on("update", ({ editor: instance }) =>
      reported(instance.storage.markdown.getMarkdown()),
    );
    act(() => {
      editor.commands.focus("end");
    });
    expect(reported).toHaveBeenCalled();
    expect(reported.mock.lastCall?.[0].trim()).not.toBe(FOREIGN_DIALECT.trim());
  });

  it("turns on for a real edit, and off again when it is undone", async () => {
    const editor = await renderEditor(FOREIGN_DIALECT);
    act(() => {
      editor.commands.focus("end");
    });

    act(() => {
      editor.commands.insertContent("x");
    });
    expect(saveDisabled()).toBe(false);

    act(() => {
      editor.commands.undo();
    });
    expect(saveDisabled()).toBe(true);
  });
});

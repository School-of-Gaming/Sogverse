import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

/**
 * **The team profile editor's language tabs, bio and Discard — with the real
 * rich editor.**
 *
 * The rich editor writes markdown back in its own dialect and reports the
 * document on its first transaction whether or not anything was typed, so a
 * stored bio spelled differently came back as an "edit" and lit up Save on an
 * untouched profile. And the editor reads its text once, at mount, so a
 * Discard that only reset the form went on showing the discarded bio. A stub
 * editor can see neither; these cases keep the real one.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { TeamProfileEditorBody } from "@/components/team/team-profile-editor-body";
import {
  LONG_DESCRIPTION_MAX_LENGTH,
  profileWithContent,
  type TeamProfileContent,
} from "@/components/team/team-profile-form";
import type {
  GeduTeamProfile,
  TeamProfileTranslation,
} from "@/services/team-profiles/team-profiles.types";

/**
 * Every spelling here means what the editor would write differently: `*`
 * bullets, `__strong__`, a two-space hard break, extra blank lines — and it
 * ends in a list, so the first transaction appends a paragraph.
 */
const FOREIGN_DIALECT = [
  "Runs __Minecraft__ clubs in Espoo and a hard  ",
  "break.",
  "",
  "",
  "",
  "* redstone",
  "* speedruns",
].join("\n");

function profile(
  translations: TeamProfileTranslation[],
): GeduTeamProfile {
  return {
    kind: "gedu",
    id: "eadea095-24f1-40cd-bc31-e898edc9ab3a",
    firstName: "Eetu",
    nickname: "Creeperhug",
    pick: null,
    photo: null,
    translations,
    spokenLanguages: ["fi", "en"],
  };
}

const ENGLISH: TeamProfileTranslation = {
  locale: "en",
  shortDescription: "Redstone nerd.",
  longDescription: FOREIGN_DIALECT,
  funFact: null,
};

/**
 * Loaded once here, so the editor's on-demand import resolves from the module
 * cache and no case depends on how long a cold load takes.
 */
beforeAll(async () => {
  await import("@/components/ui/rich-text-editor");
});

/** Wait for the real rich editor behind the bio to be up, and hand it back. */
async function bioEditor(): Promise<Editor> {
  const surface = await screen.findByRole("textbox", { name: "longDescription" });
  // Tiptap hangs the instance on its writing surface.
  const editor = (surface as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error("no editor on the writing surface");
  // `onSeeded` fires from the editor's create event, a tick after mount.
  await waitFor(() => expect(editor.isInitialized).toBe(true));
  return editor;
}

function renderBody(
  translations: TeamProfileTranslation[],
  onSave: (content: TeamProfileContent) => void = () => {},
) {
  render(
    <TeamProfileEditorBody
      profile={profile(translations)}
      ready={false}
      approved={false}
      actions={{ onSave }}
    />,
  );
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const disabled = (name: string) => button(name).hasAttribute("disabled");

describe("the team profile editor, with the real rich editor", () => {
  it("is not dirty when a bio in another markdown dialect is opened and focused", async () => {
    renderBody([ENGLISH]);
    const editor = await bioEditor();
    expect(disabled("actions.save")).toBe(true);

    // A caret placed, as a click places one: the editor's first transaction.
    act(() => {
      editor.commands.focus("end");
    });
    expect(disabled("actions.save")).toBe(true);
    expect(disabled("actions.discard")).toBe(true);

    act(() => {
      editor.commands.insertContent("x");
    });
    expect(disabled("actions.save")).toBe(false);
  });

  it("Discard puts the saved bio back in the editor", async () => {
    renderBody([ENGLISH]);
    const editor = await bioEditor();
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertContent("THROWN AWAY");
    });
    expect(editor.getText()).toContain("THROWN AWAY");

    fireEvent.click(button("actions.discard"));

    const reseeded = await bioEditor();
    expect(reseeded).not.toBe(editor);
    expect(reseeded.getText()).not.toContain("THROWN AWAY");
    expect(reseeded.getText()).toContain("speedruns");
    act(() => {
      reseeded.commands.focus("end");
    });
    expect(disabled("actions.save")).toBe(true);
  });

  it("is not dirty once a save hands the saved bio back as the baseline", async () => {
    function Shell() {
      const [saved, setSaved] = useState(profile([ENGLISH]));
      return (
        <TeamProfileEditorBody
          profile={saved}
          ready={false}
          approved={false}
          actions={{
            onSave: (content) => setSaved(profileWithContent(saved, content)),
          }}
        />
      );
    }
    render(<Shell />);
    const editor = await bioEditor();
    act(() => {
      editor.commands.focus("end");
      editor.commands.insertContent(" more");
    });
    fireEvent.click(button("actions.save"));
    expect(disabled("actions.save")).toBe(true);

    // Away to another tab and back remounts the editor on the saved bio.
    fireEvent.change(screen.getByRole("combobox", { name: "addLanguage" }), {
      target: { value: "fi" },
    });
    fireEvent.click(button(/^English/));
    const remounted = await bioEditor();
    act(() => {
      remounted.commands.focus("end");
    });
    expect(disabled("actions.save")).toBe(true);
  });

  it("drops a language tab left blank, from the save and from the dirty check", async () => {
    const onSave = vi.fn<(content: TeamProfileContent) => void>();
    renderBody([ENGLISH], onSave);
    await bioEditor();

    fireEvent.change(screen.getByRole("combobox", { name: "addLanguage" }), {
      target: { value: "sv" },
    });
    expect(button(/^Svenska/).getAttribute("aria-pressed")).toBe("true");
    expect(disabled("actions.save")).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: /^nickname/ }), {
      target: { value: "Creeper" },
    });
    fireEvent.click(button("actions.save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const content = onSave.mock.calls[0][0];
    expect(content.translations.map((row) => row.locale)).toEqual(["en"]);
  });

  it("marks each tab complete or not, and a tab whose bio is too long with the reason", async () => {
    renderBody([
      ENGLISH,
      {
        locale: "fi",
        shortDescription: "",
        longDescription: "a".repeat(LONG_DESCRIPTION_MAX_LENGTH + 1),
        funFact: null,
      },
    ]);
    await bioEditor();

    const english = button(/^English/).textContent;
    expect(english).toContain("complete");
    expect(english).not.toContain("notComplete");
    expect(english).not.toContain("bioTooLong");

    const finnish = button(/^Suomi/).textContent;
    expect(finnish).toContain("notComplete");
    expect(finnish).toContain("bioTooLong");
    expect(disabled("actions.save")).toBe(true);
  });
});

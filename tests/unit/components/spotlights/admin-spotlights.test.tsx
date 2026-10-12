import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

/**
 * **The admin spotlight pages' rules.** The form's: what a save is refused
 * for before it is tried — no language, a language missing its title or its
 * text, and the picture taken off a spotlight that is switched on — and
 * whether the form holds anything unsaved. The list's: the whole card opens
 * the editor while the switch and the delete do only their own thing, a spotlight with no
 * picture cannot be switched on and says why in place, one that is on can
 * always be switched off, a refused switch is named in the row, and a failed
 * read says so rather than claiming there are no spotlights.
 *
 * Translations echo their key, so nothing here depends on wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

import { AdminSpotlightsPage } from "@/components/admin/spotlights/admin-spotlights-page";
import {
  emptySpotlightForm,
  sameAsSaved,
  spotlightFormFromSaved,
  spotlightInputFromForm,
  spotlightSaveBlocker,
} from "@/components/admin/spotlights/spotlight-form";
import type { AdminSpotlight } from "@/services/spotlights";

const ON: AdminSpotlight = {
  id: "a5717a61-d273-4041-b9b4-1abfb039694d",
  versions: [
    { locale: "en", title: "Autumn camps are open", body: "Book a place." },
    { locale: "fi", title: "Syysleirit ovat auki", body: "Varaa paikka." },
  ],
  imageId: "0bed5e32-5523-43ed-ac77-9192750304e9",
  imagePath: "abc.jpg",
  imageLabel: "Camp",
  enabled: true,
  createdAt: "2026-10-10T09:00:00Z",
};

const NO_PICTURE: AdminSpotlight = {
  id: "8f81c329-ee17-4ae1-ad52-efec589c9f27",
  versions: [{ locale: "sv", title: "Ny klubb", body: "Anmäl dig." }],
  imageId: null,
  imagePath: null,
  imageLabel: null,
  enabled: false,
  createdAt: "2026-10-09T09:00:00Z",
};

beforeEach(() => {
  // The picture's URL is built on the project's storage origin.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("the spotlight form", () => {
  it("refuses a save with no language written", () => {
    expect(spotlightSaveBlocker(emptySpotlightForm("en"), false)).toEqual({
      kind: "noVersion",
    });
  });

  it("refuses a language with a title and no text", () => {
    const form = emptySpotlightForm("en");
    form.versions.en = { title: "Hello", body: "  " };
    expect(spotlightSaveBlocker(form, false)).toEqual({
      kind: "incomplete",
      locale: "en",
    });
  });

  it("refuses taking the picture off a spotlight that is on, and allows it on one that is off", () => {
    const form = { ...spotlightFormFromSaved(ON, "en"), picture: null };
    expect(spotlightSaveBlocker(form, true)).toEqual({ kind: "pictureWhileOn" });
    expect(spotlightSaveBlocker(form, false)).toBeNull();
  });

  it("opens a saved spotlight on the admin's language and holds nothing unsaved", () => {
    const form = spotlightFormFromSaved(ON, "fi");
    expect(form.activeLocale).toBe("fi");
    expect(sameAsSaved(form, ON)).toBe(true);
    expect(spotlightInputFromForm(form)).toEqual({
      versions: ON.versions,
      imageId: ON.imageId,
    });
  });

  it("leaves an untouched empty tab out of the save", () => {
    const form = spotlightFormFromSaved(ON, "en");
    form.versions.sv = { title: "", body: "" };
    expect(sameAsSaved(form, ON)).toBe(true);
  });
});

describe("the spotlight list", () => {
  function renderList(setEnabled = vi.fn(async () => {})) {
    render(
      <AdminSpotlightsPage
        spotlights={[ON, NO_PICTURE]}
        status="success"
        actions={{ setEnabled, remove: vi.fn(async () => {}) }}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    return { setEnabled, on: rows[0], noPicture: rows[1] };
  }

  it("holds back the switch of a spotlight with no picture and says why", () => {
    const { noPicture, on } = renderList();
    expect(within(noPicture).getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(within(noPicture).getByText("needsPicture")).toBeTruthy();
    expect(within(on).getByRole("checkbox")).toHaveProperty("disabled", false);
    expect(within(on).queryByText("needsPicture")).toBeNull();
  });

  it("names each spotlight in the admin's language, falling back as a reader would", () => {
    const { on, noPicture } = renderList();
    expect(within(on).getAllByText("Autumn camps are open").length).toBeGreaterThan(0);
    expect(within(noPicture).getAllByText("Ny klubb").length).toBeGreaterThan(0);
  });

  it("opens the editor from the whole card, and leaves the switch and the delete to themselves", async () => {
    const setEnabled = vi.fn(async () => {});
    const { on } = renderList(setEnabled);

    // One link per card, named by the title, opening the editor — stretched
    // over the card by its `::after`, which the card is the containing block
    // for. jsdom paints no pseudo-elements, so the shape is what is asserted.
    const [link] = within(on).getAllByRole("link");
    expect(within(on).getAllByRole("link")).toHaveLength(1);
    expect(link.textContent).toBe("Autumn camps are open");
    expect(link.getAttribute("href")).toContain(ON.id);
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    expect(link.parentElement?.closest(".relative")).toBe(on.firstElementChild);

    // The controls sit outside the anchor (no button inside a link), each
    // lifted above the stretched link so a press reaches it and not the card.
    const checkbox = within(on).getByRole("checkbox");
    const remove = within(on).getByRole("button", { name: "actions.delete" });
    for (const control of [checkbox, remove]) {
      expect(control.closest("a")).toBeNull();
      expect(control.closest(".z-10")).not.toBeNull();
    }

    const navigated = vi.fn();
    link.addEventListener("click", navigated);
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(setEnabled).toHaveBeenCalledWith(ON.id, false);
    await act(async () => {
      fireEvent.click(remove);
    });
    expect(screen.getByText("deleteConfirm.title")).toBeTruthy();
    expect(navigated).not.toHaveBeenCalled();
  });

  it("switches off, and names a refusal in the row", async () => {
    const setEnabled = vi.fn(async () => {
      throw { code: "23514", message: "no picture" };
    });
    const { on } = renderList(setEnabled);
    await act(async () => {
      fireEvent.click(within(on).getByRole("checkbox"));
    });
    expect(setEnabled).toHaveBeenCalledWith(ON.id, false);
    expect(within(on).getByRole("alert").textContent).toContain(
      "errors.switchFailedWithReason reason=no picture",
    );
  });

  it("shows the empty state only once the read has answered", () => {
    const actions = { setEnabled: vi.fn(), remove: vi.fn() };
    const { rerender } = render(
      <AdminSpotlightsPage spotlights={[]} status="pending" actions={actions} />,
    );
    expect(screen.queryByText("empty")).toBeNull();
    expect(screen.queryByText("listLoadError")).toBeNull();
    rerender(<AdminSpotlightsPage spotlights={[]} status="success" actions={actions} />);
    expect(screen.getByText("empty")).toBeTruthy();
    expect(screen.queryByText("listLoadError")).toBeNull();
  });

  it("says a failed read failed, never that there are no spotlights", () => {
    const actions = { setEnabled: vi.fn(), remove: vi.fn() };
    const { rerender } = render(
      <AdminSpotlightsPage spotlights={[]} status="error" actions={actions} />,
    );
    expect(screen.getByText("listLoadError")).toBeTruthy();
    expect(screen.queryByText("empty")).toBeNull();
    // A failed refetch keeps the rows it had and prints no line over them.
    rerender(<AdminSpotlightsPage spotlights={[ON]} status="error" actions={actions} />);
    expect(screen.queryByText("listLoadError")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

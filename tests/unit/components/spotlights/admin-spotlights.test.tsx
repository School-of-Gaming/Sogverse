import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **The admin spotlight pages' rules.** The form's: what a save is refused
 * for before it is tried — no language, a language missing its title or its
 * text — whether the form holds anything unsaved, and that taking the picture
 * off switches the spotlight off. The editor's: whether the spotlight is in
 * the emails is a box on the form, disabled with the reason while there is no
 * picture, counted as an unsaved change, and sent in the one save with the
 * picture and the text. The list's: each spotlight's state is read as a
 * status with no control to change it, the whole card opens the editor while
 * the delete does only its own thing, and a failed read says so rather than
 * claiming there are no spotlights.
 *
 * Translations echo their key, so nothing here depends on wording. The rich
 * editor is a textarea and the picture field two buttons, since nothing here
 * looks inside either.
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

vi.mock("@/components/admin/authored-body-editor", () => ({
  AuthoredBodyEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (markdown: string) => void;
    ariaLabel: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      defaultValue={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const PICKED = {
  id: "3c0d1b2e-7f53-4d3a-9b0e-5d1c2a7e4f60",
  label: "Picked",
  path: "picked.jpg",
};

vi.mock("@/components/admin/products/image-picker", () => ({
  ImagePicker: ({
    onChange,
  }: {
    onChange: (
      id: string | null,
      image: { label: string; path: string } | null,
    ) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange(PICKED.id, { label: PICKED.label, path: PICKED.path })
        }
      >
        pick picture
      </button>
      <button type="button" onClick={() => onChange(null, null)}>
        remove picture
      </button>
    </div>
  ),
}));

import { AdminSpotlightsPage } from "@/components/admin/spotlights/admin-spotlights-page";
import { SpotlightEditor } from "@/components/admin/spotlights/spotlight-editor";
import {
  emptySpotlightForm,
  sameAsSaved,
  spotlightFormFromSaved,
  spotlightInputFromForm,
  spotlightSaveBlocker,
  withPicture,
} from "@/components/admin/spotlights/spotlight-form";
import type { AdminSpotlight, SpotlightInput } from "@/services/spotlights";

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
    expect(spotlightSaveBlocker(emptySpotlightForm("en"))).toEqual({
      kind: "noVersion",
    });
  });

  it("refuses a language with a title and no text", () => {
    const form = emptySpotlightForm("en");
    form.versions.en = { title: "Hello", body: "  " };
    expect(spotlightSaveBlocker(form)).toEqual({
      kind: "incomplete",
      locale: "en",
    });
  });

  it("switches the spotlight off when its picture is taken off, and leaves it as it was when one is set", () => {
    const saved = spotlightFormFromSaved(ON, "en");
    expect(withPicture(saved, null)).toMatchObject({ picture: null, enabled: false });
    expect(withPicture(saved, PICKED)).toMatchObject({ picture: PICKED, enabled: true });
  });

  it("opens a saved spotlight on the admin's language and holds nothing unsaved", () => {
    const form = spotlightFormFromSaved(ON, "fi");
    expect(form.activeLocale).toBe("fi");
    expect(form.enabled).toBe(true);
    expect(sameAsSaved(form, ON)).toBe(true);
    expect(spotlightInputFromForm(form)).toEqual({
      versions: ON.versions,
      imageId: ON.imageId,
      enabled: true,
    });
  });

  it("counts the switch as a change", () => {
    const form = { ...spotlightFormFromSaved(ON, "en"), enabled: false };
    expect(sameAsSaved(form, ON)).toBe(false);
  });

  it("leaves an untouched empty tab out of the save", () => {
    const form = spotlightFormFromSaved(ON, "en");
    form.versions.sv = { title: "", body: "" };
    expect(sameAsSaved(form, ON)).toBe(true);
  });
});

describe("the spotlight editor", () => {
  function renderEditor(
    spotlight: AdminSpotlight | null,
    save = vi.fn(async (input: SpotlightInput) => {
      void input;
    }),
  ) {
    const client = new QueryClient();
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    render(<SpotlightEditor spotlight={spotlight} save={save} />, {
      wrapper: Wrapper,
    });
    return {
      save,
      box: () => screen.getByRole("checkbox", { name: "switchLabel" }),
      saveButton: () => screen.getByRole("button", { name: "actions.save" }),
    };
  }

  it("shows the saved switch, and counts toggling it as an unsaved change", () => {
    const { box, saveButton } = renderEditor(ON);
    expect(box()).toHaveProperty("checked", true);
    expect(box()).toHaveProperty("disabled", false);
    expect(saveButton()).toHaveProperty("disabled", true);

    fireEvent.click(box());
    expect(box()).toHaveProperty("checked", false);
    expect(saveButton()).toHaveProperty("disabled", false);

    fireEvent.click(box());
    expect(saveButton()).toHaveProperty("disabled", true);
  });

  it("holds the box back with the reason while there is no picture, and unticks it when the picture is taken off", () => {
    const { box } = renderEditor(ON);
    expect(screen.queryByText("needsPicture")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "remove picture" }));
    expect(box()).toHaveProperty("checked", false);
    expect(box()).toHaveProperty("disabled", true);
    expect(screen.getByText("needsPicture")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "pick picture" }));
    expect(box()).toHaveProperty("disabled", false);
    // Off until ticked again: a new picture is not a decision to go back on.
    expect(box()).toHaveProperty("checked", false);
    expect(screen.queryByText("needsPicture")).toBeNull();
  });

  it("saves the switch in the one call with the picture and the text", async () => {
    const { box, save, saveButton } = renderEditor(NO_PICTURE);
    expect(box()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "pick picture" }));
    fireEvent.click(box());
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      versions: NO_PICTURE.versions,
      imageId: PICKED.id,
      enabled: true,
    });
  });

  it("creates a new spotlight already switched on when it has a picture", async () => {
    const { box, save } = renderEditor(null);
    expect(box()).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("fields.title"), {
      target: { value: "Winter camps" },
    });
    fireEvent.change(screen.getByLabelText("fields.body"), {
      target: { value: "Book now." },
    });
    fireEvent.click(screen.getByRole("button", { name: "pick picture" }));
    fireEvent.click(box());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "newPage.submit" }));
    });

    expect(save).toHaveBeenCalledWith({
      versions: [{ locale: "en", title: "Winter camps", body: "Book now." }],
      imageId: PICKED.id,
      enabled: true,
    });
  });
});

describe("the spotlight list", () => {
  function renderList() {
    render(
      <AdminSpotlightsPage
        spotlights={[ON, NO_PICTURE]}
        status="success"
        actions={{ remove: vi.fn(async () => {}) }}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    return { on: rows[0], off: rows[1] };
  }

  it("reads each spotlight's state as a status, with no control to change it", () => {
    const { on, off } = renderList();
    expect(within(on).getByText("on")).toBeTruthy();
    expect(within(off).getByText("off")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("names each spotlight in the admin's language, falling back as a reader would", () => {
    const { on, off } = renderList();
    expect(within(on).getAllByText("Autumn camps are open").length).toBeGreaterThan(0);
    expect(within(off).getAllByText("Ny klubb").length).toBeGreaterThan(0);
  });

  it("opens the editor from the whole card, and leaves the delete to itself", async () => {
    const { on } = renderList();

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

    // The delete sits outside the anchor (no button inside a link), lifted
    // above the stretched link so a press reaches it and not the card.
    const remove = within(on).getByRole("button", { name: "actions.delete" });
    expect(remove.closest("a")).toBeNull();
    expect(remove.closest(".z-10")).not.toBeNull();

    const navigated = vi.fn();
    link.addEventListener("click", navigated);
    await act(async () => {
      fireEvent.click(remove);
    });
    expect(screen.getByText("deleteConfirm.title")).toBeTruthy();
    expect(navigated).not.toHaveBeenCalled();
  });

  it("shows the empty state only once the read has answered", () => {
    const actions = { remove: vi.fn() };
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
    const actions = { remove: vi.fn() };
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

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * **The catalogue's presentational core, and the four claims it has to keep.**
 *
 * Browsing a shared catalogue is a place where a stray click is expensive: the
 * pictures on screen belong to other products as much as to this one. So the
 * separation between *looking at* an entry and *choosing* it, and the count in
 * front of the two verbs that reach every product using an entry, are the
 * behaviours worth pinning rather than the layout around them.
 *
 * Translations echo their key plus the values they were handed, so nothing here
 * depends on wording in `messages/` — only on which number the component puts
 * into the message. That is the part that can silently go wrong: a confirm
 * button reading "Remove from 1 products" (or from none at all) is a sentence
 * an admin would believe.
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

import { ImageCatalogueView } from "@/components/admin/products/image-catalogue-view";
import {
  CATALOGUE_DEMO_IMAGES,
  CATALOGUE_DEMO_SHARED_IMAGE_ID,
  CATALOGUE_DEMO_UNUSED_IMAGE_ID,
  CATALOGUE_DEMO_USAGE,
} from "@/components/admin/products/image-catalogue-fixtures";

const SHARED = CATALOGUE_DEMO_IMAGES.find(
  (image) => image.id === CATALOGUE_DEMO_SHARED_IMAGE_ID,
)!;
const UNUSED = CATALOGUE_DEMO_IMAGES.find(
  (image) => image.id === CATALOGUE_DEMO_UNUSED_IMAGE_ID,
)!;

/** The 22-product reach the confirm copy is written against. */
const SHARED_COUNT = CATALOGUE_DEMO_USAGE[SHARED.id].length;

function renderView(
  overrides: Partial<Parameters<typeof ImageCatalogueView>[0]> = {},
) {
  const props = {
    images: CATALOGUE_DEMO_IMAGES,
    usage: CATALOGUE_DEMO_USAGE,
    selectedId: null as string | null,
    onSelectTile: vi.fn(),
    onUse: vi.fn(),
    onUpload: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onReplace: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<ImageCatalogueView {...props} />), props };
}

/**
 * Buttons are matched on their **whole** label, not a substring: with keys
 * echoed as text, a tile's own button reads "…usedBadge count=22", which a
 * substring search for "use" would hand back instead of the column's commit
 * button.
 */
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text,
  );

describe("the catalogue grid", () => {
  it("fills the column on a tile click rather than committing the pick", () => {
    const { props } = renderView();

    fireEvent.click(screen.getByText(SHARED.label));

    // The whole safeguard: browsing moves the column, not the product.
    expect(props.onSelectTile).toHaveBeenCalledWith(SHARED.id);
    expect(props.onUse).not.toHaveBeenCalled();
  });

  it("shows a usage badge only for entries something uses", () => {
    renderView();

    // The badge is its list's length, and an entry nothing uses is absent from
    // the usage record — so the slot stays empty rather than reading zero.
    expect(document.body.textContent).toContain(
      `usedBadge count=${SHARED_COUNT}`,
    );
    expect(document.body.textContent).not.toContain("usedBadge count=0");
  });
});

describe("the reference column", () => {
  it("commits the selected entry when Use this picture is clicked", () => {
    const { props } = renderView({ selectedId: SHARED.id });

    fireEvent.click(button("use")!);

    expect(props.onUse).toHaveBeenCalledWith(SHARED);
  });
});

describe("the confirm in front of a shared verb", () => {
  it("carries the count on the button", () => {
    renderView({ selectedId: SHARED.id });

    fireEvent.click(button("remove")!);

    expect(document.body.textContent).toContain(
      `removeConfirm.confirm count=${SHARED_COUNT}`,
    );
    // And the consequence line names the same number, from the same list.
    expect(document.body.textContent).toContain(
      `removeConfirm.consequence count=${SHARED_COUNT}`,
    );
  });

  it("is a plain confirm for an entry no product uses", () => {
    renderView({ selectedId: UNUSED.id });

    fireEvent.click(button("remove")!);

    expect(document.body.textContent).toContain("removeConfirm.confirmUnused");
    expect(document.body.textContent).toContain("removeConfirm.unused");
    expect(document.body.textContent).not.toContain("removeConfirm.confirm ");
  });

  it("holds its button through the request it fired", async () => {
    // A promise that never settles is the request still in flight. The flag has
    // to be live on the render straight after the click, or a second click
    // removes a picture that is already going.
    const onRemove = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    renderView({ selectedId: SHARED.id, onRemove });

    fireEvent.click(button("remove")!);
    const confirm = button(`removeConfirm.confirm count=${SHARED_COUNT}`)!;
    fireEvent.click(confirm);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("asks for the file after the list, and only enables the button once it has one", () => {
    renderView({ selectedId: SHARED.id });

    fireEvent.click(button("replace")!);

    // The list is already on screen; the button under it cannot be pressed
    // until a picture has been chosen, which is what makes the reach readable
    // before the destructive part of the gesture.
    expect(document.body.textContent).toContain(
      `replaceConfirm.consequence count=${SHARED_COUNT}`,
    );
    expect(button(`replaceConfirm.confirm count=${SHARED_COUNT}`)!.disabled).toBe(
      true,
    );
  });
});

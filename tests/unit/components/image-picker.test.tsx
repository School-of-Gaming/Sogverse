import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **The catalogue picture field — a product's picture, a Library article's
 * cover: the two things it does that are not the catalogue.**
 *
 * The card sits in front of a catalogue every product (or article) shares, and
 * the whole design rests on keeping its own actions unshared. Taking the
 * picture off *this* product touches nothing else, so it never warns; a dropped
 * file is cropped to the purpose's frame, added to the catalogue and selected
 * **here**, which is what makes the most casual gesture in the feature also the
 * safest one.
 *
 * A further case is the refusal that has to happen before the request: the
 * platform caps a function body at roughly 4.5 MB, so a file over the cap never
 * reaches the route and the admin would otherwise see a network failure instead
 * of a sentence telling them what to do. The assertion that matters is not the
 * message — it is that `fetch` was never called.
 *
 * The real service and the real mutation hook run here; only the Supabase
 * client (unused by the upload path), `fetch` and the crop dialog are stood
 * in for. The crop dialog needs a canvas jsdom does not have, and what is
 * under test is what the card does with its result: the stub hands back
 * whatever blob a case gives it.
 *
 * The last cases run the same field for a Library cover: the frame, the crop
 * size, the upload's purpose and the copy all follow the purpose.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

/** The blob the stubbed crop dialog hands back on confirm. */
let croppedBlob = new Blob(["cropped"], { type: "image/jpeg" });

vi.mock("@/components/ui/image-crop-dialog", () => ({
  IMAGE_CROP_ACCEPT: ["image/jpeg", "image/png", "image/webp"],
  decodeImageForCrop: () => Promise.resolve(true),
  ImageCropDialog: ({
    source,
    outputWidth,
    outputHeight,
    onConfirm,
  }: {
    source: { kind: string } | null;
    outputWidth: number;
    outputHeight: number;
    onConfirm: (blob: Blob) => void;
  }) =>
    source?.kind === "ready" ? (
      <button type="button" onClick={() => onConfirm(croppedBlob)}>
        {`crop ${outputWidth}x${outputHeight}`}
      </button>
    ) : null,
}));

vi.mock("@/lib/supabase/client", () => ({
  // The upload goes through an API route, so the injected client is genuinely
  // unused by this path — the service takes one because every service does.
  getClient: () => ({}),
}));

import { ImagePicker } from "@/components/admin/products/image-picker";
import { CATALOGUE_IMAGE_MAX_BYTES } from "@/services/catalogue-images";
import type { CatalogueImagePurpose } from "@/types";

const ENTRY = {
  id: "ba0d0b0b-2b58-4b58-9a0f-1f2ec6a2e2a1",
  label: "Survival terrain",
  path: "/preview-art/card-terrain.svg",
};

function file(name: string, size: number): File {
  const f = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** A FileList-shaped drop payload; jsdom does not build one for us. */
function dropped(f: File) {
  return {
    files: {
      length: 1,
      item: (index: number) => (index === 0 ? f : null),
      0: f,
    },
  };
}

function renderCard(
  imageId: string | null,
  purpose: CatalogueImagePurpose = "product",
) {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ImagePicker
        purpose={purpose}
        label="label"
        hint="hint"
        imageId={imageId}
        current={imageId === null ? null : { label: ENTRY.label, path: ENTRY.path }}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
  return { ...view, onChange };
}

const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text,
  );

/** The card's own div — the drop target — reached through the hint it owns. */
const dropZone = () => screen.getByText(/dropPrompt/).parentElement!;

describe("removing the picture from one product", () => {
  it("clears both halves of the pick and asks nothing", () => {
    const { onChange } = renderCard(ENTRY.id);

    fireEvent.click(button("forPurpose.product.remove")!);

    // No dialog, no confirm: nothing shared is being touched.
    expect(onChange).toHaveBeenCalledWith(null, null);
    expect(document.body.textContent).not.toContain("removeConfirm");
  });
});

describe("dropping a file on the card", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    croppedBlob = new Blob(["cropped"], { type: "image/jpeg" });
    URL.createObjectURL = vi.fn(() => "blob:picked");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("crops it to a product picture's size, uploads the crop and selects the result for this product alone", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "added",
          image: {
            ...ENTRY,
            sha256: "0".repeat(64),
            purpose: "product",
            created_at: "2026-08-20T10:00:00.000Z",
          },
        }),
    });

    const { onChange } = renderCard(null);

    fireEvent.drop(dropZone(), { dataTransfer: dropped(file("a.png", 1024)) });

    // Nothing is sent before the crop: the route takes nothing else.
    const crop = await screen.findByText("crop 1200x800");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(crop);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(ENTRY.id, {
        label: ENTRY.label,
        path: ENTRY.path,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/catalogue-images");

    // What went up is the crop, as a JPEG named after the dropped file, with
    // the purpose it was cut for.
    const init: unknown = fetchMock.mock.calls[0][1];
    const body =
      typeof init === "object" && init !== null && "body" in init
        ? init.body
        : null;
    if (!(body instanceof FormData)) throw new Error("expected a form body");
    expect(body.get("purpose")).toBe("product");
    const sent = body.get("file");
    if (!(sent instanceof File)) throw new Error("expected a file");
    expect(sent.name).toBe("a.jpg");
    expect(sent.type).toBe("image/jpeg");
  });

  it("refuses an oversize crop before any request is made", async () => {
    croppedBlob = new Blob([new Uint8Array(CATALOGUE_IMAGE_MAX_BYTES + 1)], {
      type: "image/jpeg",
    });
    const { onChange } = renderCard(null);

    fireEvent.drop(dropZone(), { dataTransfer: dropped(file("huge.png", 1024)) });
    fireEvent.click(await screen.findByText("crop 1200x800"));

    await waitFor(() => {
      expect(document.body.textContent).toContain("tooLarge");
    });
    // The point of the client-side check: the body never left the browser.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("the same field picking a Library cover", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    croppedBlob = new Blob(["cropped"], { type: "image/jpeg" });
    URL.createObjectURL = vi.fn(() => "blob:picked");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("paints the pick in the 16:9 cover frame, names it, and speaks of the cover", () => {
    renderCard(ENTRY.id, "library_cover");

    expect(document.querySelector(".aspect-video")).not.toBeNull();
    expect(document.querySelector(".aspect-\\[3\\/2\\]")).toBeNull();
    expect(screen.getByText(ENTRY.label)).toBeDefined();
    expect(button("forPurpose.libraryCover.change")).toBeDefined();
    expect(button("forPurpose.libraryCover.remove")).toBeDefined();
  });

  it("crops a dropped file to a cover's size and uploads it as a Library cover", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "existing",
          image: {
            ...ENTRY,
            sha256: "0".repeat(64),
            purpose: "library_cover",
            created_at: "2026-08-20T10:00:00.000Z",
          },
        }),
    });

    const { onChange } = renderCard(null, "library_cover");

    fireEvent.drop(dropZone(), { dataTransfer: dropped(file("a.png", 1024)) });
    fireEvent.click(await screen.findByText("crop 1600x900"));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(ENTRY.id, {
        label: ENTRY.label,
        path: ENTRY.path,
      });
    });
    const init: unknown = fetchMock.mock.calls[0][1];
    const body =
      typeof init === "object" && init !== null && "body" in init
        ? init.body
        : null;
    if (!(body instanceof FormData)) throw new Error("expected a form body");
    expect(body.get("purpose")).toBe("library_cover");
    expect(document.body.textContent).toContain(
      "forPurpose.libraryCover.outcomeExisting",
    );
  });
});

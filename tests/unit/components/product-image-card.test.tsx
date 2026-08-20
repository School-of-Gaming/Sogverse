import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **The product form's picture card: the two things it does that are not the
 * catalogue.**
 *
 * The card sits in front of a catalogue every product shares, and the whole
 * design rests on keeping its own actions unshared. Taking the picture off
 * *this* product touches nothing else, so it never warns; a dropped file adds
 * the bytes to the catalogue and selects the result **here**, which is what
 * makes the most casual gesture in the feature also the safest one.
 *
 * The third case is the refusal that has to happen before the request: the
 * platform caps a function body at roughly 4.5 MB, so a file over the cap never
 * reaches the route and the admin would otherwise see a network failure instead
 * of a sentence telling them what to do. The assertion that matters is not the
 * message — it is that `fetch` was never called.
 *
 * The real service and the real mutation hook run here; only the Supabase
 * client (unused by the upload path) and `fetch` are stood in for, because the
 * refusal being tested lives inside the service rather than in the card.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/lib/supabase/client", () => ({
  // The upload goes through an API route, so the injected client is genuinely
  // unused by this path — the service takes one because every service does.
  getClient: () => ({}),
}));

import { ImagePicker } from "@/components/admin/products/image-picker";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/services/product-images";

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

function renderCard(imageId: string | null) {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ImagePicker
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

    fireEvent.click(button("remove")!);

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads it and selects the result for this product alone", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "added",
          image: {
            ...ENTRY,
            sha256: "0".repeat(64),
            created_at: "2026-08-20T10:00:00.000Z",
          },
        }),
    });

    const { onChange } = renderCard(null);

    fireEvent.drop(dropZone(), { dataTransfer: dropped(file("a.png", 1024)) });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(ENTRY.id, {
        label: ENTRY.label,
        path: ENTRY.path,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/product-images");
  });

  it("refuses an oversize file before any request is made", async () => {
    const { onChange } = renderCard(null);

    fireEvent.drop(dropZone(), {
      dataTransfer: dropped(file("huge.png", PRODUCT_IMAGE_MAX_BYTES + 1)),
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain("tooLarge");
    });
    // The point of the client-side check: the body never left the browser.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

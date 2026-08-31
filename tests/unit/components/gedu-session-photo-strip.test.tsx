import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ApiError } from "@/lib/api/api-error";
import { NormalizeImageError } from "@/lib/images/normalize-image";
import type { SessionPhoto } from "@/components/session-feed";

/**
 * ============================================================================
 * The photo strip is a block that manages itself, and these pin the four rules
 * that make it legible as one.
 * ============================================================================
 *
 * Everything else on a session card is a draft held until Save. A photo is
 * attached the moment it uploads, and the strip has to say so without a word of
 * instruction — which puts the weight on behaviour rather than on copy, and so
 * on tests rather than on an eye:
 *
 *   - **The cap hides the add control**, rather than disabling it. A slot that
 *     can never fill is dead space.
 *   - **An over-cap selection is trimmed once, before anything uploads**, so a
 *     gedu who picks eight for a report with three slots left gets one line
 *     about one decision instead of five refusals.
 *   - **A batch stops at the first refusal**, because the likely ones are facts
 *     about the batch, and it says which refusal it was in *our* words — never
 *     the thrown error's, whose English is written for a log.
 *   - **The add control stays disabled for the whole batch**, not per file.
 *
 * The normalization pass is mocked throughout: it reaches for
 * `createImageBitmap` and a real canvas, neither of which jsdom has, and none of
 * these rules is about what it produces.
 */

const normalizeImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/images/normalize-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/images/normalize-image")>()),
  normalizeImage,
}));

const { SessionPhotoStrip } = await import(
  "@/components/gedu/session-feed/SessionPhotoStrip"
);

const copy = messages.gedu.sessionFeed;

/**
 * A stored photo, addressed by a committed demo file rather than by a UUID: the
 * URL helper passes a leading-slash id straight through, so no bucket env var
 * has to exist for a thumbnail to render.
 */
function stored(n: number): SessionPhoto {
  return { id: `/preview-art/session-build.jpg#${n}`, width: 1600, height: 900 };
}

function renderStrip({
  photos = [],
  onAddPhoto = vi.fn().mockResolvedValue("stored-id"),
  onRemovePhoto = vi.fn().mockResolvedValue(undefined),
}: {
  photos?: readonly SessionPhoto[];
  onAddPhoto?: (photo: {
    file: Blob;
    width: number;
    height: number;
  }) => Promise<string>;
  onRemovePhoto?: (imageId: string) => Promise<void>;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionPhotoStrip
        open
        photos={photos}
        onAddPhoto={onAddPhoto}
        onRemovePhoto={onRemovePhoto}
      />
    </NextIntlClientProvider>,
  );
}

/** Drive the hidden file input the Add button clicks. */
function pick(container: HTMLElement, count: number) {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  const files = Array.from(
    { length: count },
    (_, i) => new File([`bytes-${i}`], `pick-${i}.jpg`, { type: "image/jpeg" }),
  );
  fireEvent.change(input, { target: { files } });
  return input;
}

beforeEach(() => {
  normalizeImage.mockReset();
  normalizeImage.mockResolvedValue({
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    width: 1600,
    height: 900,
  });
  // jsdom has neither, and the strip mints one preview URL per pick.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the session photo strip", () => {
  it("invites a first photo, and stops inviting once there is one", () => {
    const empty = renderStrip();
    expect(empty.queryByText(copy.photosEmpty)).not.toBeNull();
    expect(empty.queryByRole("button", { name: copy.addPhoto })).not.toBeNull();
    cleanup();

    // Not a nag: the line is the whole of the "encourage a photo" ask, so it
    // goes the moment it has been answered.
    const one = renderStrip({ photos: [stored(1)] });
    expect(one.queryByText(copy.photosEmpty)).toBeNull();
  });

  it("hides the add control at the cap rather than disabling it", () => {
    const full = renderStrip({
      photos: [stored(1), stored(2), stored(3), stored(4), stored(5)],
    });
    // Absent, not present-and-dead: a control that can never be pressed is one
    // more thing to read on the way past.
    expect(full.queryByRole("button", { name: copy.addPhoto })).toBeNull();
  });

  it("trims an over-cap selection once, before anything uploads", async () => {
    const onAddPhoto = vi.fn().mockResolvedValue("stored-id");
    const { container, findByText } = renderStrip({
      photos: [stored(1), stored(2), stored(3)],
      onAddPhoto,
    });

    pick(container, 4);

    // Two slots left, four picked: two uploads and one line about it — never
    // four uploads and two refusals.
    await waitFor(() => expect(onAddPhoto).toHaveBeenCalledTimes(2));
    await findByText(/only the first 2 were added/i);
  });

  it("stops the batch at the first refusal and says which one it was", async () => {
    const onAddPhoto = vi
      .fn()
      .mockResolvedValueOnce("stored-id")
      .mockRejectedValueOnce(
        // The route's own English is a log line; what the gedu reads is ours,
        // chosen by the stable code beside it.
        new ApiError("add_group_session_image refused (P0023)", 409, "capReached"),
      );
    const { container, findByText } = renderStrip({ onAddPhoto });

    pick(container, 3);

    await findByText(copy.photoErrorCapReached);
    // The third file is never attempted: a full report is a fact about the
    // batch, so carrying on would print the same refusal twice more.
    expect(onAddPhoto).toHaveBeenCalledTimes(2);
  });

  it("translates a browser-side refusal through the same vocabulary", async () => {
    normalizeImage.mockRejectedValue(new NormalizeImageError("decodeFailed"));
    const onAddPhoto = vi.fn();
    const { container, findByText } = renderStrip({ onAddPhoto });

    pick(container, 1);

    // The decoder refused, so nothing was ever uploaded — and the gedu is told
    // the one thing they can act on, which is the HEIC advice.
    await findByText(copy.photoErrorDecodeFailed);
    expect(onAddPhoto).not.toHaveBeenCalled();
  });

  it("holds the add control disabled across a whole multi-file batch", async () => {
    const gates: Array<(id: string) => void> = [];
    const onAddPhoto = vi.fn(
      () => new Promise<string>((resolve) => gates.push(resolve)),
    );
    const { container, getByRole } = renderStrip({ onAddPhoto });

    pick(container, 2);

    const addIsDisabled = () =>
      getByRole("button", { name: copy.addPhoto }).hasAttribute("disabled");
    await waitFor(() => expect(gates).toHaveLength(1));
    // One upload resolved is NOT the batch finishing — the gap between them is
    // exactly where a fast second click used to start a second batch over the
    // same remaining slots.
    expect(addIsDisabled()).toBe(true);
    gates[0]("first-id");
    await waitFor(() => expect(gates).toHaveLength(2));
    expect(addIsDisabled()).toBe(true);

    gates[1]("second-id");
    await waitFor(() => expect(addIsDisabled()).toBe(false));
  });

  it("removes a stored photo through its own control", async () => {
    const onRemovePhoto = vi.fn().mockResolvedValue(undefined);
    const { getByRole } = renderStrip({
      photos: [stored(1), stored(2)],
      onRemovePhoto,
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "2") }),
    );

    // By stored id, and immediately: there is no draft for a removal to wait
    // for.
    expect(onRemovePhoto).toHaveBeenCalledWith(stored(2).id);
  });
});

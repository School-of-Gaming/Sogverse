import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NormalizeImageError } from "@/lib/images/normalize-image";
import type { SessionPhoto } from "@/components/session-feed";
import type { SessionPhotoErrorCode } from "@/services/gedu-sessions";
import {
  NO_LANDED_PHOTOS,
  NO_STAGED_PHOTOS,
  type StagedSessionPhoto,
  type StagedSessionPhotos,
} from "@/components/gedu/session-feed/staged-photos";

/**
 * ============================================================================
 * The photo block is draft scope, and these pin the rules that make it read
 * like the rest of the editor.
 * ============================================================================
 *
 * Photos used to attach the moment they were picked. They do not any more
 * *(owner)*: the whole card edit lives in the browser and only Save touches the
 * backend, so this block picks, prepares and holds — and everything below is
 * about what it does *without* a network.
 *
 *   - **A pick is prepared and staged, and nothing leaves the browser.** The
 *     block has no upload of its own to call any more; what it produces is a
 *     staged picture for the save to carry.
 *   - **A refusal the browser can make is still made at pick time.** A file the
 *     decoder will not open says so while the gedu is choosing it, not at Save.
 *   - **The cap counts what the report would hold** — stored, minus what is
 *     crossed out, plus what is staged — so swapping a photo at the cap works
 *     and never shows a refusal.
 *   - **An over-cap selection is trimmed once, before anything is prepared**, so
 *     a gedu who picks eight for a report with three slots left gets one line
 *     about one decision.
 *   - **A batch stops at the first refusal** and says which refusal it was in
 *     *our* words — never the thrown error's, whose English is written for a log.
 *   - **The add control stays disabled for the whole batch**, not per file.
 *   - **The block greys with the rest of the editor while the card commits**,
 *     which is the reversal of its original design: it used to stay live, as a
 *     way of saying photos were not part of the draft.
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

/**
 * The staged state the feed holds for an open card, stood up locally.
 *
 * The block is controlled — it reports picks and crossings-out upward and draws
 * whatever comes back — so a test of it needs the other half. This is the same
 * four reducers the feed runs, minus the object-URL bookkeeping, which is the
 * feed's own concern rather than the block's.
 */
function Harness({
  photos = [],
  disabled = false,
}: {
  photos?: readonly SessionPhoto[];
  disabled?: boolean;
}) {
  const [staged, setStaged] = useState<StagedSessionPhotos>(NO_STAGED_PHOTOS);
  const [error, setError] = useState<SessionPhotoErrorCode | null>(null);

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionPhotoStrip
        open
        photos={photos}
        staged={staged}
        // Nothing has been saved from this harness — every rule below is about
        // what the block does *without* a network, so the landed half of the
        // derivation is empty throughout. What it covers is pinned against the
        // whole feed instead, where a save can actually half-land.
        landed={NO_LANDED_PHOTOS}
        disabled={disabled}
        error={error}
        onStageAdd={(photo: StagedSessionPhoto) =>
          setStaged((prev) => ({ ...prev, adds: [...prev.adds, photo] }))
        }
        onUnstageAdd={(key) =>
          setStaged((prev) => ({
            ...prev,
            adds: prev.adds.filter((add) => add.key !== key),
          }))
        }
        onStageRemoval={(imageId) =>
          setStaged((prev) => ({
            ...prev,
            removals: [...prev.removals, imageId],
          }))
        }
        onError={setError}
      />
    </NextIntlClientProvider>
  );
}

function renderStrip(props: Parameters<typeof Harness>[0] = {}) {
  return render(<Harness {...props} />);
}

function jpegs(count: number) {
  return Array.from(
    { length: count },
    (_, i) => new File([`bytes-${i}`], `pick-${i}.jpg`, { type: "image/jpeg" }),
  );
}

/** Drive the hidden file input the Add button clicks. */
function pick(container: HTMLElement, count: number) {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  fireEvent.change(input, { target: { files: jpegs(count) } });
  return input;
}

/** Drop files onto the block, which is the drop target in its entirety. */
function drop(container: HTMLElement, files: readonly File[]) {
  const block = container.querySelector("section");
  if (!(block instanceof HTMLElement)) throw new Error("no photo block");
  fireEvent.dragOver(block, { dataTransfer: { files } });
  fireEvent.drop(block, { dataTransfer: { files } });
}

/** Every tile on the strip, stored and staged alike — they render identically. */
function tiles(container: HTMLElement) {
  return container.querySelectorAll("ul > li img");
}

let mintedUrls = 0;

beforeEach(() => {
  normalizeImage.mockReset();
  normalizeImage.mockResolvedValue({
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    width: 1600,
    height: 900,
  });
  // jsdom has neither, and a distinct URL per pick so a revoke of one cannot
  // read as a revoke of all.
  mintedUrls = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${(mintedUrls += 1)}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the session photo block", () => {
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

  it("stages a pick locally, with nothing to upload it through", async () => {
    const { container, findAllByRole } = renderStrip();

    pick(container, 1);

    // The tile is drawn from the bytes the browser just encoded — a `blob:`
    // src, not a bucket URL — and it carries the ordinary remove control,
    // because a staged photo and a stored one are the same thing to a reader.
    await waitFor(() => expect(tiles(container)).toHaveLength(1));
    expect(tiles(container)[0].getAttribute("src")).toMatch(/^blob:/);
    await findAllByRole("button", {
      name: copy.removePhoto.replace("{index}", "1"),
    });
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("counts stored, crossed-out and staged photos against the one cap", async () => {
    const { container, getByRole, queryByRole } = renderStrip({
      photos: [stored(1), stored(2), stored(3), stored(4)],
    });

    // Four stored and one staged is five: the add control goes, because a slot
    // that can never fill is dead space.
    pick(container, 1);
    await waitFor(() =>
      expect(queryByRole("button", { name: copy.addPhoto })).toBeNull(),
    );

    // Crossing one stored photo out makes room again — which is what lets a
    // photo be swapped at the cap without ever meeting a refusal.
    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    await waitFor(() =>
      expect(queryByRole("button", { name: copy.addPhoto })).not.toBeNull(),
    );
    // Four tiles: three stored still kept, plus the staged one.
    expect(tiles(container)).toHaveLength(4);
  });

  it("takes a crossed-out photo off the strip rather than greying it", async () => {
    const { container, getByRole } = renderStrip({
      photos: [stored(1), stored(2)],
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "2") }),
    );

    // Same grammar as deleting a paragraph of the write-up: it is simply gone
    // from the draft, and Cancel is the undo for the whole card at once.
    await waitFor(() => expect(tiles(container)).toHaveLength(1));
  });

  it("drops a staged photo outright when its own control is pressed", async () => {
    const { container, getByRole } = renderStrip();

    pick(container, 1);
    await waitFor(() => expect(tiles(container)).toHaveLength(1));

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );

    // Nothing was ever uploaded, so there is nothing to cross out — the picture
    // simply leaves, and the invitation comes back.
    await waitFor(() => expect(tiles(container)).toHaveLength(0));
    expect(container.textContent).toContain(copy.photosEmpty);
  });

  it("trims an over-cap selection once, before anything is prepared", async () => {
    const { container, findByText } = renderStrip({
      photos: [stored(1), stored(2), stored(3)],
    });

    pick(container, 4);

    // Two slots left, four picked: two files prepared and one line about it —
    // never four prepared and two refusals.
    await waitFor(() => expect(normalizeImage).toHaveBeenCalledTimes(2));
    await findByText(/only the first 2 were added/i);
  });

  it("stops the batch at the first refusal and says which one it was", async () => {
    normalizeImage
      .mockResolvedValueOnce({
        blob: new Blob(["jpeg"], { type: "image/jpeg" }),
        width: 1600,
        height: 900,
      })
      .mockRejectedValueOnce(new NormalizeImageError("encodeFailed"));
    const { container, findByText } = renderStrip();

    pick(container, 3);

    await findByText(copy.photoErrorEncodeFailed);
    // The third file is never attempted: a device that cannot encode is a fact
    // about the batch, so carrying on would print the same refusal twice more.
    expect(normalizeImage).toHaveBeenCalledTimes(2);
    // And the one that did work is still staged — the gedu picks again for the
    // rest rather than starting over.
    expect(tiles(container)).toHaveLength(1);
  });

  it("translates a browser-side refusal through the feature's own vocabulary", async () => {
    normalizeImage.mockRejectedValue(new NormalizeImageError("decodeFailed"));
    const { container, findByText } = renderStrip();

    pick(container, 1);

    // The decoder refused while the gedu was still choosing, which is the whole
    // point of preparing at pick time — and the line is the one thing they can
    // act on, the HEIC advice.
    await findByText(copy.photoErrorDecodeFailed);
    expect(tiles(container)).toHaveLength(0);
  });

  it("holds the add control disabled across a whole multi-file batch", async () => {
    const gates: Array<(result: unknown) => void> = [];
    normalizeImage.mockImplementation(
      () => new Promise((resolve) => gates.push(resolve)),
    );
    const { container, getByRole } = renderStrip();

    pick(container, 2);

    const addIsDisabled = () =>
      getByRole("button", { name: copy.addPhoto }).hasAttribute("disabled");
    await waitFor(() => expect(gates).toHaveLength(1));
    // One file prepared is NOT the batch finishing — the gap between them is
    // exactly where a fast second click would start a second batch over the
    // same remaining slots.
    expect(addIsDisabled()).toBe(true);
    gates[0]({
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 1600,
      height: 900,
    });
    await waitFor(() => expect(gates).toHaveLength(2));
    expect(addIsDisabled()).toBe(true);

    gates[1]({
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 1600,
      height: 900,
    });
    await waitFor(() => expect(addIsDisabled()).toBe(false));
  });

  it("greys out with the rest of the editor while the card commits", () => {
    const { getByRole } = renderStrip({
      photos: [stored(1)],
      disabled: true,
    });

    // The reversal of the block's original design: it used to stay live through
    // a save, which said photos were not part of what was being saved. They are
    // now, so it locks with everything else.
    expect(
      getByRole("button", { name: copy.addPhoto }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      getByRole("button", {
        name: copy.removePhoto.replace("{index}", "1"),
      }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("puts a dropped file through the picker's pipeline, trim and all", async () => {
    const { container, findByText } = renderStrip({
      photos: [stored(1), stored(2), stored(3)],
    });

    drop(container, jpegs(4));

    // Two slots left and four dropped: the trim is the picker's, applied to a
    // drop, because there is one pipeline and the drop only feeds it.
    await waitFor(() => expect(normalizeImage).toHaveBeenCalledTimes(2));
    await findByText(/only the first 2 were added/i);
  });

  it("refuses a drop of the wrong kind of file in its own words", async () => {
    const { container, findByText } = renderStrip();

    drop(container, [new File(["notes"], "notes.txt", { type: "text/plain" })]);

    // A file dialog filters this out by construction; a drop has no dialog, so
    // the accept list is applied by hand and the answer is said out loud.
    await findByText(copy.photoErrorNotJpeg);
    expect(normalizeImage).not.toHaveBeenCalled();
  });

  it("refuses a drop at the cap rather than swallowing it", async () => {
    const { container, findByText } = renderStrip({
      photos: [stored(1), stored(2), stored(3), stored(4), stored(5)],
    });

    drop(container, jpegs(1));

    // The Add button says this by being absent. A drop cannot, so it says it.
    await findByText(copy.photoErrorCapReached);
    expect(normalizeImage).not.toHaveBeenCalled();
  });
});

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ApiError } from "@/lib/api/api-error";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

/**
 * ============================================================================
 * Which cards carry photos, which editors carry the block that manages them,
 * and what the card's Save does with what that block is holding.
 * ============================================================================
 *
 * Three rules about *where*:
 *
 *   - **Photos are content**, so the shared gallery is drawn on the card's own
 *     body beside the report — the same component a family reads them through.
 *   - **The manage block belongs to the record editor alone.** A session that
 *     has not started has nothing to document, and a pre-epoch gap is a quiet
 *     dashed line with no stored row to hang a photo off.
 *   - **The block draws what is *stored*; the strip inside the editor draws
 *     what the report would hold if it were saved now.**
 *
 * And three about the save, which is where photos changed *(owner)*: the whole
 * card edit is held in the browser and only Save touches the backend, so a
 * picked photo is uploaded by the same button that writes the report, a
 * crossed-out one is deleted by it, and Cancel throws both away.
 */

const normalizeImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/images/normalize-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/images/normalize-image")>()),
  normalizeImage,
}));

const { SessionFeed } = await import(
  "@/components/gedu/session-feed/SessionFeed"
);

const copy = messages.gedu.sessionFeed;

/** Real generated UUIDs: ids reaching an identicon must never be readable stubs. */
const ROSTER: readonly SessionFeedGamer[] = [
  { id: "0d5f9c2b-0a1c-4a2e-9d5c-1f0a5a7e2b31", firstName: "Aino" },
  { id: "9a2b1c4d-3e5f-4a6b-8c7d-2e1f0a3b4c5d", firstName: "Elias" },
];

/** Monday 16 March 2026, a 90-minute Helsinki club. */
const PAST_STARTS = new Date("2026-03-16T14:30:00.000Z");
const PAST_ENDS = new Date("2026-03-16T16:00:00.000Z");
/** The next Monday, untouched — the plan editor's case. */
const FUTURE_STARTS = new Date("2026-03-23T14:30:00.000Z");
const FUTURE_ENDS = new Date("2026-03-23T16:00:00.000Z");
/** The morning after the past session, and days before the future one. */
const NOW = new Date("2026-03-17T09:00:00.000Z");

const PAST_ID = "group-1:2026-03-16";
const FUTURE_ID = "group-1:2026-03-23";
const GAP_ID = "group-1:2025-09-01";

/** Demo art, so the URL helper needs no bucket env var to draw a thumbnail. */
const PHOTOS = [
  { id: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  { id: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
] as const;

/**
 * A stored photo, addressed by committed demo art with a fragment on the end:
 * the URL helper passes a leading-slash id straight through, so no bucket env
 * var has to exist, and the fragment makes each one identifiable in a rendered
 * `src` without inventing a second addressing scheme.
 */
function stored(tag: string) {
  return { id: `/preview-art/session-build.jpg#${tag}`, width: 1600, height: 900 };
}

/**
 * The id the route answers an upload with, in the same passthrough form.
 *
 * Distinct per call, because a real one is a `gen_random_uuid()` and because two
 * uploads landing under one id would be two tiles claiming the same photo.
 */
let storedIds = 0;
function nextStoredId() {
  return `/preview-art/session-badge.jpg#uploaded-${(storedIds += 1)}`;
}

function pastEntry(
  images: readonly { id: string; width: number; height: number }[],
): SessionFeedEntry {
  return {
    kind: "past",
    id: PAST_ID,
    startsAt: PAST_STARTS,
    endsAt: PAST_ENDS,
    report: "# Redstone week\n\nWe built item sorters.",
    staffNote: null,
    attendance: {},
    images,
    owed: true,
    reportEmailedAt: null,
    lastEditedBy: null,
  };
}

const futureEntry: SessionFeedEntry = {
  kind: "future",
  id: FUTURE_ID,
  startsAt: FUTURE_STARTS,
  endsAt: FUTURE_ENDS,
  report: null,
  staffNote: null,
  attendance: {},
  images: [],
  lastEditedBy: null,
};

/** A pre-epoch occurrence nobody recorded anything on — the dashed line. */
const gapEntry: SessionFeedEntry = {
  kind: "no_record",
  id: GAP_ID,
  startsAt: new Date("2025-09-01T13:30:00.000Z"),
  endsAt: new Date("2025-09-01T15:00:00.000Z"),
};

interface FeedProps {
  entries: readonly SessionFeedEntry[];
  editing?: string | null;
  onAddPhoto?: (
    entryId: string,
    photo: { file: Blob; width: number; height: number },
  ) => Promise<string>;
  onRemovePhoto?: (imageId: string) => Promise<void>;
  onSaveEntry?: (
    entryId: string,
    draft: SessionEntryDraft,
  ) => void | Promise<void>;
}

/**
 * The feed with the one piece of state its caller owns — which entry is open.
 *
 * Held here rather than passed as a constant because the save's whole contract
 * is that it closes the editor when the write lands and leaves it open when it
 * does not, and neither is observable against a frozen prop.
 */
function Feed({
  entries,
  editing = null,
  onAddPhoto = () => Promise.resolve(nextStoredId()),
  onRemovePhoto = () => Promise.resolve(),
  onSaveEntry = () => {},
}: FeedProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(editing);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={entries}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={editingEntryId}
            onEditEntry={setEditingEntryId}
            onSaveEntry={onSaveEntry}
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            onAddPhoto={onAddPhoto}
            onRemovePhoto={onRemovePhoto}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

function renderFeed(props: FeedProps) {
  return render(<Feed {...props} />);
}

/** Drive the open editor's hidden file input, one JPEG at a time. */
function pick(container: HTMLElement, count: number) {
  const input = container.querySelector("input[type='file']");
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  fireEvent.change(input, {
    target: {
      files: Array.from(
        { length: count },
        (_, i) => new File([`bytes-${i}`], `pick-${i}.jpg`, { type: "image/jpeg" }),
      ),
    },
  });
}

/** Every tile on the open editor's strip. */
function tiles(container: HTMLElement) {
  const block = container.querySelector("section[aria-labelledby]");
  return block === null ? [] : block.querySelectorAll("ul > li img");
}

/**
 * What each tile on the strip is actually drawn from, decoded — a stored photo
 * goes through the image optimizer, so its own id arrives percent-encoded inside
 * the optimizer's query, and a staged one is a bare `blob:`.
 */
function tileSources(container: HTMLElement) {
  return Array.from(tiles(container), (img) =>
    decodeURIComponent(img.getAttribute("src") ?? ""),
  );
}

let mintedUrls = 0;

beforeEach(() => {
  storedIds = 0;
  normalizeImage.mockReset();
  normalizeImage.mockResolvedValue({
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    width: 1600,
    height: 900,
  });
  mintedUrls = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${(mintedUrls += 1)}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("photos on a gedu session card", () => {
  it("draws the shared gallery on a past card, and nothing at all without photos", () => {
    const withPhotos = renderFeed({ entries: [pastEntry(PHOTOS)] });
    const gallery = withPhotos.getByRole("list", {
      name: messages.sessionFeed.photos.list,
    });
    // Both, uncropped and in stored order — the row is the gallery's, not a
    // second one built here.
    expect(gallery.querySelectorAll("li")).toHaveLength(2);
    cleanup();

    // No slot is held open for photos a session may never have.
    const without = renderFeed({ entries: [pastEntry([])] });
    expect(
      without.queryByRole("list", { name: messages.sessionFeed.photos.list }),
    ).toBeNull();
  });

  it("puts the manage block on the record editor", () => {
    const { queryByText } = renderFeed({
      entries: [pastEntry(PHOTOS)],
      editing: PAST_ID,
    });
    expect(queryByText(copy.photosTitle)).not.toBeNull();
  });

  it("keeps the manage block off the plan editor and off a pre-epoch gap", () => {
    // A session that has not started documents nothing yet.
    const plan = renderFeed({ entries: [futureEntry], editing: FUTURE_ID });
    expect(plan.queryByText(copy.photosTitle)).toBeNull();
    cleanup();

    // And a gap is a quiet dashed row with no stored session behind it — it
    // opens the record editor like any past occurrence, but with nothing to
    // attach a photo to.
    const gap = renderFeed({ entries: [gapEntry], editing: GAP_ID });
    expect(gap.queryByText(copy.photosTitle)).toBeNull();
  });
});

describe("saving a card's photos", () => {
  it("touches nothing until Save, then deletes, uploads and writes in that order", async () => {
    const log: string[] = [];
    const onRemovePhoto = vi.fn((imageId: string) => {
      log.push(`remove ${imageId}`);
      return Promise.resolve();
    });
    const onAddPhoto = vi.fn(() => {
      log.push("add");
      return Promise.resolve(nextStoredId());
    });
    const onSaveEntry = vi.fn(() => {
      log.push("write");
    });

    const { container, getByRole } = renderFeed({
      entries: [pastEntry(PHOTOS)],
      editing: PAST_ID,
      onAddPhoto,
      onRemovePhoto,
      onSaveEntry,
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    pick(container, 1);
    // Crossed out and picked, and the backend has heard nothing: this is the
    // whole of what changed about photos.
    await waitFor(() => expect(tiles(container)).toHaveLength(2));
    expect(log).toEqual([]);

    fireEvent.click(getByRole("button", { name: copy.save }));

    // Removals before uploads, because at the cap a swap is remove-one-add-one
    // and the insert counts stored rows; the written record last, so the only
    // failure that can reach the editor's own two error lines is one of its own.
    await waitFor(() => expect(onSaveEntry).toHaveBeenCalledTimes(1));
    expect(log).toEqual([`remove ${PHOTOS[0].id}`, "add", "write"]);
    // A save that landed closes the editor, photos or no photos. (The editor
    // stays mounted while collapsed — it is the expanded flag that says so.)
    await waitFor(() =>
      expect(
        getByRole("button", { name: copy.edit }).getAttribute("aria-expanded"),
      ).toBe("false"),
    );
  });

  it("keeps the editor open on a refused upload and retries only what is left", async () => {
    const onRemovePhoto = vi.fn(() => Promise.resolve());
    const onAddPhoto = vi
      .fn()
      .mockRejectedValueOnce(
        // The route's own English is a log line; what the gedu reads is ours,
        // chosen by the stable code beside it.
        new ApiError("upload refused", 502, "uploadFailed"),
      )
      .mockImplementation(() => Promise.resolve(nextStoredId()));
    const onSaveEntry = vi.fn();

    const { container, getByRole, findByText } = renderFeed({
      entries: [pastEntry([PHOTOS[0]])],
      editing: PAST_ID,
      onAddPhoto,
      onRemovePhoto,
      onSaveEntry,
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    pick(container, 2);
    await waitFor(() => expect(tiles(container)).toHaveLength(2));

    fireEvent.click(getByRole("button", { name: copy.save }));

    // One line, in the photo block's own vocabulary rather than the editor's
    // general "nothing saved" — a failed file is a thing a gedu can act on.
    await findByText(copy.photoErrorUploadFailed);
    expect(onSaveEntry).not.toHaveBeenCalled();
    // Nothing closed: the draft, the register and both staged photos are
    // exactly where the gedu left them.
    expect(
      getByRole("button", { name: copy.edit }).getAttribute("aria-expanded"),
    ).toBe("true");

    fireEvent.click(getByRole("button", { name: copy.save }));

    await waitFor(() => expect(onSaveEntry).toHaveBeenCalledTimes(1));
    // The deletion landed the first time and left the staged set with it, so
    // the retry never repeats it; both uploads are still owed, and the one that
    // was refused is simply attempted again.
    expect(onRemovePhoto).toHaveBeenCalledTimes(1);
    expect(onAddPhoto).toHaveBeenCalledTimes(3);
  });

  it("throws the staged photos away when the editor is cancelled", async () => {
    const onAddPhoto = vi.fn(() => Promise.resolve(nextStoredId()));
    const { container, getByRole, getAllByRole } = renderFeed({
      entries: [pastEntry([PHOTOS[0]])],
      editing: PAST_ID,
      onAddPhoto,
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    pick(container, 1);
    await waitFor(() => expect(tiles(container)).toHaveLength(1));

    fireEvent.click(getByRole("button", { name: copy.cancel }));
    // Reopening is what shows the discard: the same rule the text draft
    // follows, applied to the picture and to the crossing-out alike.
    fireEvent.click(getAllByRole("button", { name: copy.edit })[0]);

    await waitFor(() => expect(tiles(container)).toHaveLength(1));
    expect(tiles(container)[0].getAttribute("src")).not.toMatch(/^blob:/);
    // And the bytes behind the abandoned pick are let go rather than held for
    // as long as the page lives.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(onAddPhoto).not.toHaveBeenCalled();
  });
});

/**
 * ============================================================================
 * The strip draws the arrangement the gedu made, across the window in which
 * the save has landed something the stored photos have not heard about yet.
 * ============================================================================
 *
 * Both of these run against a feed whose `entries` never change — which is not
 * an artificial setup but the real one: the stored photos arrive as a prop and
 * do not move until the feed refetches, and every one of these assertions is
 * about the frames before that. What the staged set says on its own is "nothing
 * left to do", and drawing the strip from that alone would answer with the
 * props: the deleted photo back on the row, the uploaded one off it, and the
 * cap arithmetic derived from neither number.
 */
describe("the strip while the stored photos are still stale", () => {
  /** Three the gedu is keeping, two they are crossing out — a report at the cap. */
  const KEPT = [stored("kept-1"), stored("kept-2"), stored("kept-3")];
  const CROSSED = [stored("crossed-1"), stored("crossed-2")];

  it("holds the arrangement when the deletions land and the upload is refused", async () => {
    const onRemovePhoto = vi.fn(() => Promise.resolve());
    const onAddPhoto = vi.fn(() =>
      Promise.reject(new ApiError("upload refused", 502, "uploadFailed")),
    );

    const { container, getByRole, queryByRole, queryByText, findByText } =
      renderFeed({
        // The crossed-out pair first, so one label takes them both in turn.
        entries: [pastEntry([...CROSSED, ...KEPT])],
        editing: PAST_ID,
        onAddPhoto,
        onRemovePhoto,
      });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    pick(container, 1);
    // Five stored, two crossed out, one picked: four on the row and one slot
    // still free, which is what the Add button and the drop hint are derived
    // from.
    await waitFor(() => expect(tiles(container)).toHaveLength(4));
    expect(queryByRole("button", { name: copy.addPhoto })).not.toBeNull();

    fireEvent.click(getByRole("button", { name: copy.save }));
    await findByText(copy.photoErrorUploadFailed);

    // Both deletions went through and left the staged set; the upload did not.
    expect(onRemovePhoto).toHaveBeenCalledTimes(2);
    const sources = tileSources(container);
    // Exactly the row the gedu was looking at when the refusal arrived. Without
    // the landed half of the derivation the two deleted photos would be back —
    // six tiles, two of them for pictures that no longer exist, and the Add
    // button gone because the count says the report is over its cap.
    expect(sources).toHaveLength(4);
    expect(sources.filter((src) => src.includes("#kept-"))).toHaveLength(3);
    expect(sources.filter((src) => src.startsWith("blob:"))).toHaveLength(1);
    expect(sources.some((src) => src.includes("#crossed-"))).toBe(false);
    // And the affordances follow the same number: one slot free, so the Add
    // button and the standing drop hint are both still there.
    expect(queryByRole("button", { name: copy.addPhoto })).not.toBeNull();
    expect(queryByText(copy.photosDropHint)).not.toBeNull();
  });

  it("holds it after a save that fully landed, before any refetch", async () => {
    const { container, getByRole, queryByRole } = renderFeed({
      entries: [pastEntry(PHOTOS)],
      editing: PAST_ID,
    });

    fireEvent.click(
      getByRole("button", { name: copy.removePhoto.replace("{index}", "1") }),
    );
    pick(container, 1);
    await waitFor(() => expect(tiles(container)).toHaveLength(2));

    fireEvent.click(getByRole("button", { name: copy.save }));
    // The editor closes on a save that lands — and collapses over a strip that
    // still has to be showing the right thing while it does.
    await waitFor(() =>
      expect(
        getByRole("button", { name: copy.edit }).getAttribute("aria-expanded"),
      ).toBe("false"),
    );

    const sources = tileSources(container);
    expect(sources).toHaveLength(2);
    // The survivor, and the upload — now drawn from the id the route answered
    // with rather than from the local preview, at the same box it already had.
    expect(sources.some((src) => src.includes("session-tower"))).toBe(true);
    expect(sources.some((src) => src.includes("#uploaded-1"))).toBe(true);
    // Nothing left pointing at bytes that have been let go, and the deleted
    // photo does not come back for the frames before the refetch.
    expect(sources.some((src) => src.startsWith("blob:"))).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(sources.some((src) => src.includes("session-build.jpg"))).toBe(false);
    // Two of five slots used, so the Add button is back where it was.
    expect(queryByRole("button", { name: copy.addPhoto })).not.toBeNull();
  });
});

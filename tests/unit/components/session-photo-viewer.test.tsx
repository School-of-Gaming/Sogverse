import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionPhotoGallery, type SessionPhoto } from "@/components/session-feed";

/**
 * ============================================================================
 * The gallery's overlay pages through the set, and these pin what that costs.
 * ============================================================================
 *
 * The viewer used to hold one photo and offer one way out. It now holds the
 * whole set, which buys paging and brings four rules with it:
 *
 *   - **The ends wrap**, so neither arrow is ever a control that cannot act.
 *   - **A set of one has no arrows at all** — the same rule the strip's Add
 *     button follows at the cap: a control that can never do anything is dead
 *     space, and here the space it would take is the picture.
 *   - **Every tap closes except the controls.** Touch has no hover and no
 *     Escape, so the forgiving gesture has to be the ordinary one — which only
 *     works if pressing next is not also a request to leave.
 *   - **Focus goes back to the thumbnail that was pressed**, never to whichever
 *     one the overlay ended on: paging inside an overlay never moved the
 *     reader's place on the page.
 *
 * They are driven through the gallery rather than through the viewer directly,
 * because the open position lives with the gallery and the pair is the unit
 * that has to be right.
 */

const photos: readonly SessionPhoto[] = [
  { id: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  { id: "/preview-art/session-badge.jpg", width: 1200, height: 1200 },
  { id: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
];

const copy = messages.sessionFeed.photos;

function gallery(set: readonly SessionPhoto[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionPhotoGallery photos={set} />
    </NextIntlClientProvider>
  );
}

function renderGallery(set: readonly SessionPhoto[] = photos) {
  return render(gallery(set));
}

/** The spoken name of the overlay, which is also where its position shows. */
function viewerLabel(index: number, count: number) {
  return copy.viewer
    .replace("{index}", String(index))
    .replace("{count}", String(count));
}

function thumbnailName(index: number, count: number) {
  return copy.open
    .replace("{index}", String(index))
    .replace("{count}", String(count));
}

afterEach(cleanup);

describe("the session photo viewer", () => {
  it("opens on the thumbnail that was pressed", () => {
    const { getByRole } = renderGallery();

    fireEvent.click(getByRole("button", { name: thumbnailName(2, 3) }));

    expect(getByRole("dialog", { name: viewerLabel(2, 3) })).not.toBeNull();
  });

  it("wraps at both ends rather than offering a control that cannot act", () => {
    const { getByRole } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(1, 3) }));

    // Backwards off the front lands on the last, not on a disabled arrow.
    fireEvent.click(getByRole("button", { name: copy.previous }));
    expect(getByRole("dialog", { name: viewerLabel(3, 3) })).not.toBeNull();

    // And forwards off the end comes back round.
    fireEvent.click(getByRole("button", { name: copy.next }));
    expect(getByRole("dialog", { name: viewerLabel(1, 3) })).not.toBeNull();
  });

  it("pages with the arrow keys, from wherever focus happens to be", () => {
    const { getByRole } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(1, 3) }));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(getByRole("dialog", { name: viewerLabel(2, 3) })).not.toBeNull();

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(getByRole("dialog", { name: viewerLabel(1, 3) })).not.toBeNull();
  });

  it("hides both arrows for a set of one", () => {
    const { getByRole, queryByRole } = renderGallery([photos[0]]);

    fireEvent.click(getByRole("button", { name: thumbnailName(1, 1) }));

    // Absent, not present-and-dead: paging a set of one could never do
    // anything, and the space an arrow would take here is the picture.
    expect(queryByRole("button", { name: copy.previous })).toBeNull();
    expect(queryByRole("button", { name: copy.next })).toBeNull();
  });

  it("closes on a tap anywhere except on a control", () => {
    const { getByRole, queryByRole } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(1, 3) }));

    // Next does not also leave — the overlay's forgiving tap-to-close is only
    // safe because the three controls stop the click.
    fireEvent.click(getByRole("button", { name: copy.next }));
    expect(queryByRole("dialog", { name: viewerLabel(2, 3) })).not.toBeNull();

    // The ground around the picture does.
    fireEvent.click(getByRole("dialog", { name: viewerLabel(2, 3) }));
    expect(queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the pressed thumbnail, not to the one it ended on", () => {
    const { getByRole, queryByRole } = renderGallery();
    const trigger = getByRole("button", { name: thumbnailName(1, 3) });

    fireEvent.click(trigger);
    fireEvent.click(getByRole("button", { name: copy.next }));
    fireEvent.click(getByRole("button", { name: copy.close }));

    expect(queryByRole("dialog")).toBeNull();
    // Where the reader's place on the page is — which paging inside an overlay
    // never moved.
    expect(document.activeElement).toBe(trigger);
  });

  /**
   * A list can shorten underneath an open overlay — another tab, another gedu,
   * a refetch — and the two ways that lands are genuinely different.
   *
   * From the middle, the positions after it shift and the open one resolves to
   * the neighbour, which is the viewer's own defensive read of the array. Past
   * the end there is no neighbour, and *not drawing* the overlay is not the same
   * as closing it: the position stays set, so the reader's focus is stranded on
   * an overlay that is no longer on the page and a list that grows back puts it
   * on screen again without anybody asking.
   */
  it("lands on the neighbour when a photo is removed from the middle", () => {
    const { getByRole, rerender } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(2, 3) }));

    rerender(gallery([photos[0], photos[2]]));

    // Still open, on what is now at that position — the last of two.
    expect(getByRole("dialog", { name: viewerLabel(2, 2) })).not.toBeNull();
  });

  it("closes outright when the list shortens past the open photo", () => {
    const { getByRole, queryByRole, rerender } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(3, 3) }));
    expect(getByRole("dialog", { name: viewerLabel(3, 3) })).not.toBeNull();

    rerender(gallery(photos.slice(0, 2)));
    expect(queryByRole("dialog")).toBeNull();

    // And the position went with it, which is the half a null render does not
    // do: an overlay that had merely failed to draw would still be holding the
    // third position, and a list coming back to three would reopen it.
    rerender(gallery(photos));
    expect(queryByRole("dialog")).toBeNull();
  });

  it("closes when the whole set goes, which takes the gallery with it", () => {
    const { getByRole, queryByRole, rerender } = renderGallery();
    fireEvent.click(getByRole("button", { name: thumbnailName(1, 3) }));

    // The empty-list guard unmounts the row and the overlay together; every
    // position is past the end of an empty list, so this is the case above at
    // its limit rather than a second rule.
    rerender(gallery([]));
    expect(queryByRole("dialog")).toBeNull();
    expect(queryByRole("list", { name: messages.sessionFeed.photos.list })).toBeNull();

    rerender(gallery(photos));
    expect(queryByRole("dialog")).toBeNull();
  });
});

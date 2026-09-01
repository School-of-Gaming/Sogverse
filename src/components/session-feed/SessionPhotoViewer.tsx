"use client";

import { useTranslations } from "next-intl";
import {
  FullscreenImageViewer,
  type FullscreenViewerImage,
} from "@/components/ui/fullscreen-image-viewer";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import type { SessionPhoto } from "./types";

/**
 * A session's photos, opened over the page they were tapped on.
 *
 * **The overlay itself is shared** — `FullscreenImageViewer` in `components/ui`
 * — because opening, paging with wrap-around, the counter, closing and where
 * focus lands are one set of expectations wherever a picture is opened to be
 * looked at, and the chat log expects exactly the same ones. What is *not*
 * shared is what a set is and where its pictures live, which is the whole of
 * what this file is: a session photo is addressed by its **id**, resolved
 * through the shared session-image URL helper, and its vocabulary is the
 * feed's.
 *
 * That address rule is why this adapter exists at all where the chat log needs
 * none: chat hands the overlay images that already carry a servable `src`, so
 * its run passes them straight through, while nothing outside this module
 * should have to know that a photo's id is also its address.
 */
export function SessionPhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  /** The set being browsed, in the order the gallery drew it. */
  photos: readonly SessionPhoto[];
  /** Which photo is open, as a 0-based index — or `null` for a closed viewer. */
  index: number | null;
  /** Page to another photo. The open index lives with the gallery. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("sessionFeed");

  const images: readonly FullscreenViewerImage[] = photos.map((photo) => ({
    src: sessionImageUrl(photo.id),
    width: photo.width,
    height: photo.height,
  }));

  return (
    <FullscreenImageViewer
      images={images}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      labels={{
        viewer: (position, count) => t("photos.viewer", { index: position, count }),
        previous: t("photos.previous"),
        next: t("photos.next"),
        close: t("photos.close"),
      }}
    />
  );
}

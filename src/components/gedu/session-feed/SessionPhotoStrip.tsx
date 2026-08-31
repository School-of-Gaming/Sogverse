"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Images, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  sessionThumbnailWidth,
  type SessionPhoto,
} from "@/components/session-feed";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import { normalizeImage } from "@/lib/images/normalize-image";
import {
  SESSION_PHOTO_ACCEPT,
  SESSION_PHOTO_CAP,
  SESSION_PHOTO_JPEG_QUALITY,
  SESSION_PHOTO_MAX_EDGE,
  type SessionPhotoErrorCode,
} from "@/services/gedu-sessions";
import { cn } from "@/lib/utils";
import { sessionPhotoErrorCode } from "./photo-failure";

/**
 * The height a strip thumbnail is drawn at, in CSS pixels, at the wide
 * breakpoint — and the intrinsic height handed to the image optimizer, which is
 * what decides the variant actually fetched.
 *
 * Deliberately shorter than the read gallery's: this row lives inside an open
 * editor beside a nine-name register and two rich-text fields, and a thumbnail
 * at reading size would push the Save button off a laptop screen. The narrow
 * breakpoint draws the same pictures shorter still — a ratio is a ratio at
 * either height, so the optimizer is told about the taller of the two.
 */
const STRIP_THUMB_HEIGHT = 96;

/**
 * The line each refusal reads as. A **total** map over the code union rather
 * than a template key, so a code added to the contracts cannot reach a render
 * without the compiler asking what it says — and so no path can put a missing
 * translation key on screen at the one moment something has already gone wrong.
 */
const PHOTO_ERROR_KEY = {
  decodeFailed: "photoErrorDecodeFailed",
  encodeFailed: "photoErrorEncodeFailed",
  notJpeg: "photoErrorNotJpeg",
  tooLarge: "photoErrorTooLarge",
  badDimensions: "photoErrorBadDimensions",
  capReached: "photoErrorCapReached",
  notAllowed: "photoErrorNotAllowed",
  uploadFailed: "photoErrorUploadFailed",
} as const satisfies Record<SessionPhotoErrorCode, string>;

/**
 * One photo the browser has prepared but the feed has not yet handed back.
 *
 * It carries its own **encoded** dimensions, which is what lets the thumbnail
 * appear at the exact size its stored twin will occupy: the box is right before
 * the upload starts, so nothing in the strip moves when the round trip lands.
 */
interface PendingPhoto {
  /** Local identity, stable across the upload. Never a stored id. */
  key: string;
  /** `URL.createObjectURL` of the normalized JPEG — revoked when it lands. */
  url: string;
  width: number;
  height: number;
  /**
   * The stored id once the upload has answered, `null` while it is in the air.
   *
   * It is what lets this tile hand over to its stored twin *exactly* when the
   * refetched feed carries it, rather than a frame earlier — which would blank
   * the row for the length of an invalidation.
   */
  id: string | null;
}

interface SessionPhotoStripProps {
  /**
   * Whether the editor around this strip is expanded. The strip stays mounted
   * while collapsed — an upload started here must survive the gedu closing the
   * card — so this is only how a stale refusal line is cleared on the way back
   * in.
   */
  open: boolean;
  /** The session's stored photos, oldest first, exactly as the card renders them. */
  photos: readonly SessionPhoto[];
  /**
   * Attach one normalized JPEG. **Awaited**, and it resolves with the stored
   * id — which is what this component matches against the refetched feed to
   * know when its own preview may go.
   */
  onAddPhoto: (photo: {
    file: Blob;
    width: number;
    height: number;
  }) => Promise<string>;
  /** Remove one stored photo. Awaited; the refetch is what redraws the row. */
  onRemovePhoto: (imageId: string) => Promise<void>;
}

/**
 * The photo block on a session's record editor: what is attached, and the two
 * controls that change it.
 *
 * **It is not part of the draft, and everything about it says so without saying
 * so.** The register and the two written fields are held until Save; a photo is
 * attached the instant it uploads and gone the instant it is removed. That is a
 * genuine difference in what a control does, so it is carried by *idiom* rather
 * than by a sentence nobody reads: thumbnails with a corner ✕, a spinner over
 * the one still going up, an Add button at the end of the run — the vocabulary
 * every mail client and chat window has already taught. Two further signals
 * back it up. The block sits on its own recessed ground rather than inside one
 * of the editor's bordered field boxes, and — the load-bearing one — **it stays
 * live while a Save is in flight**, alone in a greyed editor. A control that
 * still works while everything around it is locked is not part of what is being
 * saved, and a reader learns that in one glance the first time they see it.
 *
 * **The add affordance disappears at the cap rather than going disabled.** A
 * slot that can never fill is dead space, and a button that can never be pressed
 * is one more thing to read on the way past. Its absence is the whole of the
 * message; the copy that explains it belongs to the refusal a racing second tab
 * gets, not to the ordinary case.
 *
 * **A batch is trimmed once, up front, rather than refused one file at a time.**
 * Multi-select is allowed, so a gedu can pick eight photos for a report with
 * three slots left. Cutting the selection to what fits *before* anything
 * uploads makes that one visible line about one decision; uploading the lot and
 * letting the RPC refuse five of them would be five error states about a
 * mistake nobody made.
 *
 * **The whole batch stops at the first refusal.** The three most likely ones —
 * the session is full, this is not your group, the connection is gone — are
 * facts about the batch rather than about the file that hit them, so carrying on
 * would produce exactly the run of identical refusals the trim above exists to
 * prevent. The photos that landed before it stay landed, and the gedu picks
 * again for the rest.
 *
 * **Nothing here is measured.** Every box is arithmetic from the encoded
 * dimensions the browser just produced, so the preview is already the shape its
 * stored twin will be and the row does not reshuffle when the round trip lands.
 */
export function SessionPhotoStrip({
  open,
  photos,
  onAddPhoto,
  onRemovePhoto,
}: SessionPhotoStripProps) {
  const t = useTranslations("gedu.sessionFeed");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [pending, setPending] = useState<PendingPhoto[]>([]);
  /**
   * Held true from **before** the first `mutate` of a batch until the last one
   * settles, and used for the button's disabled state and its spinner.
   *
   * `isPending` on the mutation is not enough and is not consulted: it goes
   * false the moment React Query dispatches each success, which is one render
   * before the next upload in the batch has started — so a fast second click
   * would land in the gap and start a second batch over the same remaining
   * slots.
   */
  const [committing, setCommitting] = useState(false);
  /** The stored id whose removal is in flight, or `null`. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<SessionPhotoErrorCode | null>(null);
  /** How many of an over-cap selection were taken, or `null` for no trim. */
  const [trimmed, setTrimmed] = useState<number | null>(null);

  // Clear the transient lines on the way back into an open editor, exactly as
  // the editor around this re-seeds its draft: a refusal is the answer to one
  // click, and finding last week's still sitting there is worse than finding
  // nothing. The uploads themselves are deliberately untouched — one may still
  // be in the air.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setTrimmed(null);
    }
  }

  const storedIds = useMemo(
    () => new Set(photos.map((photo) => photo.id)),
    [photos],
  );

  /**
   * The previews still worth drawing — **derived, never stored**.
   *
   * A preview hands over to its stored twin at exactly the render where the
   * refetched feed carries it, and not one earlier: dropping it when the upload
   * resolved would blank the tile for the length of the invalidation that
   * follows, which is the flicker the local preview exists to prevent. Deriving
   * that is also what keeps this component free of the effect-that-sets-state
   * shape, whose real cost here would have been a cascading render on every
   * feed refresh, photos or no photos.
   *
   * A landed entry stays in `pending` until the next pick tidies it — or until
   * the photo it became is removed, which is the one other moment this filter
   * would otherwise change its mind about: the predicate asks whether the id is
   * *currently* stored, so a removal that takes the id back out of `storedIds`
   * would bring the preview back. It costs one small object in the meantime,
   * which is why every count below reads *this* list rather than that one.
   */
  const visiblePending = pending.filter(
    (photo) => photo.id === null || !storedIds.has(photo.id),
  );

  /**
   * Every object URL this strip has minted, so none outlives the card.
   *
   * A ref rather than state, and touched only from handlers and the unmount
   * cleanup: nothing renders from it, and a blob the browser is still holding
   * is not something a render should be deciding about.
   */
  const objectUrls = useRef(new Set<string>());
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    },
    [],
  );

  /** Let go of a preview and the bytes behind it, together. */
  const dropPreview = (matches: (photo: PendingPhoto) => boolean) => {
    setPending((prev) =>
      prev.filter((photo) => {
        if (!matches(photo)) return true;
        URL.revokeObjectURL(photo.url);
        objectUrls.current.delete(photo.url);
        return false;
      }),
    );
  };

  const shown = photos.length + visiblePending.length;
  const room = Math.max(0, SESSION_PHOTO_CAP - shown);

  const handlePick = async (picked: readonly File[]) => {
    // Synchronous, before the first await: the button has to be disabled on the
    // very next render, not on the one after the first upload resolves.
    setCommitting(true);
    setError(null);
    setTrimmed(null);
    // The previous batch's landed previews are still in the list, invisible.
    // This is the moment to let their blobs go: a pick is a user action, so the
    // work is theirs rather than a refetch's.
    dropPreview((photo) => photo.id !== null && storedIds.has(photo.id));

    const batch = picked.slice(0, room);
    if (batch.length < picked.length) setTrimmed(batch.length);

    for (const file of batch) {
      const key = crypto.randomUUID();
      let url: string | null = null;
      try {
        // Normalize FIRST, then preview. The encoded dimensions are what the
        // box is drawn from, so previewing the raw pick would mean a tile that
        // resized itself the moment the encode finished — a shift on data's own
        // schedule, in the one place the gedu is watching.
        const normalized = await normalizeImage(file, {
          maxEdge: SESSION_PHOTO_MAX_EDGE,
          quality: SESSION_PHOTO_JPEG_QUALITY,
        });
        url = URL.createObjectURL(normalized.blob);
        objectUrls.current.add(url);
        const preview: PendingPhoto = {
          key,
          url,
          width: normalized.width,
          height: normalized.height,
          id: null,
        };
        setPending((prev) => [...prev, preview]);

        const id = await onAddPhoto({
          file: normalized.blob,
          width: normalized.width,
          height: normalized.height,
        });
        setPending((prev) =>
          prev.map((photo) => (photo.key === key ? { ...photo, id } : photo)),
        );
      } catch (cause) {
        // A tile only exists past the encode, so a decode refusal has nothing
        // to take down and the guard says which half failed.
        if (url !== null) dropPreview((photo) => photo.key === key);
        setError(sessionPhotoErrorCode(cause));
        // The rest of the batch is abandoned on purpose — see the component
        // note. The gedu gets one line, not five.
        break;
      }
    }

    setCommitting(false);
  };

  const handleRemove = async (imageId: string) => {
    setRemoving(imageId);
    setError(null);
    try {
      await onRemovePhoto(imageId);
      // `removing` is left set: the refetch that follows takes the tile off the
      // row, and clearing first would hand back a live ✕ over a photo that is
      // already gone.
      //
      // The preview this photo was uploaded from goes here, though, and this is
      // the last moment it can. It has been invisible since the feed first
      // carried its stored twin — but only because the filter above asks
      // whether its id is stored *now*, so leaving the entry behind would let
      // this removal un-hide it as a permanently-busy tile with no ✕, counting
      // against the cap for as long as the card stays mounted.
      dropPreview((photo) => photo.id === imageId);
    } catch (cause) {
      setRemoving(null);
      setError(sessionPhotoErrorCode(cause));
    }
  };

  return (
    // Recessed rather than bordered: the editor's two written fields sit in
    // bordered boxes that mean "this is a field you are drafting", and this
    // block is the one thing here that is not.
    <section
      aria-labelledby={titleId}
      className="rounded-md bg-muted/40 p-3 sm:p-3.5"
    >
      <p
        id={titleId}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        <Images className="h-3 w-3" aria-hidden />
        {t("photosTitle")}
      </p>

      {/* `items-end` so the Add button sits on the thumbnails' baseline
          whatever their heights round to, and the run reads as one row. */}
      <ul className="mt-2 flex flex-wrap items-end gap-2">
        {photos.map((photo, index) => (
          <StripThumbnail
            key={photo.id}
            src={sessionImageUrl(photo.id)}
            width={photo.width}
            height={photo.height}
            optimized
            busy={removing === photo.id}
            label={t("removePhoto", { index: index + 1 })}
            onRemove={() => void handleRemove(photo.id)}
          />
        ))}
        {visiblePending.map((photo) => (
          <StripThumbnail
            key={photo.key}
            src={photo.url}
            width={photo.width}
            height={photo.height}
            optimized={false}
            busy
            uploadingLabel={t("photoUploading")}
          />
        ))}

        {room > 0 && (
          <li className="shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              // Disabled through the whole batch, not per file — the flag is
              // live before the first render after the click and only drops
              // once every upload in the run has settled.
              disabled={committing}
              onClick={() => inputRef.current?.click()}
              className="gap-1.5"
            >
              {committing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              )}
              {t("addPhoto")}
            </Button>
          </li>
        )}

        {/* The invitation, and the whole of the "encourage a photo" ask: it sits
            beside the one control that answers it and is gone the moment there
            is a photo, so it can never read as a nag on a report that already
            has five. */}
        {shown === 0 && (
          <li className="text-sm text-muted-foreground">{t("photosEmpty")}</li>
        )}
      </ul>

      <input
        ref={inputRef}
        type="file"
        // Only web formats, which is what makes the mainline iPhone path work
        // with no code at all: iOS Safari transcodes a photo-library pick to
        // JPEG on its way through an input whose accept list excludes HEIC.
        accept={SESSION_PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          // Copied out of the live `FileList` **before** the input is cleared:
          // that list is a view onto the input's own selection, so resetting
          // the value first would empty the very array about to be uploaded.
          const picked = Array.from(event.target.files ?? []);
          // Cleared so picking the same file twice in a row still fires a
          // change the second time.
          event.target.value = "";
          if (picked.length > 0) void handlePick(picked);
        }}
      />

      {trimmed !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("photosTrimmed", { cap: SESSION_PHOTO_CAP, count: trimmed })}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t(PHOTO_ERROR_KEY[error])}
        </p>
      )}
    </section>
  );
}

/**
 * One tile in the strip: the picture, and whatever is happening to it.
 *
 * The ✕ sits *inside* the picture's top-right corner rather than hanging off
 * it. Hanging controls overlap the neighbouring tile at this gap, and a row
 * whose photos each half-cover the one before is not a row anybody can aim at.
 *
 * A tile with no `onRemove` is one still going up — the control it would carry
 * has nothing to remove yet, and the spinner over it is the whole of what there
 * is to say.
 */
function StripThumbnail({
  src,
  width,
  height,
  optimized,
  busy,
  label,
  uploadingLabel,
  onRemove,
}: {
  src: string;
  width: number;
  height: number;
  /**
   * Whether this goes through the image optimizer. A stored photo does — a
   * 2048 px master fetched into a 96 px box five times a card is the delivery
   * cost the optimizer exists to remove. A local `blob:` preview cannot: the
   * optimizer is a server, and the bytes only exist in this tab.
   */
  optimized: boolean;
  busy: boolean;
  label?: string;
  uploadingLabel?: string;
  onRemove?: () => void;
}) {
  const boxWidth = sessionThumbnailWidth(width, height, STRIP_THUMB_HEIGHT);
  // `h-20 w-auto` against the intrinsic pair below is the layout: the browser
  // reads the ratio off the two attributes and resolves the width from it, so
  // the box is right before the JPEG decodes. `contain` turns the half-pixel
  // the rounding costs — and a clamped extreme ratio — into a letterbox rather
  // than a crop.
  const imageClass = cn(
    "h-20 w-auto max-w-full rounded-md border border-border bg-muted object-contain sm:h-24",
    busy && "opacity-40",
  );

  return (
    <li className="relative max-w-full shrink-0" aria-busy={busy || undefined}>
      {optimized ? (
        <Image
          src={src}
          alt=""
          width={boxWidth}
          height={STRIP_THUMB_HEIGHT}
          className={imageClass}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL for bytes that exist only in this tab; next/image would ask a server to optimize something it cannot fetch
        <img
          src={src}
          alt=""
          width={boxWidth}
          height={STRIP_THUMB_HEIGHT}
          className={imageClass}
        />
      )}

      {busy && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-foreground" aria-hidden />
          {uploadingLabel !== undefined && (
            <span className="sr-only">{uploadingLabel}</span>
          )}
        </span>
      )}

      {onRemove !== undefined && label !== undefined && (
        <button
          type="button"
          aria-label={label}
          disabled={busy}
          onClick={onRemove}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

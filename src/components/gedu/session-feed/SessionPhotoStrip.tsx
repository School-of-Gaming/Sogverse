"use client";

import { useId, useRef, useState } from "react";
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
import {
  keptPhotos,
  stagedPhotoCount,
  type SessionPhotoEditing,
} from "./staged-photos";

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
  removeFailed: "photoErrorRemoveFailed",
} as const satisfies Record<SessionPhotoErrorCode, string>;

/**
 * The file types a drop is allowed to carry — the input's own `accept` list,
 * read as a set.
 *
 * A file input filters the picker dialog for free; a drop has no dialog and
 * arrives with whatever was dragged, so the same list has to be applied by
 * hand. It is derived from the one constant rather than restated, because a
 * drop that accepted something the picker refuses would be a second, wider
 * definition of what this feature takes.
 */
const ACCEPTED_TYPES = new Set(SESSION_PHOTO_ACCEPT.split(","));

interface SessionPhotoStripProps extends SessionPhotoEditing {
  /**
   * Whether the editor around this strip is expanded. Used only to clear the
   * one transient line this block still owns — a trim is the answer to one
   * pick, and finding last week's still sitting there is worse than finding
   * nothing.
   */
  open: boolean;
  /** The session's **stored** photos, oldest first, exactly as the card renders them. */
  photos: readonly SessionPhoto[];
  /**
   * A save is in flight. The strip greys out with every other field on the
   * card, because a photo is now part of what that Save is carrying.
   */
  disabled: boolean;
}

/**
 * The photo block on an open session editor — either of them: what the report
 * will hold once this edit is saved, and the two controls that change it.
 *
 * **It is draft scope, exactly like the register and the two written fields.**
 * A picked file is decoded, downscaled and re-encoded here and then *held* — no
 * upload happens until Save, and the ✕ on a stored photo crosses it out rather
 * than deleting it. One button commits the whole card, and Cancel throws the
 * whole card away. This reverses the block's original shape *(owner)*: photos
 * attached on pick, which made them the one thing on an open editor that was
 * already stored, and required an idiom whose entire job was to say so.
 *
 * **A refusal the browser can make is still made at pick time.** A file the
 * decoder will not open — the raw-HEIC case — says so the moment it is chosen,
 * because learning at Save that one of five files was never usable is the worst
 * possible moment to be told. What waits for Save is the *network*, not the
 * verdict on the bytes.
 *
 * **A crossed-out photo simply leaves the row.** That is what deleting a
 * paragraph of the write-up looks like, and photos are held to the same
 * grammar: nothing is stored yet, so nothing needs an undo of its own — Cancel
 * is the undo, for the whole card at once. A greyed tile with its own restore
 * control would be a second, photo-only notion of "unsaved change" sitting
 * inside an editor that already has one.
 *
 * **The add affordance disappears at the cap rather than going disabled.** A
 * slot that can never fill is dead space, and a button that can never be pressed
 * is one more thing to read on the way past. The cap counts what the report
 * *would* hold — stored, minus what is crossed out, plus what is staged — so
 * swapping a photo at the cap works without ever showing a refusal.
 *
 * **The run it draws is the arrangement the gedu left, not the props plus a
 * diff.** A save that half-lands empties the staged set as it goes, and the
 * stored `photos` do not change until the feed refetches — so the row is derived
 * from the staged set *and* the record of what has already landed, which between
 * them cover that window. Without the second half a landed deletion would put
 * its tile back and a landed upload would take its own away, at the exact moment
 * a refusal line is asking the gedu to look at the row and decide what to retry.
 *
 * **A batch is trimmed once, up front, rather than refused one file at a time.**
 * Multi-select is allowed, so a gedu can pick eight photos for a report with
 * three slots left. Cutting the selection to what fits *before* anything is
 * prepared makes that one visible line about one decision.
 *
 * **The whole batch stops at the first refusal**, because the likely refusals
 * are facts about the batch rather than about the file that hit them. The
 * pictures already staged stay staged, and the gedu picks again for the rest.
 *
 * **A drop is a pick.** The whole block is a drop target — gedu surfaces are
 * desktop-default, and a screenshot a gedu just took is one drag from the
 * folder it landed in — but a dropped file joins the *same* pipeline the picker
 * feeds: the same accept list, the same trim to the remaining slots, the same
 * normalize pass, the same one-line refusal. What the drop path owns is only the
 * pair of answers a file dialog gives by construction — it will not select a
 * `.txt`, and the Add button it hangs off is gone at the cap — which a drop has
 * to say in words instead.
 *
 * **Nothing here is measured.** Every box is arithmetic from the encoded
 * dimensions the browser just produced, so a staged tile is already the shape
 * its stored twin will be and the row does not reshuffle when the save lands.
 */
export function SessionPhotoStrip({
  open,
  photos,
  staged,
  landed,
  disabled,
  error,
  onStageAdd,
  onUnstageAdd,
  onStageRemoval,
  onError,
}: SessionPhotoStripProps) {
  const t = useTranslations("gedu.sessionFeed");
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Held true from **before** the first `await` of a batch until the last file
   * has been prepared, and used for the Add button's disabled state and its
   * spinner.
   *
   * Preparing a 4K screenshot is a real decode-and-re-encode pass, so a batch
   * is not instant even though nothing leaves the browser. The flag is live
   * before the first render after the click, which is what stops a fast second
   * press starting a second batch over the same remaining slots.
   */
  const [preparing, setPreparing] = useState(false);
  /** How many of an over-cap selection were taken, or `null` for no trim. */
  const [trimmed, setTrimmed] = useState<number | null>(null);
  /** Whether files are currently being dragged over the block. */
  const [dragging, setDragging] = useState(false);

  // Clear the trim line on the way back into an open editor, exactly as the
  // editor around this re-seeds its draft. The refusal line is the feed's, and
  // is cleared there on the same two occasions.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTrimmed(null);
  }

  // Both halves of the edit, and neither alone: `photos` is a prop that does not
  // move until the feed refetches, so between an operation landing and that
  // refetch the staged set has forgotten what the props have not yet learned.
  // See the landed record's own note for what the strip looks like without it.
  const kept = keptPhotos(photos, staged, landed);
  const shown = stagedPhotoCount(photos, staged, landed);
  const room = Math.max(0, SESSION_PHOTO_CAP - shown);
  const busy = disabled || preparing;
  /**
   * Whether a drop would be taken right now — the same two conditions the Add
   * button expresses by being disabled and by being absent. It decides the
   * highlight only; the drop itself still arrives (see the block's
   * `onDragOver`), because a refusal a gedu can read beats a file the browser
   * quietly opens in the tab.
   */
  const canDrop = !busy && room > 0;

  const handlePick = async (picked: readonly File[]) => {
    // Synchronous, before the first await: the button has to be disabled on the
    // very next render, not on the one after the first file is prepared.
    setPreparing(true);
    onError(null);
    setTrimmed(null);

    const batch = picked.slice(0, room);
    if (batch.length < picked.length) setTrimmed(batch.length);

    for (const file of batch) {
      try {
        // Normalize FIRST, then stage. The encoded dimensions are what the box
        // is drawn from, so staging the raw pick would mean a tile that resized
        // itself the moment the encode finished — a shift on data's own
        // schedule, in the one place the gedu is watching.
        const normalized = await normalizeImage(file, {
          maxEdge: SESSION_PHOTO_MAX_EDGE,
          quality: SESSION_PHOTO_JPEG_QUALITY,
        });
        onStageAdd({
          key: crypto.randomUUID(),
          url: URL.createObjectURL(normalized.blob),
          file: normalized.blob,
          width: normalized.width,
          height: normalized.height,
        });
      } catch (cause) {
        onError(sessionPhotoErrorCode(cause));
        // The rest of the batch is abandoned on purpose — see the component
        // note. The gedu gets one line, not five.
        break;
      }
    }

    setPreparing(false);
  };

  /**
   * A drop, turned into exactly the selection the file input would have
   * produced — and then handed to the same function.
   *
   * **One pipeline, two ways in.** Everything that makes a pick safe lives past
   * this point: the accept list, the trim to the remaining slots, the normalize
   * pass, the batch's single refusal line. A drop that grew its own copy of any
   * of those would be a second, quietly different definition of what this block
   * takes — so all this does is answer the two questions the file input answers
   * before a change event ever fires (are these the right kind of file, and is
   * there anywhere to put them) and then get out of the way.
   */
  const handleDrop = (dropped: readonly File[]) => {
    // A batch being prepared owns the remaining slots, and a save in flight owns
    // the whole card; the Add button is disabled for the same two reasons, and
    // it says nothing either.
    if (busy) return;
    if (room === 0) {
      setTrimmed(null);
      onError("capReached");
      return;
    }
    const usable = dropped.filter((file) => ACCEPTED_TYPES.has(file.type));
    if (usable.length === 0) {
      setTrimmed(null);
      onError("notJpeg");
      return;
    }
    void handlePick(usable);
  };

  return (
    // Recessed rather than bordered: the editor's two written fields sit in
    // bordered boxes of their own, and a third box around a row of pictures
    // would read as a fourth field rather than as the report's attachments.
    <section
      aria-labelledby={titleId}
      // The whole block is the drop target, not a separate dashed rectangle
      // inside it: what a gedu is dropping onto is "the photos", and the block
      // already draws exactly that. A second target would also have to be held
      // open at the cap, where there is nowhere for a file to go.
      onDragOver={(event) => {
        // Always prevented, even where a drop will be refused — an unprevented
        // dragover makes this not a drop target at all, and the browser answers
        // the drop by *navigating the tab to the file*, taking an open editor
        // with it. Refusing out loud is the whole reason the event has to
        // arrive here first.
        event.preventDefault();
        if (canDrop) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleDrop(Array.from(event.dataTransfer.files));
      }}
      className={cn(
        "rounded-md bg-muted/40 p-3 transition-colors sm:p-3.5",
        // Tinted and ringed rather than resized: the answer to "will this land
        // here" has to be visible without the block growing under a pointer
        // that is mid-gesture.
        dragging && "bg-primary/10 ring-2 ring-primary",
        // Greyed with the rest of the editor while the card commits, because
        // what is on this strip is part of what that Save is carrying.
        disabled && "opacity-60",
      )}
    >
      <p
        id={titleId}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        <Images className="h-3 w-3" aria-hidden />
        {t("photosTitle")}
      </p>

      {/* `items-end` so the Add button sits on the thumbnails' baseline
          whatever their heights round to, and the run reads as one row.

          Stored and staged tiles are drawn in one continuous run and look
          identical, which is the point: after Save they will be the same thing,
          and a picture the gedu has just added is as much a part of what the
          report will say as one added last week. */}
      <ul className="mt-2 flex flex-wrap items-end gap-2">
        {kept.map((photo, index) => (
          <StripThumbnail
            key={photo.id}
            src={sessionImageUrl(photo.id)}
            width={photo.width}
            height={photo.height}
            optimized
            disabled={busy}
            label={t("removePhoto", { index: index + 1 })}
            onRemove={() => onStageRemoval(photo.id)}
          />
        ))}
        {staged.adds.map((photo, index) => (
          <StripThumbnail
            key={photo.key}
            src={photo.url}
            width={photo.width}
            height={photo.height}
            optimized={false}
            disabled={busy}
            label={t("removePhoto", { index: kept.length + index + 1 })}
            onRemove={() => onUnstageAdd(photo.key)}
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
              // once every file in the run has been prepared.
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="gap-1.5"
            >
              {preparing ? (
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
            has five.

            `self-center` against the row's `items-end`: that baseline exists to
            line thumbnails up with the Add button whatever their heights round
            to, and a single line of text has no baseline to share — bottom-
            aligning it drops the sentence below the button's own label, which
            is what made the empty block read as broken. */}
        {shown === 0 && (
          <li className="self-center text-sm text-muted-foreground">
            {t("photosEmpty")}
          </li>
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
          // the value first would empty the very array about to be prepared.
          const picked = Array.from(event.target.files ?? []);
          // Cleared so picking the same file twice in a row still fires a
          // change the second time.
          event.target.value = "";
          if (picked.length > 0) void handlePick(picked);
        }}
      />

      {/* Drag-and-drop leaves no trace on a page, so the one line that says it
          exists has to be standing copy. It is shown only while there is
          somewhere for a file to land — at the cap it would be an instruction
          for something that cannot happen — and it sits *above* the two
          transient lines so a refusal arriving lands at the end of the run and
          pushes nothing already on screen. */}
      {room > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("photosDropHint")}
        </p>
      )}

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
 * One tile in the strip: the picture, and the control that takes it off the
 * report.
 *
 * The ✕ sits *inside* the picture's top-right corner rather than hanging off
 * it. Hanging controls overlap the neighbouring tile at this gap, and a row
 * whose photos each half-cover the one before is not a row anybody can aim at.
 *
 * **One tile, whatever is behind it.** A stored photo and one picked a moment
 * ago look and behave identically here, because after Save they are the same
 * thing — only the src differs, and with it whether the image optimizer can be
 * asked for a variant.
 */
function StripThumbnail({
  src,
  width,
  height,
  optimized,
  disabled,
  label,
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
  disabled: boolean;
  label: string;
  onRemove: () => void;
}) {
  const boxWidth = sessionThumbnailWidth(width, height, STRIP_THUMB_HEIGHT);
  // `h-20 w-auto` against the intrinsic pair below is the layout: the browser
  // reads the ratio off the two attributes and resolves the width from it, so
  // the box is right before the JPEG decodes. `contain` turns the half-pixel
  // the rounding costs — and a clamped extreme ratio — into a letterbox rather
  // than a crop.
  const imageClass =
    "h-20 w-auto max-w-full rounded-md border border-border bg-muted object-contain sm:h-24";

  return (
    <li className="relative max-w-full shrink-0">
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

      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </li>
  );
}

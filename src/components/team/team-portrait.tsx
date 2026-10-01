import Image from "next/image";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import { COVER_HOVER_ZOOM } from "@/components/ui/cover-hover-zoom";
import { VOICE_ZONE_COLORS } from "@/lib/constants/voice-zones";
import { cn } from "@/lib/utils";
import type {
  TeamProfile,
  TeamProfilePhoto,
} from "@/services/team-profiles/team-profiles.types";

/** The classes a person's pick draws with, or `null` with no pick. */
export function teamPickClasses(pick: TeamProfile["pick"]) {
  return pick === null ? null : VOICE_ZONE_COLORS[`${pick}`];
}

/**
 * **The 4:5 portrait frame a person is shown in** — on their profile page and
 * on their Team card: their photo, or, in the editor's preview of a profile
 * that has none yet, the drawn placeholder. The public pages never meet the
 * placeholder, since a profile cannot go up without a photo. Decorative
 * either way: the name beside or under it names the person.
 *
 * **With a pick, the frame is edged in it and glows with it**, through the
 * voice zones' own `glow` classes, unchanged. That glow is an inset shadow, and
 * an inset shadow paints beneath an element's content, so it is laid over the
 * photo on its own layer rather than on the frame, where the photo would cover
 * it. With no pick the frame is the neutral edge, at the same width, so
 * choosing or clearing a colour in the editor moves nothing.
 *
 * **One corner wherever a person is framed**, on their page and on their Team
 * card alike, so the two read as one family. A frame inside a link leans its
 * photo in while the link is pointed at (`zoomOnHover`), the same 2% the
 * Library and product cards use; the frame and its glow stay put.
 *
 * **The photo is drawn `unoptimized`**: in the editor a saved one is a private
 * object behind a short-lived signed URL, which the image optimiser would
 * cache for a year under an unauthenticated address, and a new crop is a local
 * object URL it cannot fetch at all; on the public pages it is the app's photo
 * route, whose five-minute cache is what takes a hidden profile's photo down,
 * and the optimiser's year would outlive it. The frame holds its 4:5 before
 * the bytes arrive, so nothing moves when they do.
 */
export function TeamPortrait({
  photo,
  pick,
  priority = false,
  zoomOnHover = false,
  className,
  imageClassName,
}: {
  photo: TeamProfilePhoto | null;
  pick: TeamProfile["pick"];
  priority?: boolean;
  /** Lean the photo in when its card is pointed at (`COVER_HOVER_ZOOM`). */
  zoomOnHover?: boolean;
  /** The frame's size. */
  className?: string;
  imageClassName?: string;
}) {
  const classes = teamPickClasses(pick);
  return (
    <div
      aria-hidden
      className={cn(
        "relative aspect-[4/5] overflow-hidden rounded-2xl border-4 bg-card",
        classes === null ? "border-border" : classes.edge,
        className,
      )}
    >
      {photo ? (
        <Image
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt=""
          unoptimized
          className={cn(
            "h-full w-full object-cover",
            zoomOnHover && COVER_HOVER_ZOOM,
            imageClassName,
          )}
          priority={priority}
        />
      ) : (
        <TeamPhotoPlaceholder className="h-full w-full" />
      )}
      {classes !== null && (
        <span className={cn("absolute inset-0 rounded-xl", classes.glow)} />
      )}
    </div>
  );
}

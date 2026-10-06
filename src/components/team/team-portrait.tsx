import Image from "next/image";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import { COVER_HOVER_ZOOM } from "@/components/ui/cover-hover-zoom";
import { VOICE_ZONE_COLORS } from "@/lib/constants/voice-zones";
import { cn } from "@/lib/utils";
import {
  isPublicTeamPhotoUrl,
  type TeamProfile,
  type TeamProfilePhoto,
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
 * **A public photo goes through the image optimiser; every other is drawn
 * `unoptimized`**, decided from the address (`isPublicTeamPhotoUrl`), so no
 * caller can get it wrong. A public photo is the app's photo route at one
 * version of the photo, and the optimiser serves it resized and as WebP from
 * its year-long cache, as it does every other public picture on the site. A
 * hidden profile's photo may go on being served from that cache, which the
 * owner accepted (ruling of 2026-10-05): hiding takes the person off the Team
 * page and their profile page. In the editor a saved photo is a private object
 * behind a short-lived signed URL, which the optimiser would cache for a year
 * under an unauthenticated address, and a new crop is a local object URL it
 * cannot fetch at all. The frame holds its 4:5 before the bytes arrive, so
 * nothing moves when they do.
 *
 * **`sizes` is the caller's**: the CSS width the frame resolves to in its
 * layout. Without it the optimiser's candidates are the photo's own 800px and
 * twice that, which hands a 150px card most of what the optimiser saved.
 */
export function TeamPortrait({
  photo,
  pick,
  sizes,
  loading = "lazy",
  zoomOnHover = false,
  className,
  imageClassName,
}: {
  photo: TeamProfilePhoto | null;
  pick: TeamProfile["pick"];
  /** The width the frame is drawn at, as an `<img sizes>` value. */
  sizes: string;
  /**
   * When the photo loads: as it nears the screen (the default), at once for a
   * frame on the first screen (`eager`), or preloaded from the head for a
   * page's one leading image (`preload`).
   */
  loading?: "lazy" | "eager" | "preload";
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
          sizes={sizes}
          unoptimized={!isPublicTeamPhotoUrl(photo.src)}
          className={cn(
            "h-full w-full object-cover",
            zoomOnHover && COVER_HOVER_ZOOM,
            imageClassName,
          )}
          loading={loading === "eager" ? "eager" : undefined}
          preload={loading === "preload"}
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

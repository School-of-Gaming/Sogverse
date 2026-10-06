import Image from "next/image";
import { cn } from "@/lib/utils";
import type { CatalogueImagePurpose } from "@/types";
import { COVER_HOVER_ZOOM } from "./cover-hover-zoom";

/**
 * The frame each catalogue purpose is painted in: 3:2 for a product picture,
 * 16:9 for a Library cover and for a landing page picture. A picture is cut for exactly one purpose, so a
 * frame is chosen by naming the purpose, and there is no ratio here for a
 * caller to pick. The ratio matches the purpose's stored size in
 * `CATALOGUE_IMAGE_PURPOSES`; the two change together.
 */
const FRAME: Record<CatalogueImagePurpose, string> = {
  product: "aspect-[3/2] w-full",
  library_cover: "aspect-video w-full",
  landing_image: "aspect-video w-full",
};

/**
 * The placeholder's drawing box per purpose, in the frame's own proportions so
 * the fill reaches every edge. The label is set at 12% of the box's width in
 * both, so it takes the same share of the frame whichever frame it is.
 */
const PLACEHOLDER_BOX: Record<
  CatalogueImagePurpose,
  { width: number; height: number }
> = {
  product: { width: 150, height: 100 },
  library_cover: { width: 160, height: 90 },
  landing_image: { width: 160, height: 90 },
};

const PLACEHOLDER_LABEL_SHARE = 0.12;

/**
 * What the no-image placeholder says, in every locale.
 *
 * A constant rather than a message key, for the same reason a room code is one:
 * it is machine text, not copy — the same two words wherever the app is read,
 * and nothing a translator is being asked to voice. Caps as furniture, so it
 * cannot be mistaken for something the design chose to show.
 */
const NO_IMAGE_LABEL = "NO IMAGE";

export interface FramedImageProps {
  /** The catalogue purpose the picture was cut for; it decides the frame. */
  purpose: CatalogueImagePurpose;
  /** Resolved image URL, or `null` for no picture. */
  src: string | null;
  /** Width, corners and borders for the frame — never its aspect ratio. */
  className?: string;
  /** The CSS width this frame resolves to, per breakpoint, for the browser's
   *  `srcset` pick. Default `100vw` over-fetches — state the real width. */
  sizes?: string;
  /** Fetch on first paint, for a frame reliably above the fold. */
  eager?: boolean;
  /** Lean the picture in when its card is pointed at — for a card that opens
   *  somewhere, and only then (`COVER_HOVER_ZOOM`). */
  zoomOnHover?: boolean;
}

/**
 * **A catalogue picture in its purpose's frame, cropped — the building block
 * under `ProductBanner` (3:2) and the Library's cover (16:9).** Surfaces paint
 * through those two, which fix the purpose for them; this is used directly
 * only where one surface shows entries of either purpose, as the image
 * catalogue does.
 *
 * The frame is fixed and the picture fills it (`object-cover`). `null` is the
 * no-image case, and it gets the NO IMAGE placeholder at the *same* ratio
 * rather than a shorter box — so a grid does not develop short cards, and a
 * page does not reflow around whether a picture exists yet.
 *
 * **The picture is decorative wherever this renders**, hence the empty `alt`:
 * every caller names the thing pictured in text beside or beneath the frame.
 *
 * **Through `next/image`'s optimizer, which is the point of there being one
 * component.** The stored file is a full-size master, and every browser used
 * to be handed it whole. The optimizer buys a per-viewport `srcset`, WebP
 * negotiated from the request's `Accept`, and the bytes served from our own
 * edge cache rather than metered Supabase egress. `next/image` renders
 * `blob:`/`data:` srcs and `.svg` paths unoptimized on its own — the preview
 * scenes' SVG fixtures and the picker's object-URL preview ride on that — so
 * there is no per-call-site opt-out here to get wrong.
 *
 * **`sizes` is a required decision, not a detail.** With `fill`, a missing
 * `sizes` makes the browser assume the image is the full viewport width and
 * pick the largest candidate, which hands back most of what the optimizer
 * saved. Every caller states the CSS width its frame actually resolves to.
 *
 * **Lazy by default, eager by request**, for a frame reliably above the fold.
 * Lazy or eager, the frame's size is fixed by its aspect ratio, so loading
 * order never moves layout.
 */
export function FramedImage({
  purpose,
  src,
  className,
  sizes = "100vw",
  eager = false,
  zoomOnHover = false,
}: FramedImageProps) {
  if (src === null) {
    return (
      <NoImagePlaceholder
        purpose={purpose}
        className={cn(FRAME[purpose], className)}
      />
    );
  }
  return (
    // `fill` needs a positioned ancestor, so the frame moves off the image and
    // onto a wrapper — which is also what carries the caller's corners, and
    // why the wrapper clips: an absolutely-positioned child ignores its
    // parent's border radius unless the parent hides its overflow.
    <div className={cn(FRAME[purpose], "relative overflow-hidden", className)}>
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={eager}
        className={cn("object-cover", zoomOnHover && COVER_HOVER_ZOOM)}
      />
    </div>
  );
}

// The placeholder for a picture that does not exist, and a customer should
// never meet it. It exists so a product or an article can be saved, and an
// article even published, before its picture exists: a customer seeing this is
// an admin's mistake, not a design.
//
// So it is machine text, in the machine face, and deliberately not a mark. It
// says NO IMAGE, in caps as furniture, so there is no reading of it in which it
// looks like something we chose to show — a wordmark here would be a fallback
// that passes for a visual, which is the failure that lets it survive on a live
// page.
//
// SVG so it scales pixel-cleanly from an admin row's ~80px through a full-width
// banner without container queries. Drawn in the frame's own proportions, so
// the aspect-ratio rule applies to the no-image case exactly as it does to a
// photo; the rect is sized in percentages and the text centred on them, so the
// placeholder stays centred and proportional at any width. The label is a
// little under 60% of the box's width: enough that it reads at an admin row's
// thumbnail size, and short of the edges, where a placeholder spanning the
// frame stops looking like a gap and starts looking like a design. Private, so
// the only way to paint it is as a frame's no-picture state.
function NoImagePlaceholder({
  purpose,
  className,
}: {
  purpose: CatalogueImagePurpose;
  className?: string;
}) {
  const box = PLACEHOLDER_BOX[purpose];
  return (
    <svg
      role="img"
      aria-hidden
      viewBox={`0 0 ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-full w-full", className)}
    >
      <rect width="100%" height="100%" className="fill-lifted" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={box.width * PLACEHOLDER_LABEL_SHARE}
        fontWeight="400"
        className="fill-act font-mono"
      >
        {NO_IMAGE_LABEL}
      </text>
    </svg>
  );
}

import { productImageUrl } from "@/lib/images/product-image-url";
import { cn } from "@/lib/utils";

interface ProductThumbnailProps {
  imagePath: string;
  alt: string;
  /** Tailwind size classes for the bounding box, e.g. "h-24 w-24". */
  size: string;
  className?: string;
}

/**
 * Square thumbnail for a self-hosted product image. Uses a plain <img> tag
 * because we don't run product images through next/image's optimizer, and
 * fighting next/image's "width/height modified" warning forces a choice
 * between letterboxing and cropping. Plain <img> with CSS sizing gives us
 * the original behaviour: image scaled down to fit inside the square box,
 * centered, with rounded corners on the visible image itself.
 *
 * Empty `imagePath` renders the SOG-branded fallback below. The admin
 * create form requires an image, but the DB doesn't enforce it, and
 * mock fixtures intentionally omit one — without a fallback, those
 * surfaces would render a broken-image icon.
 */
export function ProductThumbnail({
  imagePath,
  alt,
  size,
  className,
}: ProductThumbnailProps) {
  if (imagePath === "") {
    return (
      <div
        className={cn("flex shrink-0 items-center justify-center", size, className)}
        aria-label={alt}
      >
        <SogFallback className="aspect-square rounded-md" />
      </div>
    );
  }
  return (
    <div className={cn("flex shrink-0 items-center justify-center", size, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- product images bypass next/image; see component doc comment */}
      <img
        src={productImageUrl(imagePath)}
        alt={alt}
        className="h-auto w-auto max-h-full max-w-full rounded-md"
      />
    </div>
  );
}

// Neutral ground shown when a product is missing its image. Admin form
// requires one but the DB doesn't enforce it, and mocks intentionally
// omit one — without this, those surfaces render a broken-image icon.
// Real visitors should never see this; mocks always will until image
// fixtures land.
//
// Mirrors the OG image's wordmark choice: muted ground, yellow "SOG".
// SVG so it scales pixel-cleanly from browse-card 80–96px through
// detail-hero 96–140px without container queries.
//
// Exported because the shape is a caller's decision, not this file's: the
// square thumbnail here asks for a square, and the draft browse card's
// no-image banner asks for the same treatment at its image's 3:2 — same
// ground, same wordmark, so an imaged card and an un-imaged one are the same
// height on a grid. The variant picks the viewBox rather than the caller
// passing coordinates, because a caller has no business restating the
// wordmark's geometry; the rect and the text are sized in percentages, so the
// mark stays centred and proportional at either ratio.
const FALLBACK_VIEW_BOX = {
  square: "0 0 100 100",
  banner: "0 0 150 100",
} as const;

export function SogFallback({
  className,
  variant = "square",
}: {
  className?: string;
  variant?: keyof typeof FALLBACK_VIEW_BOX;
}) {
  return (
    <svg
      role="img"
      aria-hidden
      viewBox={FALLBACK_VIEW_BOX[variant]}
      preserveAspectRatio="xMidYMid meet"
      className={cn("h-full w-full", className)}
    >
      <rect width="100%" height="100%" className="fill-muted" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="36"
        fontWeight="900"
        letterSpacing="-2"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        className="fill-primary"
      >
        SOG
      </text>
    </svg>
  );
}

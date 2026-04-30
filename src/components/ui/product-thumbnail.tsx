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
        <SogFallback />
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

// Neutral square shown when a product is missing its image. Admin form
// requires one but the DB doesn't enforce it, and mocks intentionally
// omit one — without this, those surfaces render a broken-image icon.
// Real visitors should never see this; mocks always will until image
// fixtures land.
//
// Mirrors the OG image's wordmark choice: muted ground, yellow "SOG".
// SVG so it scales pixel-cleanly from browse-card 80–96px through
// detail-hero 96–140px without container queries.
function SogFallback() {
  return (
    <svg
      role="img"
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className="aspect-square h-full w-full rounded-md"
    >
      <rect width="100" height="100" className="fill-muted" />
      <text
        x="50"
        y="50"
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

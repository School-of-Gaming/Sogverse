import Image from "next/image";
import { isOptimizableImageSrc } from "@/lib/images/product-image-url";
import { cn } from "@/lib/utils";

/** The one frame every product picture is painted in. */
const BANNER_FRAME = "aspect-[3/2] w-full";

/**
 * **The 3:2 product picture, cropped — the only product-image presentation.**
 *
 * One stored file, one ratio, every surface — family-facing and admin alike:
 * the browse card's media block, the detail page's hero, the purchase
 * confirmation's summary row, the admin product list rows and the admin
 * product page all paint the product's picture through here. That universality
 * is an owner rule (2026-08-12), and the admin half of it is the half with the
 * reasoning worth keeping: the admin surfaces are how admins see and think
 * about products, so a thumb cropped differently from the shop has an admin
 * approving a picture families never meet. The frame is fixed and the picture
 * fills it (`object-cover`); the caller chooses only the box's *width* and its
 * corners, never its ratio — a surface free to pick its own ratio is a surface
 * where the same photo can be cropped two different ways.
 *
 * `src` is an **already-resolved URL**, not a storage path: resolution belongs
 * to the caller that holds the row, through `productImageSrc`, which owns the
 * empty-string-means-no-image rule. `null` is that no-image case, and it gets
 * the wordmark at the *same* ratio rather than a shorter box — so a grid does
 * not develop short cards, and a page does not reflow around whether a product
 * has a photo yet.
 *
 * **The picture is decorative wherever this renders**, hence the empty `alt`:
 * every call site names the product in text immediately beside or beneath the
 * frame (the card's title and its stretched link's accessible name, the detail
 * page's h1, the confirmation row's product name, the admin row's name cell),
 * so alt text would announce the same name twice to a screen reader for no
 * added meaning.
 *
 * **Through `next/image`'s optimizer, which is the point of this being one
 * component.** The stored file is an admin-uploaded original — a 2–4 MB PNG is
 * ordinary — and every browser used to be handed it whole, at every viewport,
 * straight out of the Supabase bucket. Routing it through the optimizer buys
 * three things at once: a per-viewport `srcset`, so a 96px admin row thumb
 * fetches a 96px-class file instead of the 4 MB master; AVIF/WebP negotiated
 * from the request's `Accept`, which is most of the remaining bytes; and the
 * bytes served from our own edge cache rather than metered Supabase egress.
 * Because there is exactly one frame, that switch is one change here instead
 * of five at the call sites.
 *
 * **`sizes` is a required decision, not a detail.** With `fill`, a missing
 * `sizes` makes the browser assume the image is the full viewport width and
 * pick the largest candidate — which hands back most of what the optimizer
 * just saved. Every caller states the CSS width its frame actually resolves
 * to; the `100vw` default is the safe-but-wasteful fallback, and a call site
 * relying on it is a call site that has not been measured yet.
 *
 * **Lazy by default, eager by request.** A storefront section trio can put
 * dozens of banners on one page, and fetching them all on first paint costs
 * the pages that can least afford it (family surfaces are mobile-first). So
 * the banner lazy-loads by default and the one caller whose banner is reliably
 * above the fold — the detail page's hero — opts into `eager`, which becomes
 * `priority` (preloaded, not lazy). Lazy or eager, the frame's size is fixed
 * by `aspect-[3/2]`, so loading order never moves layout.
 */
export function ProductBanner({
  src,
  className,
  sizes = "100vw",
  eager = false,
}: {
  /** Resolved image URL, or `null` for a product with no picture. */
  src: string | null;
  /** Width, corners and borders for the frame — never its aspect ratio. */
  className?: string;
  /** The CSS width this frame resolves to, per breakpoint, for the browser's
   *  `srcset` pick. Default `100vw` over-fetches — state the real width. */
  sizes?: string;
  /** Fetch on first paint. For banners reliably above the fold (the detail
   *  hero); everything else lazy-loads as it scrolls into reach. */
  eager?: boolean;
}) {
  if (src === null) {
    return <SogFallback className={cn(BANNER_FRAME, className)} />;
  }
  return (
    // `fill` needs a positioned ancestor, so the frame moves off the image and
    // onto a wrapper — which is also what now carries the caller's corners, and
    // why the wrapper clips: an absolutely-positioned child ignores its
    // parent's border radius unless the parent hides its overflow.
    <div className={cn(BANNER_FRAME, "relative overflow-hidden", className)}>
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        priority={eager}
        unoptimized={!isOptimizableImageSrc(src)}
        className="object-cover"
      />
    </div>
  );
}

// Neutral ground shown when a product is missing its image. The admin form
// requires one but the DB doesn't enforce it, and mock fixtures intentionally
// omit one — without a fallback, those surfaces would render a broken-image
// icon.
//
// Mirrors the OG image's wordmark choice: muted ground, yellow "SOG". SVG so
// it scales pixel-cleanly from an admin row's ~80px through a full-width card
// banner without container queries. One shape only, the banner's own 3:2 —
// the aspect-ratio rule above applies to the no-image case exactly as it does
// to a photo, which is what keeps an imaged card and an un-imaged one the
// same height on a grid. Private, so a caller cannot paint a product picture
// without going through the one frame the design language allows; the rect
// and the text are sized in percentages, so the mark stays centred and
// proportional at any width.
function SogFallback({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-hidden
      viewBox="0 0 150 100"
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

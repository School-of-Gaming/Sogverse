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
 * Square, letterboxed thumbnail for a self-hosted product image — **the admin
 * presentation**. Uses a plain <img> tag because we don't run product images
 * through next/image's optimizer, and fighting next/image's "width/height
 * modified" warning forces a choice between letterboxing and cropping. Plain
 * <img> with CSS sizing gives us the original behaviour: image scaled down to
 * fit inside the square box, centered, with rounded corners on the visible
 * image itself.
 *
 * **Family-facing surfaces use `ProductBanner` below instead**, which crops the
 * same file to the 3:2 frame the whole design language is built on. This one
 * survives on the admin product list and the admin product page on purpose: a
 * dense row wants a small square thumb that identifies a product at a glance,
 * and the admin panel is not the audience the 3:2 crop is for. Note that both
 * of those call sites override the letterboxed default below with a centred
 * square crop (`[&>img]:object-cover` via className) — acceptable there
 * because the thumb is a recognition cue, not an approval surface; the crop an
 * admin signs off for families is the upload preview's 3:2. The letterboxed
 * default remains for any caller that wants the whole file visible.
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

/** The one frame every family-facing product picture is painted in. */
const BANNER_FRAME = "aspect-[3/2] w-full";

/**
 * **The 3:2 product picture, cropped — the family-facing presentation.**
 *
 * One stored file, one ratio, every surface: the browse card's media block, the
 * detail page's hero, and the purchase confirmation's summary row all paint the
 * product's picture through here, so a parent meets the same crop of the same
 * image on the card, on the page it opens, and on the receipt after they pay.
 * The frame is fixed and the picture fills it (`object-cover`); the caller
 * chooses only the box's *width* and its corners, never its ratio — a surface
 * free to pick its own ratio is a surface where the same photo can be cropped
 * two different ways.
 *
 * `src` is an **already-resolved URL**, not a storage path: resolution belongs
 * to the adapter that holds the row, which is also where the truthiness check
 * lives that reads an empty `image_path` as no image at all. `null` is that
 * no-image case, and it gets the wordmark at the *same* ratio rather than a
 * shorter box — so a grid does not develop short cards, and a page does not
 * reflow around whether a product has a photo yet.
 *
 * **The picture is decorative wherever this renders**, hence the empty `alt`:
 * every call site names the product in text immediately beside or beneath the
 * frame (the card's title and its stretched link's accessible name, the detail
 * page's h1, the confirmation row's product name), so alt text would announce
 * the same name twice to a screen reader for no added meaning.
 *
 * Plain <img> for the same reason `ProductThumbnail` uses one: product images
 * bypass next/image's optimizer.
 *
 * **Lazy by default, eager by request.** These are admin-uploaded photos with
 * no optimizer in front of them, and a storefront section trio can put dozens
 * of banners on one page — fetching them all on first paint costs the pages
 * that can least afford it (family surfaces are mobile-first). So the banner
 * defaults to `loading="lazy" decoding="async"` and the one caller whose
 * banner is reliably above the fold — the detail page's hero — opts into
 * `eager`. Lazy or eager, the frame's size is fixed by `aspect-[3/2]`, so
 * loading order never moves layout.
 */
export function ProductBanner({
  src,
  className,
  eager = false,
}: {
  /** Resolved image URL, or `null` for a product with no picture. */
  src: string | null;
  /** Width, corners and borders for the frame — never its aspect ratio. */
  className?: string;
  /** Fetch on first paint. For banners reliably above the fold (the detail
   *  hero); everything else lazy-loads as it scrolls into reach. */
  eager?: boolean;
}) {
  if (src === null) {
    return <SogFallback variant="banner" className={cn(BANNER_FRAME, className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- product images bypass next/image; see the component doc above
    <img
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn(BANNER_FRAME, "object-cover", className)}
    />
  );
}

// Neutral ground shown when a product is missing its image. Admin form
// requires one but the DB doesn't enforce it, and mocks intentionally
// omit one — without this, those surfaces render a broken-image icon.
// Real visitors should never see this; mocks always will until image
// fixtures land.
//
// Mirrors the OG image's wordmark choice: muted ground, yellow "SOG".
// SVG so it scales pixel-cleanly from an admin row's 40–64px through a
// full-width card banner without container queries.
//
// Two shapes because the two presentations above ask for different ones — the
// square thumbnail wants a square, the banner wants the same treatment at 3:2,
// so that an imaged card and an un-imaged one are the same height on a grid.
// Both are in this file, which is why this is private: a caller outside it
// would be painting a product picture without going through one of the two
// frames the design language allows. The variant picks the viewBox rather than
// the caller passing coordinates, because a caller has no business restating
// the wordmark's geometry; the rect and the text are sized in percentages, so
// the mark stays centred and proportional at either ratio.
const FALLBACK_VIEW_BOX = {
  square: "0 0 100 100",
  banner: "0 0 150 100",
} as const;

function SogFallback({
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

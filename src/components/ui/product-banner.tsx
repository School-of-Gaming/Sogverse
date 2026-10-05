import { FramedImage } from "./framed-image";

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
 * approving a picture families never meet. The caller chooses only the box's
 * *width* and its corners, never its ratio — a surface free to pick its own
 * ratio is a surface where the same photo can be cropped two different ways.
 *
 * `src` is an **already-resolved URL**, not a storage path: resolution belongs
 * to the caller that holds the row, through `catalogueImageSrc`, which owns the
 * empty-string-means-no-image rule. `null` is that no-image case, and it gets
 * the NO IMAGE placeholder at the same ratio.
 *
 * The frame, the optimizer handling, the placeholder and the hover lean are
 * `FramedImage`'s, shared with the Library's 16:9 cover; what this component
 * adds is that the frame is always a product picture's, never the caller's to
 * choose.
 *
 * **Lazy by default, eager by request.** A storefront section trio can put
 * dozens of banners on one page, so the banner lazy-loads by default and the
 * one caller whose banner is reliably above the fold — the detail page's hero
 * — opts into `eager`.
 */
export function ProductBanner({
  src,
  className,
  sizes,
  eager,
  zoomOnHover,
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
  /** Lean the picture in when its card is pointed at — for a card that opens
   *  somewhere, and only then (`COVER_HOVER_ZOOM`). */
  zoomOnHover?: boolean;
}) {
  return (
    <FramedImage
      purpose="product"
      src={src}
      className={className}
      sizes={sizes}
      eager={eager}
      zoomOnHover={zoomOnHover}
    />
  );
}

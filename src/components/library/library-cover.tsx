import { FramedImage } from "@/components/ui/framed-image";

/**
 * **A Library article's cover, at 16:9 — the only cover presentation.** The
 * index card, the article page and the admin editor's picture field all paint
 * it through here, so an admin approves the crop a reader meets.
 *
 * `src` is an already-resolved URL, from `catalogueImageSrc` over the article's
 * derived cover path (covers are entries of the shared image catalogue). An
 * article may go live without a cover, and `null` then paints the same NO
 * IMAGE placeholder a product without a picture does, in this frame's ratio —
 * deliberately ugly, so nobody mistakes it for a design.
 *
 * Decorative wherever it renders: the article's title names it in text beside
 * the frame, so it carries no alt. The caller picks the width, the corners and
 * the border, never the ratio.
 */
export function LibraryCover({
  src,
  className,
  sizes,
  eager,
  zoomOnHover,
}: {
  /** Resolved image URL, or `null` for an article with no cover. */
  src: string | null;
  /** Width, corners and borders for the frame — never its aspect ratio. */
  className?: string;
  /** The CSS width this frame resolves to, per breakpoint. */
  sizes?: string;
  /** Fetch on first paint: the article page's cover, above the fold. */
  eager?: boolean;
  /** Lean the picture in when its card is pointed at (`COVER_HOVER_ZOOM`). */
  zoomOnHover?: boolean;
}) {
  return (
    <FramedImage
      purpose="library_cover"
      src={src}
      className={className}
      sizes={sizes}
      eager={eager}
      zoomOnHover={zoomOnHover}
    />
  );
}

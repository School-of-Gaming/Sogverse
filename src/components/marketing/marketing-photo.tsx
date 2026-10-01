import Image, { type StaticImageData } from "next/image";

interface MarketingPhotoProps {
  /** A still from `src/assets/marketing/`, statically imported. */
  image: StaticImageData;
  alt: string;
  /** Where and what the photo shows, when the copy beside it does not say. */
  caption?: string;
  /** The CSS width the photo resolves to, per breakpoint, for the `srcset`
   *  pick — state the real width; the default `100vw` over-fetches. */
  sizes: string;
  /** Width and placement only. */
  className?: string;
}

/**
 * **A photograph on a public page: the picture whole, in its own proportions,
 * framed by the card's edge and corners, with an optional caption.**
 *
 * Whole rather than cropped to a ratio, because each one was cleared for
 * publication as it is, and a crop is a new picture. Statically imported, so
 * the bundler hands `next/image` the intrinsic size: the `<img>` carries its
 * width and height, its box is reserved before a byte arrives, and nothing
 * beside it moves when it lands. Lazy, because none of these sits in a first
 * screen.
 */
export function MarketingPhoto({ image, alt, caption, sizes, className }: MarketingPhotoProps) {
  return (
    <figure className={className}>
      <Image
        src={image}
        alt={alt}
        sizes={sizes}
        className="h-auto w-full rounded-lg border border-border bg-card"
      />
      {caption && (
        <figcaption className="mt-2 text-sm text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}

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
 */
export function ProductThumbnail({
  imagePath,
  alt,
  size,
  className,
}: ProductThumbnailProps) {
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

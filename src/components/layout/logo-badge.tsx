import Image from "next/image";
import sogLogoSimple from "@/assets/brand/sog-logo-simple.svg";

/** The badge's true viewBox, handed to `next/image` so it reserves the right box. */
const LOGO_INTRINSIC = { width: 379, height: 207.5 } as const;

/**
 * The School of Gaming badge. `alt` is empty where a link around it carries the
 * accessible name. `className` sets its height, with `w-auto` keeping the ratio.
 */
export function LogoBadge({ alt = "", className }: { alt?: string; className: string }) {
  return (
    <Image
      src={sogLogoSimple}
      alt={alt}
      width={LOGO_INTRINSIC.width}
      height={LOGO_INTRINSIC.height}
      className={className}
      unoptimized
    />
  );
}

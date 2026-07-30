import Image from "next/image";
import { useTranslations } from "next-intl";
import lynxEducate from "@/assets/partners/lynx-educate-reversed.svg";
import robloxWordmark from "@/assets/partners/roblox-wordmark-white.svg";
import sogBadge from "@/assets/partners/sog-badge-yellow.svg";

/**
 * The three-way partnership lockup: School of Gaming x Lynx Educate x Roblox.
 *
 * Sits directly on the page background with no card behind it. Each mark is in
 * its dark-surface colourway — Roblox's own white wordmark, our yellow badge,
 * and a reversed Lynx mark (see src/assets/partners/README.md for why that one
 * is derived rather than supplied). An earlier version put the whole lockup on
 * a light plate to accommodate Lynx's black-only mark, which honoured every
 * guideline but looked like a foreign object pasted onto a dark page.
 *
 * Roblox's clearspace rule ("taglines or other visual elements must not
 * advance into the logo") is what the generous gaps are for, and their 20px
 * floor is why the smallest mark here is 24px tall.
 *
 * Every mark is sized with a literal width *and* height rather than
 * `w-auto`: until an SVG has loaded its intrinsic ratio is unknown, so an
 * auto-width mark starts at zero width and snaps wider on load, shoving its
 * neighbours sideways. Fixed boxes mean the row is laid out correctly on the
 * first paint. The numbers are each mark's own viewBox ratio (Lynx 1754x406,
 * Roblox 800x148, SOG 379x207.5) scaled to a chosen height, so nothing is
 * stretched. Heights differ per mark on purpose — the aspect ratios range from
 * 1.8:1 to 5.4:1, and matching heights would make the squat SOG badge tower
 * over the two wordmarks instead of reading as its equal.
 */
export function PartnerLockup() {
  const t = useTranslations("roblox.lockup");

  return (
    <div>
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("heading")}
      </p>
      {/* Wrap rather than scroll on narrow viewports — a lockup is a single
          visual statement, and horizontal scroll would hide a partner. */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16">
        {/* `unoptimized` on all three: the optimizer refuses SVG without
            `dangerouslyAllowSVG`, and these are trusted first-party bundled
            files that need no resizing pass anyway. */}
        <Image src={sogBadge} alt={t("sogAlt")} width={95} height={52} unoptimized />
        <Image src={lynxEducate} alt={t("lynxAlt")} width={121} height={28} unoptimized />
        <Image src={robloxWordmark} alt={t("robloxAlt")} width={130} height={24} unoptimized />
      </div>
    </div>
  );
}

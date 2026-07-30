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
 * Heights are set in CSS so they can step up on wider viewports, with the
 * `width`/`height` props left on each mark as its true viewBox size (Lynx
 * 1754x406, Roblox 800x148, SOG 379x207.5). Those props are what make `w-auto`
 * safe here: the browser derives an intrinsic aspect-ratio from them and
 * reserves the correct box before the file arrives, so nothing snaps wider on
 * load and shoves its neighbours sideways. Dropping them — or setting a width
 * that isn't the real ratio — is what would reintroduce that shift.
 *
 * Heights differ per mark on purpose. The aspect ratios span 1.8:1 to 5.4:1, so
 * matching heights would make the squat SOG badge tower over the two wordmarks
 * instead of reading as its equal.
 */
export function PartnerLockup() {
  const t = useTranslations("roblox.lockup");

  return (
    <div>
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground md:text-left">
        {t("heading")}
      </p>
      {/* Wrap rather than scroll on narrow viewports — a lockup is a single
          visual statement, and horizontal scroll would hide a partner. */}
      {/* Two arrangements, one component. On mobile the marks wrap into a
          centred row under the hero copy, which is the arrangement that reads
          best when they have the full page width to spread across. From `md`
          the hero becomes two columns and this moves into the narrow right
          one, where a left-aligned vertical stack is the only thing that fits
          without shrinking the marks. */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-10 sm:gap-x-16 md:flex-col md:items-start md:justify-start md:gap-y-8">
        {/* `unoptimized` on all three: the optimizer refuses SVG without
            `dangerouslyAllowSVG`, and these are trusted first-party bundled
            files that need no resizing pass anyway. */}
        <Image
          src={sogBadge}
          alt={t("sogAlt")}
          width={379}
          height={207.5}
          className="h-14 w-auto sm:h-20"
          unoptimized
        />
        <Image
          src={lynxEducate}
          alt={t("lynxAlt")}
          width={1754}
          height={406}
          className="h-8 w-auto sm:h-11"
          unoptimized
        />
        <Image
          src={robloxWordmark}
          alt={t("robloxAlt")}
          width={800}
          height={148}
          className="h-7 w-auto sm:h-9"
          unoptimized
        />
      </div>
    </div>
  );
}

import Image from "next/image";
import { useTranslations } from "next-intl";
import lynxEducate from "@/assets/partners/lynx-educate.svg";
import robloxWordmark from "@/assets/partners/roblox-wordmark-black.svg";
import sogBadge from "@/assets/partners/sog-badge-yellow.svg";

/**
 * The three-way partnership lockup: School of Gaming x Lynx Educate x Roblox.
 *
 * **Why this sits on an explicitly light plate** on our dark-default site: the
 * marks are supplied in fixed colourways we aren't free to alter, and two of
 * the three are dark-ink — a black Roblox wordmark and a black Lynx Educate
 * wordmark. Roblox's guidelines call for their black wordmark on a light
 * surface and forbid recolouring it, and Lynx ships no reversed variant at all,
 * so a light ground is the only treatment that keeps every mark legible and
 * every guideline honoured. The alternative — a dark band with one mark on its
 * own white chip — reads as demoting whichever partner gets the chip. See
 * src/assets/partners/README.md.
 *
 * Roblox's clearspace rule ("taglines or other visual elements must not
 * advance into the logo") is what the generous gaps and the plate's padding
 * are for, and their 20px floor is why the smallest mark here is 24px tall.
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
    <div className="rounded-xl border border-brand-plate-border bg-brand-plate px-6 py-8 sm:px-10">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand-plate-foreground/50">
        {t("heading")}
      </p>
      {/* Wrap rather than scroll on narrow viewports — a lockup is a single
          visual statement, and horizontal scroll would hide a partner. */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 sm:gap-x-14">
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

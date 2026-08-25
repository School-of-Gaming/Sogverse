"use client";

import { Sprout } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { newcomerPresence } from "./newcomer";

/**
 * The staff-only "new to this group" badge — a small pill beside a member's
 * name that fades out across their first month (see ./newcomer.ts for the
 * clock).
 *
 * It renders for Gedus and admins only, and that gate is *data*, not a viewer
 * prop: `joinedAt` comes from staff-scoped reads, so a surface a family sees
 * simply never has a value to pass. Rendering `null` past the window (or for
 * a `null` stamp) keeps every call site a bare one-liner.
 *
 * `now` is the caller's, not this component's: every surface that shows the
 * badge already carries a request-stable clock (a scene's frozen instant, the
 * feed's `feedNow`), and a badge reading its own `new Date()` would disagree
 * with the page around it and drift between SSR and hydration.
 *
 * The fade rides `style.opacity` on purpose — it is a continuous value from
 * arithmetic, which no finite set of Tailwind opacity classes can carry.
 */
export function NewcomerBadge({
  joinedAt,
  now,
  className,
}: {
  joinedAt: string | null | undefined;
  now: Date;
  className?: string;
}) {
  const t = useTranslations("memberFlair");
  const presence = newcomerPresence(joinedAt, now);
  if (presence === null) return null;

  return (
    <span
      style={{ opacity: presence.opacity }}
      title={t("newcomerTooltip", { days: presence.daysAgo })}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success/15 px-1.5 py-0 text-[10px] font-medium leading-4 text-success",
        className,
      )}
    >
      <Sprout className="h-3 w-3" aria-hidden />
      {t("newcomer")}
    </span>
  );
}

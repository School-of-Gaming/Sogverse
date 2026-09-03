"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { buildSubscribeLinks } from "@/lib/calendar-feed/subscribe-links";
import { CopyButton, SectionHeading } from "./shared";

/**
 * The three ways a calendar app takes a feed, and the way out for everything
 * else.
 *
 * Each button is an anchor wearing the button's classes, because every one of
 * them is a navigation: Apple's is a `webcal://` address the operating system
 * hands to a desktop client, and the other two are vendor screens that open
 * with the address already filled in. A `<button>` with an onClick that assigns
 * `location` would be the same navigation wearing the wrong element.
 *
 * The quiet "Using another calendar app?" beneath them is an escape hatch, not
 * the other half of a choice — so it is a plain `flex-col` with the link below
 * the row, which is where a reader expects a way out, and not the button row's
 * `flex-col-reverse`.
 */

interface SubscribeRowProps {
  /** The https feed address, or `null` while no source has resolved yet. */
  feedUrl: string | null;
  /** The calendar's name, which is the only one of the three Outlook needs. */
  calendarName: string;
}

export function SubscribeRow({ feedUrl, calendarName }: SubscribeRowProps) {
  const t = useTranslations("admin.testing.calendarFeed");
  const [showAddress, setShowAddress] = useState(false);

  const links =
    feedUrl === null ? null : buildSubscribeLinks(feedUrl, calendarName);

  /**
   * A disabled anchor is not a thing HTML has, so an unresolved source renders
   * the same box as a `<span>` with the disabled styling. The row is present
   * and at its final size from the first paint either way, so nothing below it
   * moves when a source resolves.
   */
  function subscribeLink(href: string | null, label: string, newTab: boolean) {
    const className = cn(
      buttonVariants({ variant: "outline" }),
      href === null && "pointer-events-none opacity-50",
    );
    if (href === null) {
      return (
        <span className={className} aria-disabled>
          {label}
        </span>
      );
    }
    // Apple's webcal link is handed to the operating system, so it stays in
    // this tab; the two vendor screens are somewhere else entirely and open in
    // one of their own.
    if (!newTab) {
      return (
        <a className={className} href={href}>
          {label}
        </a>
      );
    }
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {label}
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeading>{t("subscribeHeading")}</SectionHeading>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {subscribeLink(links?.webcal ?? null, t("appleCalendar"), false)}
          {subscribeLink(links?.google ?? null, t("googleCalendar"), true)}
          {subscribeLink(links?.outlook ?? null, t("outlook"), true)}
        </div>
        <button
          type="button"
          className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setShowAddress((shown) => !shown)}
        >
          {t("otherApp")}
        </button>
      </div>

      {showAddress && (
        <div className="space-y-2 rounded-md border border-border p-4">
          <Field label={t("webUrlLabel")} htmlFor="calendar-feed-https">
            <div className="flex items-center gap-2">
              <Input
                id="calendar-feed-https"
                readOnly
                value={feedUrl ?? ""}
                className="font-mono text-xs"
              />
              <CopyButton value={feedUrl ?? ""} />
            </div>
          </Field>
          <p className="text-sm text-muted-foreground">{t("otherAppHint")}</p>
        </div>
      )}
    </div>
  );
}

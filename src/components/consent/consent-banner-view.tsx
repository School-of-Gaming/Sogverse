"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import type { ConsentChoice } from "@/lib/consent";

/**
 * Where the strip is drawn.
 *
 * `fixed` is the real one: pinned to the bottom of the viewport, over whatever
 * is already painted. It overlays rather than inserts, so nothing on the page
 * moves when it appears or when it goes — which is the only way a banner that
 * arrives on the data's own schedule can satisfy the layout rule.
 *
 * `inline` exists so the style guide can render the same markup in the flow of
 * a section and iterate on it. It is the demo's placement and nothing else's.
 */
export type ConsentBannerPlacement = "fixed" | "inline";

interface ConsentBannerViewProps {
  onChoose: (choice: ConsentChoice) => void;
  placement?: ConsentBannerPlacement;
}

/**
 * The consent strip's presentation, with no idea where its answer goes.
 *
 * Deliberately not modal: no backdrop, no focus trap, no scroll lock. A
 * consent question is not a task the visitor came to do, and trapping them in
 * one before they have read a word of the page is a dark pattern in its own
 * right. It is a `region` with an accessible name so a screen-reader user can
 * jump to it and answer whenever they like.
 *
 * **All three buttons are the same variant and the same size.** Refusing has to
 * be exactly as easy and exactly as visible as accepting — that is the legal
 * requirement, not a matter of taste — so no button here is styled as the one
 * we would like pressed.
 */
export function ConsentBannerView({
  onChoose,
  placement = "fixed",
}: ConsentBannerViewProps) {
  const t = useTranslations("consent");
  // Set synchronously on the click, and never cleared: the fullest answer and
  // the emptiest both end this component's life — an upgrade unmounts the
  // banner in the same commit, a withdrawal reloads the document — so there is
  // no outcome that hands the buttons back to the reader. Clearing it on a
  // timer or in an effect would let a fast second click land on a strip whose
  // first answer is already in flight.
  const [committing, setCommitting] = useState(false);
  // Generated rather than a literal: the style guide renders a second copy of
  // this strip inline, and the real one is mounted globally, so a fixed id
  // would be duplicated on that page the moment the banner is reopened.
  const headingId = useId();

  function commit(choice: ConsentChoice) {
    setCommitting(true);
    onChoose(choice);
  }

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className={
        placement === "fixed"
          ? "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card shadow-lg"
          : "border border-border bg-card"
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="space-y-1 lg:flex-1">
          <h2
            id={headingId}
            className="text-sm font-semibold text-foreground"
          >
            {t("heading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          <Link
            href={ROUTES.privacy}
            prefetch={false}
            className="inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            {t("privacyLink")}
          </Link>
        </div>
        {/* `[negative, affirmative]` in the DOM, reversed in a stack: the
            fullest answer is last, so it is rightmost in the row and topmost on
            a phone. Identical variant and size across all three is what keeps
            "reversed" from meaning "preferred". */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={committing}
            onClick={() => commit("reject_all")}
          >
            {t("rejectAll")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={committing}
            onClick={() => commit("analytics_only")}
          >
            {t("analyticsOnly")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={committing}
            onClick={() => commit("analytics_and_marketing")}
          >
            {t("analyticsAndMarketing")}
          </Button>
        </div>
      </div>
    </div>
  );
}

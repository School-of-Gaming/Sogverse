"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { ROUTES } from "@/lib/constants";
import type { ConsentPurposes } from "@/lib/consent";

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
  onChoose: (purposes: ConsentPurposes) => void;
  /**
   * The answer already stored, which the customise panel's switches start
   * from — so reopening the strip to change one purpose does not silently
   * propose taking the other away. `null` for a visitor who has not answered,
   * whose switches all start off.
   */
  current?: ConsentPurposes | null;
  placement?: ConsentBannerPlacement;
}

const REJECT_ALL: ConsentPurposes = { analytics: false, marketing: false };
const ACCEPT_ALL: ConsentPurposes = { analytics: true, marketing: true };

/** The necessary row cannot be changed, so a change to it means nothing. */
function ignoreChange(): void {
  // Deliberately nothing: the row is disabled and always on.
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
 * **Two screens in one strip.** The first offers Reject all and Accept all,
 * with Customise beside them; Customise swaps the buttons for a panel in the
 * same strip — Necessary shown on and unchangeable, a switch each for
 * analytics and marketing, and Save choices, which stores exactly what the
 * switches say. The panel is not a second surface: the strip stays non-modal
 * and the heading and body stay above it.
 *
 * **Reject all and Accept all are the same variant and the same size.**
 * Refusing has to be exactly as easy and exactly as visible as accepting —
 * that is the legal requirement, not a matter of taste — so neither is styled
 * as the one we would like pressed. Customise is a quiet text control rather
 * than a third button: it answers nothing, it only opens the panel.
 *
 * **The body names no advertising platform, and that is a decision, not an
 * omission.** The advertising platform is identified in the privacy policy,
 * which is where recipients belong and which carries the last-updated date
 * that makes a change to the list visible. What forces a `CONSENT_VERSION`
 * bump is the question changing — a purpose added, withdrawn or widened — and
 * that rule is stated beside the constant.
 *
 * **One block, full width, actions underneath.** The copy reads across the
 * strip and the answers sit under it, right-aligned, which is the shortest the
 * strip can be. The panel makes it taller, so the fixed strip is capped at the
 * viewport's height and scrolls inside itself on a short phone.
 */
export function ConsentBannerView({
  onChoose,
  current = null,
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
  const [customising, setCustomising] = useState(false);
  // Seeded once, at mount: the strip unmounts whenever it closes, so a reopen
  // is a fresh mount and reads the answer stored by then.
  const [analytics, setAnalytics] = useState(current?.analytics ?? false);
  const [marketing, setMarketing] = useState(current?.marketing ?? false);
  // Generated rather than a literal: the style guide renders a second copy of
  // this strip inline, and the real one is mounted globally, so a fixed id
  // would be duplicated on that page the moment the banner is reopened.
  const headingId = useId();
  const firstSwitch = useRef<HTMLInputElement>(null);

  // Customise unmounts the control that was focused, which would drop focus to
  // the document. The first switch the reader can change is where they were
  // headed, so focus lands there.
  useEffect(() => {
    if (customising) firstSwitch.current?.focus();
  }, [customising]);

  function commit(purposes: ConsentPurposes) {
    setCommitting(true);
    onChoose(purposes);
  }

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className={
        placement === "fixed"
          ? "fixed inset-x-0 bottom-0 z-50 max-h-dvh overflow-y-auto overscroll-contain border-t border-border bg-card shadow-lg"
          : "border border-border bg-card"
      }
    >
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-3">
        <div className="space-y-1">
          <h2
            id={headingId}
            className="text-sm font-semibold text-foreground"
          >
            {t("heading")}
          </h2>
          {/* The policy link lives inside the sentence rather than on a row of
              its own: a link row is a second thing to read before answering,
              and the words that should carry the link are different words in
              every locale — so the translator places them. */}
          <p className="text-sm text-muted-foreground">
            {t.rich("body", {
              link: (chunks) => (
                <Link
                  href={ROUTES.privacy}
                  className="underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        {customising ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <CheckboxRow
                size="xs"
                checked
                disabled
                onCheckedChange={ignoreChange}
                title={t("purposes.necessary.title")}
                label={t("purposes.necessary.description")}
                trailing={
                  <span className="text-muted-foreground">
                    {t("alwaysOn")}
                  </span>
                }
              />
              <CheckboxRow
                ref={firstSwitch}
                size="xs"
                checked={analytics}
                disabled={committing}
                onCheckedChange={setAnalytics}
                title={t("purposes.analytics.title")}
                label={t("purposes.analytics.description")}
              />
              <CheckboxRow
                size="xs"
                checked={marketing}
                disabled={committing}
                onCheckedChange={setMarketing}
                title={t("purposes.marketing.title")}
                label={t("purposes.marketing.description")}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={committing}
                onClick={() => commit({ analytics, marketing })}
              >
                {t("saveChoices")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {/* `[negative, affirmative]` in the DOM, reversed in a stack: Accept
                all is last, so it is rightmost in the row and topmost on a
                phone. Identical variant and size across the pair is what keeps
                "reversed" from meaning "preferred". */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={committing}
                onClick={() => commit(REJECT_ALL)}
              >
                {t("rejectAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={committing}
                onClick={() => commit(ACCEPT_ALL)}
              >
                {t("acceptAll")}
              </Button>
            </div>
            {/* Not the third half of a pair, so outside the reversed group:
                under the pair in a stack, where a quiet way onward is
                expected, and at the strip's far left in a row, away from the
                answers so it never reads as a third one. Last in the DOM, so
                the stack needs no reversal; the row moves it with `order`. A
                button wearing the body link's styling, because it opens the
                panel here rather than navigating. */}
            <button
              type="button"
              disabled={committing}
              onClick={() => setCustomising(true)}
              className="h-9 px-1 text-xs sm:order-first sm:mr-auto text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {t("customise")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

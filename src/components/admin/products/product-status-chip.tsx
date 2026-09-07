"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EffectiveProductStatus } from "@/lib/products/effective-status";

/**
 * The one chip that says what state a product is in.
 *
 * Keyed by the effective status, exhaustively: the compiler is what guarantees
 * every member has a colour, so there is no fallback to reach for and no way to
 * add a status without being asked what it wears.
 *
 * This map existed twice — byte-identical, in the list row and on the details
 * page — which is the shape of duplication that gets fixed in one copy and not
 * the other. A product's state is one fact and it has one colour, so both
 * surfaces render this component now and a fifth status cannot arrive in one
 * place looking different from the other.
 *
 * **One shape for all five: a neutral edge, no fill, and the word in the
 * state's own colour.** The map used to say five things in three unrelated
 * languages — the call-to-action colour as a tint for `pending`, the same
 * colour as a fill for `running`, a grey for `completed` and `expired`, a
 * status hue for `cancelled` — and a chip that changes shape between states is
 * a chip a reader has to re-learn per row. Cancelled already had the shape the
 * other four have taken.
 *
 * **Act appears in no state, and that is the point of the rework.** A lifecycle
 * state is not the thing to do; spending the app's one *press this* colour on
 * "has not started yet" is the clearest case of that in the product, and a
 * table of thirty act chips teaches a reader that act means nothing.
 *
 * **The colour never carries the meaning alone.** The word is the state's name
 * and the hue reinforces it, which is what a coloured label is allowed to be —
 * a name, no verb, no sentence, on the neutral ground the chip's own edge
 * draws. Remove the colour and nothing is lost, which is why no glyph is
 * needed beside it.
 *
 * Per state: `running` is success, because it is the state where the thing is
 * working. `pending` is info — a fact an admin needs and did not ask for.
 * `warning` was the alternative and was not taken: "not started yet" is true
 * of every product before its first session, and a warning on all of them is
 * table noise rather than a nudge, which is the attention queue's job.
 * `completed` and `expired` spend no colour at all: they are the quiet end of
 * the lifecycle, and a green tick on every finished club would be the loudest
 * thing in a long list. `cancelled` keeps its red.
 */
const STATUS_STYLE: Record<EffectiveProductStatus, string> = {
  pending: "text-info",
  running: "text-success",
  completed: "text-muted-foreground",
  cancelled: "text-destructive",
  expired: "text-muted-foreground",
};

export function ProductStatusChip({
  status,
  className,
}: {
  status: EffectiveProductStatus;
  className?: string;
}) {
  const t = useTranslations("admin.products");

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

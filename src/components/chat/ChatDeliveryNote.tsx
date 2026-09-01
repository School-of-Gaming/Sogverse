"use client";

import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ChatDelivery } from "./types";

/**
 * Where a message is in its round trip, said under it — for the one state a
 * reader has to act on.
 *
 * **One component, because a picture's round trip is a message's round trip.**
 * The composer fans a burst out into one message per picture, so a staged photo
 * that never reached the server is a failed *message* and has to offer the same
 * "not sent — try again" a failed line of text does. Two spellings of that line
 * would be two places to change the copy and two chances for a reader to be told
 * something different about the same event.
 *
 * **`pending` takes no space, and that is a layout rule rather than a taste.**
 * A pending row is the same row as the settled one a moment later — the body
 * survives the reconciliation, and reconciliation happens on the *server's*
 * schedule, not the reader's — so the two have to occupy identical geometry or
 * everything below the bubble jumps the instant the acknowledgement lands. It
 * did: a "Sending" line in flow under every optimistic echo, gone the moment the
 * row settled, took a whole line out of the log under whatever the reader was
 * looking at. Reserving that line in *both* states is the other way to get it
 * wrong — a strip held open under every bubble in the log for a state almost no
 * message is ever in.
 *
 * So what the sender gets while a send is in flight is the dimming the bubble
 * already wears (`opacity-60`, which changes no geometry) plus the announcement
 * below, which is `sr-only` and therefore out of flow. That is also the
 * loading-affordance rule's own answer: a guarded RPC on an indexed write lands
 * in a frame or two, and a visible affordance for it is a flash on the fast
 * path.
 *
 * **`failed` is allowed to differ, and does.** It is not the ordinary path, the
 * retry has to be readable and clickable, and by the time it appears the reader
 * is being told something they have to answer — so it takes its line in flow.
 */
export function ChatDeliveryNote({
  delivery,
  onRetry,
  className,
}: {
  delivery: ChatDelivery;
  onRetry: () => void;
  className?: string;
}) {
  const t = useTranslations("chat.message");
  if (delivery === "sent") return null;

  // Out of flow, so a pending row and the settled row it becomes are the same
  // height to the pixel. No `className`: whatever a caller uses to line the
  // failed note up with the bubble above it has nothing to line up here.
  if (delivery === "pending") {
    return <span className="sr-only">{t("sending")}</span>;
  }

  return (
    <p
      className={cn(
        "mt-0.5 flex items-center gap-1 text-[11px] text-destructive",
        className,
      )}
    >
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
      <span>{t("failed")}</span>
      <button
        type="button"
        onClick={onRetry}
        className="font-medium underline underline-offset-2 hover:no-underline"
      >
        {t("retry")}
      </button>
    </p>
  );
}

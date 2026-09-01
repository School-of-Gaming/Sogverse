"use client";

import { AlertCircle, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ChatDelivery } from "./types";

/**
 * Where a message is in its round trip, said in words under it.
 *
 * **One component, because a picture's round trip is a message's round trip.**
 * The composer fans a burst out into one message per picture, so a staged photo
 * that never reached the server is a failed *message* and has to offer the same
 * "not sent — try again" a failed line of text does. Two spellings of that line
 * would be two places to change the copy and two chances for a reader to be told
 * something different about the same event.
 *
 * **Nothing at all on the ordinary path.** A row that reserved a strip for a
 * state almost no message is ever in would hold a gap open under every bubble
 * in the log for the sake of the rare one.
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

  const failed = delivery === "failed";
  return (
    <p
      className={cn(
        "mt-0.5 flex items-center gap-1 text-[11px]",
        failed ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {failed ? (
        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
      )}
      <span>{failed ? t("failed") : t("sending")}</span>
      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {t("retry")}
        </button>
      )}
    </p>
  );
}

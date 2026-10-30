"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { VoiceParticipant } from "../hooks/types";
import { isGedu } from "./use-room-stage";

/** A small avatar's steady outline, because it has no room for the shield. */
export const GEDU_AVATAR_OUTLINE = "border-success";

/** The role word for a screen reader, on a picture that shows it only in colour. */
export function GeduWord({ participant: p }: { participant: VoiceParticipant }) {
  const c = useTranslations("common");
  if (!isGedu(p)) return null;
  return (
    <span className="sr-only">{p.role === "admin" ? c("roleAdmin") : c("roleGedu")}</span>
  );
}

/**
 * The answer to "where is the Gedu?" on a stage tile: the certified Gedu's own
 * shield in the top left, on the lifted neutral with an edge in its hue, so it
 * holds over any identicon or video and spends no fill near a zone's glow. The
 * mic-off mark takes the top right and the name the bottom left.
 */
export function GeduMark({ participant }: { participant: VoiceParticipant }) {
  return <GeduBadge participant={participant} className="absolute left-1.5 top-1.5 h-6 w-6" />;
}

/** The same shield in a run of text, where the caller says how it sits. */
export function GeduBadge({
  participant: p,
  className,
}: {
  participant: VoiceParticipant;
  className: string;
}) {
  if (!isGedu(p)) return null;
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-md border border-success bg-lifted text-success",
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      <GeduWord participant={p} />
    </span>
  );
}

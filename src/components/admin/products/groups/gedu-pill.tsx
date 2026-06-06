"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";

interface GeduPillProps {
  geduId: string;
  firstName: string;
  email?: string | null;
  /** An add/remove for this Gedu is saving — greyed and the remove button is disabled. */
  isSaving?: boolean;
  onRemove?: () => void;
}

export function GeduPill({
  geduId,
  firstName,
  email,
  isSaving,
  onRemove,
}: GeduPillProps) {
  const t = useTranslations("admin.products.groupsPanel");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs transition-opacity",
        isSaving && "opacity-50",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <Identicon id={geduId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{firstName}</p>
        {email && (
          <p className="truncate text-[10px] text-muted-foreground">{email}</p>
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isSaving}
          aria-label={t("gedu.removeAria", { name: firstName })}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

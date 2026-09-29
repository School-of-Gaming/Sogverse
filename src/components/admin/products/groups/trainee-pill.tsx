"use client";

import { ArrowUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";

interface TraineePillProps {
  geduId: string;
  firstName: string;
  email?: string | null;
  /** An add, removal or promotion of this trainee is saving — greyed and inert. */
  isSaving?: boolean;
  /** The whole group is busy (rename/delete in flight) — inert, not greyed. */
  disabled?: boolean;
  /**
   * Make this trainee a `primary` Gedu of the same group. Passed only for a
   * certified educator: an assignment still requires certification, so an
   * uncertified trainee's pill carries no control that could make one.
   */
  onPromote?: () => void;
  onRemove?: () => void;
}

/**
 * One trainee seat: a gedu shadowing the group, drawn as a sibling of the Gedu
 * pill with the one thing a trainee does not have — a role — left out, because
 * a trainee is not paid.
 *
 * **It saves itself, like every control on this panel.** Promote is one write
 * that takes the trainee seat away and adds the assignment together, so the
 * gedu is never left holding neither seat, and the pill moves to the Gedus row
 * at once.
 *
 * The trailing controls are one right-packed group in a fixed order, promote
 * then remove, both decided by the snapshot the pill is drawn from — so nothing
 * here arrives late.
 */
export function TraineePill({
  geduId,
  firstName,
  email,
  isSaving,
  disabled,
  onPromote,
  onRemove,
}: TraineePillProps) {
  const t = useTranslations("admin.products.groupsPanel.trainee");
  const inert = isSaving || disabled;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-dashed border-border bg-card px-2.5 py-1.5 text-xs transition-opacity",
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
      {onPromote && (
        <button
          type="button"
          onClick={onPromote}
          disabled={inert}
          title={t("promoteAria", { name: firstName })}
          aria-label={t("promoteAria", { name: firstName })}
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[11px] transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
        >
          <ArrowUp className="h-3 w-3" aria-hidden />
          {t("promote")}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={inert}
          aria-label={t("removeAria", { name: firstName })}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

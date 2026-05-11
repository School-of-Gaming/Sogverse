"use client";

import { ArrowRight, Info, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import type { FamilyMember } from "@/services/family";
import { cn } from "@/lib/utils";

interface SelectParentToAddGamerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parents: FamilyMember[];
  /** Member currently being switched into, if any. Drives the row spinner. */
  committingTargetId: string | null;
  /** Called when the gamer picks a parent — selector kicks off the switch. */
  onPickParent: (parent: FamilyMember) => void;
}

/**
 * Shown when a gamer clicks "Add Gamer" from their own dashboard. Only
 * parents can create gamers, so we prompt the gamer to pick which parent
 * to switch into; the actual switch is performed by the selector (which
 * already owns the switch handler + state).
 */
export function SelectParentToAddGamerDialog({
  open,
  onOpenChange,
  parents,
  committingTargetId,
  onPickParent,
}: SelectParentToAddGamerDialogProps) {
  const t = useTranslations("family.selectParentToAddGamer");
  const c = useTranslations("common");

  if (!open) return null;

  const anyCommitting = committingTargetId !== null;

  return (
    <Dialog open onOpenChange={(next) => !anyCommitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-info" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {parents.map((parent) => {
            const isCommittingThis = committingTargetId === parent.id;
            return (
              <button
                key={parent.id}
                type="button"
                disabled={anyCommitting}
                onClick={() => onPickParent(parent)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors",
                  "hover:border-info hover:bg-info/10",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                  <Identicon id={parent.id} size={80} />
                </div>
                <span className="flex-1 text-sm font-medium">
                  {parent.first_name}
                </span>
                {isCommittingThis ? (
                  <Loader2 className="h-4 w-4 animate-spin text-info" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-info opacity-60 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={anyCommitting}
          >
            {c("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

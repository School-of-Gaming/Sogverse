"use client";

import { AccountSlot } from "@/components/layout/account-slot";
import { LocalePicker } from "@/components/layout/locale-picker";
import { cn } from "@/lib/cn";

/** The site header's own language picker and account slot, in the room's top bar. */
export function RoomAccount({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <LocalePicker />
      <AccountSlot />
    </div>
  );
}

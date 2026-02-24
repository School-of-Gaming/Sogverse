"use client";

import { useState } from "react";
import { Search, UserRound } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface GeduPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  gedus: Pick<Profile, "id" | "display_name" | "email">[];
  excludeIds?: string[];
  highlightId?: string;
  onSelect: (geduId: string, displayName: string) => void;
}

export function GeduPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  gedus,
  excludeIds,
  highlightId,
  onSelect,
}: GeduPickerDialogProps) {
  const [search, setSearch] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  const filtered = gedus.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.display_name.toLowerCase().includes(q) ||
      (g.email?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader onClose={() => handleOpenChange(false)}>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="border-b border-border px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 focus-visible:ring-border"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {search
              ? `${filtered.length} of ${gedus.length} gedus`
              : `${gedus.length} gedus`}
          </p>
        </div>

        <SheetBody>
          <div className="space-y-2">
            {filtered.map((g) => {
              const isCurrent = g.id === highlightId;
              const isAssigned = excludeIds?.includes(g.id) ?? false;
              const isDisabled = isCurrent || isAssigned;
              return (
                <button
                  key={g.id}
                  disabled={isDisabled}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors",
                    isDisabled
                      ? "cursor-default opacity-50"
                      : "hover:bg-accent",
                    isCurrent && "border-primary bg-primary/5",
                  )}
                  onClick={() => {
                    onSelect(g.id, g.display_name);
                    handleOpenChange(false);
                  }}
                >
                  <UserRound className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{g.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{g.email}</p>
                  </div>
                  {(isCurrent || isAssigned) && (
                    <Badge variant="outline" className="flex-shrink-0">
                      {isCurrent ? "Current" : "Assigned"}
                    </Badge>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {gedus.length === 0
                  ? "No gedus available."
                  : "No gedus match your search."}
              </p>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface GeduPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  gedus: Pick<Profile, "id" | "first_name" | "email">[];
  excludeIds?: string[];
  highlightId?: string;
  onSelect: (geduId: string, firstName: string) => void;
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
  const t = useTranslations("admin.groups");
  const gt = useTranslations("groups");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search input when the sheet opens (can't use autoFocus
  // because the Sheet always mounts its children, so it would steal
  // focus on page load)
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  const filtered = gedus.filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.first_name.toLowerCase().includes(q) ||
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
              ref={searchRef}
              placeholder={t("searchByNameOrEmail")}
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
                    onSelect(g.id, g.first_name);
                    handleOpenChange(false);
                  }}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <Identicon id={g.id} size={32} />
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{g.first_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{g.email}</p>
                  </div>
                  {(isCurrent || isAssigned) && (
                    <Badge variant="outline" className="flex-shrink-0">
                      {isCurrent ? gt("currentGedu") : gt("assignedGedu")}
                    </Badge>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("noGedusMatchSearch")}
              </p>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

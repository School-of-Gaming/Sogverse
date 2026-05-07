"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUsersByRole, useSpokenLanguages } from "@/services/users";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

interface GeduPickerSheetV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** IDs that should show the "already assigned" disabled state. */
  excludeIds?: string[];
  /** The id currently filling this slot — shown with a "current" badge. */
  highlightId?: string;
  onSelect: (gedu: Profile) => void;
}

export function GeduPickerSheetV2({
  open,
  onOpenChange,
  title,
  description,
  excludeIds,
  highlightId,
  onSelect,
}: GeduPickerSheetV2Props) {
  const t = useTranslations("admin.productsV2.geduPicker");
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: gedus } = useUsersByRole("gedu");
  const { data: spokenLanguages } = useSpokenLanguages();

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setLanguageFilter(null);
    }
    onOpenChange(next);
  };

  const filtered = useMemo(() => {
    if (!gedus) return [];
    const q = search.trim().toLowerCase();
    return gedus.filter((g) => {
      if (languageFilter && !g.spoken_languages.includes(languageFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        g.display_name.toLowerCase().includes(q) ||
        (g.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [gedus, search, languageFilter]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader onClose={() => handleOpenChange(false)}>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 border-b border-border px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 focus-visible:ring-border"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("speaks")}:</span>
            <button
              type="button"
              onClick={() => setLanguageFilter(null)}
              className={cn(
                "rounded-full border px-2 py-0.5 transition-colors",
                languageFilter === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:text-foreground"
              )}
            >
              {t("any")}
            </button>
            {spokenLanguages?.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() =>
                  setLanguageFilter((prev) =>
                    prev === lang.code ? null : lang.code
                  )
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 transition-colors",
                  languageFilter === lang.code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:text-foreground"
                )}
              >
                {lang.name}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {t("countSummary", {
              filtered: filtered.length,
              total: gedus?.length ?? 0,
            })}
          </p>
        </div>

        <SheetBody>
          <div className="space-y-2">
            {filtered.map((g) => {
              const isCurrent = g.id === highlightId;
              const isAssigned = excludeIds?.includes(g.id) ?? false;
              const isDisabled = isCurrent || isAssigned;
              return (
                <GeduRow
                  key={g.id}
                  gedu={g}
                  spokenLanguages={spokenLanguages ?? []}
                  isCurrent={isCurrent}
                  isAssigned={isAssigned}
                  isDisabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    onSelect(g);
                    handleOpenChange(false);
                  }}
                />
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("noResults")}
              </p>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface GeduRowProps {
  gedu: Profile;
  spokenLanguages: { code: string; name: string }[];
  isCurrent: boolean;
  isAssigned: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function GeduRow({
  gedu,
  spokenLanguages,
  isCurrent,
  isAssigned,
  isDisabled,
  onClick,
}: GeduRowProps) {
  const t = useTranslations("admin.productsV2.geduPicker");
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors",
        isDisabled ? "cursor-default opacity-60" : "hover:bg-accent",
        isCurrent && "border-primary bg-primary/5 opacity-100"
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        <Identicon id={gedu.id} size={36} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{gedu.display_name}</p>
          {isCurrent && (
            <Badge variant="outline" className="shrink-0">
              <Check className="mr-1 h-3 w-3" />
              {t("current")}
            </Badge>
          )}
          {isAssigned && !isCurrent && (
            <Badge variant="outline" className="shrink-0">
              {t("alreadyAssigned")}
            </Badge>
          )}
        </div>
        {gedu.email && (
          <p className="truncate text-xs text-muted-foreground">{gedu.email}</p>
        )}
        {gedu.spoken_languages.length > 0 && (
          <div className="mt-1.5 flex gap-1">
            {gedu.spoken_languages.map((code) => {
              const name =
                spokenLanguages.find((l) => l.code === code)?.name ?? code;
              return (
                <span
                  key={code}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </button>
  );
}

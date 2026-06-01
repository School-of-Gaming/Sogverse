"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useParentGamerLinks, useSearchUsers, useUsers } from "@/services/users";
import type { Profile } from "@/types";

interface GamerPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gamer IDs already enrolled on the product — their Add button is disabled. */
  enrolledGamerIds: Set<string>;
  /** Async add handler — sheet stays open while the mutation runs. */
  onAddGamer: (gamerId: string) => Promise<void>;
}

interface ParentBlock {
  parent: Profile;
  gamers: Profile[];
}

export function GamerPickerSheet({
  open,
  onOpenChange,
  enrolledGamerIds,
  onAddGamer,
}: GamerPickerSheetProps) {
  const t = useTranslations("admin.products.gamerPicker");
  const [search, setSearch] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Gamers added in the current session — shows the "Added" affordance even
  // before the parent's enrolledGamerIds prop refreshes from the server.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  // Per-gamer error so the admin sees why a single Add failed without losing
  // the rest of the in-progress batch.
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: allUsers, isLoading: isLoadingAll } = useUsers();
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(search);
  const { data: parentLinks } = useParentGamerLinks();

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setAddedIds(new Set());
      setErrorById({});
    }
    onOpenChange(next);
  };

  // Lookup tables built from the full user list so gamer nesting always works,
  // even when the search results only contain a gamer (we then surface the
  // gamer's parent block in the picker).
  const { allUsersById, parentToGamers, gamerToParentIds } = useMemo(() => {
    const byId = new Map<string, Profile>();
    const parentMap = new Map<string, Profile[]>();
    const gamerMap = new Map<string, string[]>();

    if (!allUsers) {
      return {
        allUsersById: byId,
        parentToGamers: parentMap,
        gamerToParentIds: gamerMap,
      };
    }
    for (const u of allUsers) byId.set(u.id, u);

    if (parentLinks) {
      for (const link of parentLinks) {
        const gamer = byId.get(link.gamer_id);
        if (!gamer) continue;
        const existing = parentMap.get(link.parent_id) ?? [];
        existing.push(gamer);
        parentMap.set(link.parent_id, existing);

        const parents = gamerMap.get(link.gamer_id) ?? [];
        parents.push(link.parent_id);
        gamerMap.set(link.gamer_id, parents);
      }
    }

    return {
      allUsersById: byId,
      parentToGamers: parentMap,
      gamerToParentIds: gamerMap,
    };
  }, [allUsers, parentLinks]);

  const isSearchActive = search.trim().length >= 2;
  const isLoading = isSearchActive ? isSearching : isLoadingAll;

  // Build the parent blocks to render. When searching, the base list is the
  // search hit set: matched customers stay; matched gamers pull in their
  // parents. When not searching, every customer with ≥1 linked gamer renders.
  const parentBlocks = useMemo<ParentBlock[]>(() => {
    const baseUsers = isSearchActive ? searchResults : allUsers;
    if (!baseUsers) return [];

    const seenParentIds = new Set<string>();
    const blocks: ParentBlock[] = [];

    const pushParent = (parent: Profile) => {
      if (seenParentIds.has(parent.id)) return;
      const gamers = parentToGamers.get(parent.id);
      if (!gamers || gamers.length === 0) return;
      seenParentIds.add(parent.id);
      blocks.push({ parent, gamers });
    };

    for (const user of baseUsers) {
      if (user.role === "customer") {
        pushParent(user);
      } else if (user.role === "gamer") {
        const parents = gamerToParentIds.get(user.id);
        if (!parents) continue;
        for (const parentId of parents) {
          const parent = allUsersById.get(parentId);
          if (parent) pushParent(parent);
        }
      }
    }

    return blocks;
  }, [
    isSearchActive,
    searchResults,
    allUsers,
    allUsersById,
    parentToGamers,
    gamerToParentIds,
  ]);

  const handleAdd = async (gamerId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(gamerId);
      return next;
    });
    setErrorById((prev) => {
      if (!(gamerId in prev)) return prev;
      const next = { ...prev };
      delete next[gamerId];
      return next;
    });
    try {
      await onAddGamer(gamerId);
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.add(gamerId);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("addFailed");
      setErrorById((prev) => ({ ...prev, [gamerId]: message }));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(gamerId);
        return next;
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader onClose={() => handleOpenChange(false)}>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-2 border-b border-border px-6 py-4">
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
          <p className="text-xs text-muted-foreground">{t("searchHint")}</p>
        </div>

        <SheetBody>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg border border-input bg-muted"
                />
              ))}
            </div>
          ) : parentBlocks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isSearchActive ? t("noSearchResults") : t("noParents")}
            </p>
          ) : (
            <div className="space-y-4">
              {parentBlocks.map(({ parent, gamers }) => (
                <ParentBlockRow
                  key={parent.id}
                  parent={parent}
                  gamers={gamers}
                  enrolledGamerIds={enrolledGamerIds}
                  addedIds={addedIds}
                  pendingIds={pendingIds}
                  errorById={errorById}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface ParentBlockRowProps {
  parent: Profile;
  gamers: Profile[];
  enrolledGamerIds: Set<string>;
  addedIds: Set<string>;
  pendingIds: Set<string>;
  errorById: Record<string, string>;
  onAdd: (gamerId: string) => void;
}

function ParentBlockRow({
  parent,
  gamers,
  enrolledGamerIds,
  addedIds,
  pendingIds,
  errorById,
  onAdd,
}: ParentBlockRowProps) {
  const t = useTranslations("admin.products.gamerPicker");
  const c = useTranslations("common");
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <Identicon id={parent.id} size={36} />
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {parent.first_name || parent.username || t("unnamedParent")}
            </p>
            {parent.email && (
              <p className="truncate text-xs text-muted-foreground">
                {parent.email}
              </p>
            )}
          </div>
        </div>
        <Badge className={cn(ROLE_BADGE_STYLES[parent.role], "shrink-0")}>
          {c(ROLE_LABEL_KEYS[parent.role])}
        </Badge>
      </div>

      <div className="border-t bg-muted/30">
        {gamers.map((gamer) => (
          <GamerPickerRow
            key={gamer.id}
            gamer={gamer}
            isEnrolled={enrolledGamerIds.has(gamer.id)}
            isAdded={addedIds.has(gamer.id)}
            isPending={pendingIds.has(gamer.id)}
            error={errorById[gamer.id]}
            onAdd={() => onAdd(gamer.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface GamerPickerRowProps {
  gamer: Profile;
  isEnrolled: boolean;
  isAdded: boolean;
  isPending: boolean;
  error: string | undefined;
  onAdd: () => void;
}

function GamerPickerRow({
  gamer,
  isEnrolled,
  isAdded,
  isPending,
  error,
  onAdd,
}: GamerPickerRowProps) {
  const t = useTranslations("admin.products.gamerPicker");

  const alreadyDone = isEnrolled || isAdded;
  const buttonLabel = isPending
    ? t("adding")
    : isAdded
      ? t("added")
      : isEnrolled
        ? t("alreadyAdded")
        : t("add");

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 pl-14 pr-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-7 w-7">
          <Identicon id={gamer.id} size={28} />
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {gamer.first_name || gamer.username || t("unnamedGamer")}
          </p>
          {error && (
            <p className="truncate text-xs text-destructive">{error}</p>
          )}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant={alreadyDone ? "outline" : "default"}
        disabled={alreadyDone || isPending}
        onClick={onAdd}
        className="shrink-0"
      >
        {isPending ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : alreadyDone ? (
          <Check className="mr-1 h-4 w-4" />
        ) : (
          <Plus className="mr-1 h-4 w-4" />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}

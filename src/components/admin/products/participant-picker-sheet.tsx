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

interface ParticipantPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Profile ids already enrolled on the product — their Add button is disabled. */
  enrolledParticipantIds: Set<string>;
  /** Async add handler — sheet stays open while the mutation runs. */
  onAddParticipant: (participantId: string) => Promise<void>;
}

interface FamilyBlock {
  parent: Profile;
  gamers: Profile[];
}

/**
 * The admin comp-enrollment picker: every family, with the parent as a header
 * row and their children nested under it.
 *
 * **The parent row is selectable, and a childless parent is still listed.**
 * Both were once true only of the children. A for-parents product needs a seat
 * given to the adult, and the family with no linked gamer is precisely the
 * family most likely to want one — a parent who signed up for a parents' event
 * and has never created a child account. Filtering them out (which this sheet
 * did until adults could hold seats) made those families unreachable from the
 * only surface that can comp a seat.
 *
 * **The product's audience is not consulted here, deliberately.** This sheet
 * does not know it, and the RPC behind the Add button refuses a wrong-audience
 * pick with a specific message that lands under the row that was clicked. One
 * authority for the rule, on the server, rather than a client copy that can
 * disagree with it — and the admin finds out by trying, which is one click, not
 * by the person they were looking for being invisible.
 */
export function ParticipantPickerSheet({
  open,
  onOpenChange,
  enrolledParticipantIds,
  onAddParticipant,
}: ParticipantPickerSheetProps) {
  const t = useTranslations("admin.products.participantPicker");
  // The capped-search notice is the same statement about the same query this
  // sheet already runs (the shared user search), so it reuses that string
  // rather than keeping a second copy of it in five locale files.
  const tUsers = useTranslations("admin.users");
  const [search, setSearch] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Participants added in the current session — shows the "Added" affordance
  // even before the parent's enrolledParticipantIds prop refreshes from the
  // server.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  // Per-person error so the admin sees why a single Add failed without losing
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
  // gamer's family block in the picker).
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

  // This sheet narrows the search hits harder than the admin users list does —
  // only customers and their linked gamers survive — so a capped page of 20 that
  // happens to contain none renders "no results" while hundreds matched. The cap
  // keeps the *newest* matches, so the family being looked for can be an old one
  // and reported as nonexistent. Hence the notice below is rendered in the empty
  // branch as much as beside results: empty is where the omission reads as an
  // answer.
  const cappedSearch =
    isSearchActive && !isLoading && searchResults && searchResults.total > searchResults.results.length
      ? { shown: searchResults.results.length, total: searchResults.total }
      : null;

  // Build the family blocks to render. When searching, the base list is the
  // search hit set: matched customers stay; matched gamers pull in their
  // parents. When not searching, every customer renders — including the ones
  // with no linked gamer, whose block is just the selectable parent row.
  const familyBlocks = useMemo<FamilyBlock[]>(() => {
    const baseUsers = isSearchActive ? searchResults?.results : allUsers;
    if (!baseUsers) return [];

    const seenParentIds = new Set<string>();
    const blocks: FamilyBlock[] = [];

    const pushParent = (parent: Profile) => {
      if (seenParentIds.has(parent.id)) return;
      seenParentIds.add(parent.id);
      blocks.push({ parent, gamers: parentToGamers.get(parent.id) ?? [] });
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

  const handleAdd = async (participantId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(participantId);
      return next;
    });
    setErrorById((prev) => {
      if (!(participantId in prev)) return prev;
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
    try {
      await onAddParticipant(participantId);
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.add(participantId);
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("addFailed");
      setErrorById((prev) => ({ ...prev, [participantId]: message }));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(participantId);
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
          ) : (
            <>
              {familyBlocks.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isSearchActive ? t("noSearchResults") : t("noParents")}
                </p>
              ) : (
                <div className="space-y-4">
                  {familyBlocks.map(({ parent, gamers }) => (
                    <FamilyBlockRow
                      key={parent.id}
                      parent={parent}
                      gamers={gamers}
                      enrolledParticipantIds={enrolledParticipantIds}
                      addedIds={addedIds}
                      pendingIds={pendingIds}
                      errorById={errorById}
                      onAdd={handleAdd}
                    />
                  ))}
                </div>
              )}
              {cappedSearch && (
                <p className="pt-4 text-center text-xs text-muted-foreground">
                  {tUsers("searchCapped", cappedSearch)}
                </p>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface FamilyBlockRowProps {
  parent: Profile;
  gamers: Profile[];
  enrolledParticipantIds: Set<string>;
  addedIds: Set<string>;
  pendingIds: Set<string>;
  errorById: Record<string, string>;
  onAdd: (participantId: string) => void;
}

/**
 * One family: the parent as the block header, their children nested beneath.
 *
 * The parent header carries its own Add button now, in the same column as the
 * children's, so "who is this seat for" is one list of buttons down the right
 * edge rather than a header that looks like a label and rows that look like
 * choices. The role badge stays where it was — it is what tells the two kinds
 * of row apart at a glance, and it was already there.
 */
function FamilyBlockRow({
  parent,
  gamers,
  enrolledParticipantIds,
  addedIds,
  pendingIds,
  errorById,
  onAdd,
}: FamilyBlockRowProps) {
  const t = useTranslations("admin.products.participantPicker");
  const c = useTranslations("common");
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <Identicon id={parent.id} size={36} />
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {parent.first_name || t("unnamedParent")}
            </p>
            {parent.email && (
              <p className="truncate text-xs text-muted-foreground">
                {parent.email}
              </p>
            )}
            {errorById[parent.id] && (
              <p className="text-xs text-destructive">{errorById[parent.id]}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={cn(ROLE_BADGE_STYLES[parent.role], "shrink-0")}>
            {c(ROLE_LABEL_KEYS[parent.role])}
          </Badge>
          <AddButton
            isEnrolled={enrolledParticipantIds.has(parent.id)}
            isAdded={addedIds.has(parent.id)}
            isPending={pendingIds.has(parent.id)}
            onAdd={() => onAdd(parent.id)}
          />
        </div>
      </div>

      {gamers.length > 0 && (
        <div className="border-t bg-muted/30">
          {gamers.map((gamer) => (
            <GamerPickerRow
              key={gamer.id}
              gamer={gamer}
              isEnrolled={enrolledParticipantIds.has(gamer.id)}
              isAdded={addedIds.has(gamer.id)}
              isPending={pendingIds.has(gamer.id)}
              error={errorById[gamer.id]}
              onAdd={() => onAdd(gamer.id)}
            />
          ))}
        </div>
      )}
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
  const t = useTranslations("admin.products.participantPicker");

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 pl-14 pr-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-7 w-7">
          <Identicon id={gamer.id} size={28} />
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {gamer.first_name || t("unnamedGamer")}
          </p>
          {error && (
            <p className="truncate text-xs text-destructive">{error}</p>
          )}
        </div>
      </div>
      <AddButton
        isEnrolled={isEnrolled}
        isAdded={isAdded}
        isPending={isPending}
        onAdd={onAdd}
      />
    </div>
  );
}

/**
 * The one Add affordance, shared by the parent header and the child rows so the
 * two cannot drift into two spellings of the same four states.
 */
function AddButton({
  isEnrolled,
  isAdded,
  isPending,
  onAdd,
}: {
  isEnrolled: boolean;
  isAdded: boolean;
  isPending: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations("admin.products.participantPicker");

  const alreadyDone = isEnrolled || isAdded;
  const buttonLabel = isPending
    ? t("adding")
    : isAdded
      ? t("added")
      : isEnrolled
        ? t("alreadyAdded")
        : t("add");

  return (
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
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, Search } from "lucide-react";
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
import {
  audienceAdmitsRole,
  type ProductAudience,
} from "@/lib/products/product-audience";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useScrollSentinel } from "@/hooks/use-scroll-sentinel";
import {
  useUserList,
  type UserListEntry,
  type UserListGamer,
} from "@/services/users";
import type { UserRole } from "@/types";

/**
 * How far below the last family counts as reached. Shorter than the page's own
 * margin because a sheet is a narrow column: one screenful of rows is a much
 * smaller scroll distance here than on the users page.
 */
const SENTINEL_ROOT_MARGIN = "400px 0px";

interface ParticipantPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Who the product may seat. Decides which rows carry an Add button at all —
   * see the note on the component below.
   */
  audience: ProductAudience;
  /** Profile ids already enrolled on the product — their Add button is disabled. */
  enrolledParticipantIds: Set<string>;
  /** Async add handler — sheet stays open while the mutation runs. */
  onAddParticipant: (participantId: string) => Promise<void>;
}

/**
 * The admin comp-enrollment picker: families newest first, with the parent as a
 * header row and their children nested under it.
 *
 * **One page of families at a time, searched server-side.** A page is a
 * screenful and grows as the admin scrolls into it; the box asks the database,
 * against a blob carrying every string a whole family can be found by. That is
 * what makes a hit on a child's *name* — or on their Minecraft handle, or on a
 * phone number typed the way a person writes it — surface the family the child
 * is inside, without this component nesting or hoisting anything: the children
 * arrive already inside their family's row.
 *
 * **The sheet is mounted from the panel's first render and reads nothing until
 * it has been opened once.** Staying mounted is what lets it animate in and
 * out; the latch below is what stops a product page nobody clicked from
 * fetching a page of accounts.
 *
 * **The parent row is selectable, and a childless parent is still listed.**
 * Both were once true only of the children. A for-parents product needs a seat
 * given to the adult, and the family with no linked gamer is precisely the
 * family most likely to want one — a parent who signed up for a parents' event
 * and has never created a child account. The read asks for the customer role,
 * so such a family is a row like any other rather than something the browser
 * has to remember to keep.
 *
 * **The product's audience withholds the Add button, and nothing else.**
 * Someone the audience cannot seat still has their row — the family block, the
 * parent header, every child under it — they are simply offered no action, so
 * the sheet never hides the person an admin came here to find. Nothing says why
 * in words: the shape states itself in aggregate, since parents and children
 * both addable is a family product, children alone a gamers' one, and parents
 * alone a product for adults.
 *
 * This is an affordance, not the enforcement. The RPC refuses a wrong-audience
 * pick independently and remains the one authority on the rule; the per-row
 * error below still carries every other refusal it can raise — already
 * enrolled, seat rules, a race — and only the audience case stops arriving
 * there. Deciding it in the browser at all is sound for the reason the sibling
 * gedu picker's certification gate is: only admins open either sheet, and an
 * admin is trusted to act through the admin UI.
 *
 * **That sibling settled the copy question the other way, and the divergence is
 * deliberate rather than overlooked.** Its unpickable rows say why — a
 * "Not verified" badge beside the name — where these say nothing, and the two
 * sheets open from the same panel minutes apart. The case for the badge there
 * is that uncertified is a *fixable state of that person*, so naming it tells
 * an admin what to go and do. An audience is a settled property of the product
 * they are already looking at, so the same sentence would explain a thing
 * nobody is currently deciding. If an admin ever reads a buttonless list as a
 * broken render rather than as a rule, this is the decision to revisit, and the
 * badge beside it is the shape to copy.
 */
export function ParticipantPickerSheet({
  open,
  onOpenChange,
  audience,
  enrolledParticipantIds,
  onAddParticipant,
}: ParticipantPickerSheetProps) {
  const t = useTranslations("admin.products.participantPicker");
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
  const bodyRef = useRef<HTMLDivElement>(null);

  // The open transition does what unmounting used to: a reopened sheet is a
  // fresh one. It fires on the false → true edge rather than on close, because
  // resetting on close would rewrite the list underneath the sheet while its
  // exit animation is still playing. And it adjusts state *during* the render
  // that sees the new prop, React's own shape for derived-from-props state — an
  // effect doing the same would paint the stale search for a frame first.
  //
  // The same transition latches `hasOpened`, which is what lets the read stay
  // unfired until an admin actually asks for it: the sheet is in the tree from
  // the groups panel's first render, and reading a page of accounts for a
  // product page nobody opened a picker on is a cost with no reader. The latch
  // never clears, so closing and reopening keeps the families already in hand.
  const [wasOpen, setWasOpen] = useState(open);
  const [hasOpened, setHasOpened] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setHasOpened(true);
      setSearch("");
      setAddedIds(new Set());
      setErrorById({});
    }
  }

  const list = useUserList(
    { search, role: "customer", spokenLanguage: null },
    { enabled: hasOpened },
  );

  const families = useMemo(
    () => list.data?.pages.flatMap((page) => page.rows) ?? [],
    [list.data],
  );

  // The sheet body is the scroller, not the page — the document's scroll is
  // held while a sheet is open — so the sentinel is judged against that box.
  // `isPlaceholderData` is part of the gate because the cursor those pages
  // yield belongs to the needle they answered, not the one now in the box.
  const sentinelRef = useScrollSentinel({
    enabled:
      list.hasNextPage && !list.isFetchingNextPage && !list.isPlaceholderData,
    onReach: () => {
      void list.fetchNextPage();
    },
    rootMargin: SENTINEL_ROOT_MARGIN,
    root: bodyRef,
  });

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
  }, [open]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader onClose={() => onOpenChange(false)}>
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

        <SheetBody ref={bodyRef}>
          {/* A keyset page of 25 off an indexed view lands in a frame or two,
              so nothing stands in for it: no skeleton, no spinner. What must
              not appear meanwhile is either empty line — both are claims about
              who exists, and nobody has been asked yet. */}
          {families.length > 0 ? (
            <div className="space-y-4">
              {families.map((family) => (
                <FamilyBlockRow
                  key={family.id}
                  parent={family}
                  gamers={family.linked_gamers}
                  audience={audience}
                  enrolledParticipantIds={enrolledParticipantIds}
                  addedIds={addedIds}
                  pendingIds={pendingIds}
                  errorById={errorById}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          ) : list.isPending ? null : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search.trim().length > 0 ? t("noSearchResults") : t("noParents")}
            </p>
          )}
          {/* Below every family, so a revealed page appends into the body's
              own slack and nothing already read moves. */}
          {list.hasNextPage && (
            <div ref={sentinelRef} aria-hidden className="h-px" />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

interface FamilyBlockRowProps {
  parent: UserListEntry;
  gamers: UserListGamer[];
  audience: ProductAudience;
  enrolledParticipantIds: Set<string>;
  addedIds: Set<string>;
  pendingIds: Set<string>;
  errorById: Record<string, string>;
  onAdd: (participantId: string) => void;
}

/**
 * Whether a row renders its button at all, which is a different question from
 * whether that button is enabled.
 *
 * The audience decides what to *offer*. But this button is also the sheet's
 * only sign that someone already holds a seat, and a product's audience can be
 * narrowed after seats were given out — `update_product` assigns both columns
 * on every save and nothing guards existing participations. So an
 * already-enrolled person keeps their button, disabled and reading "Added",
 * even once the audience would no longer admit them. Withholding it there would
 * not withdraw an offer; it would hide a fact, and leave a seated person
 * indistinguishable from an unseated one on the only surface that lists both.
 *
 * Asked of the row's own `role` rather than of where it sits in the block: the
 * header is the person the family is keyed on and the nested rows are their
 * linked children, but nothing here has to trust that, and the seat rule is
 * stated about roles. Taking the two fields it reads rather than a whole row is
 * what lets one function answer for a family header and an embedded child
 * alike, which are two different shapes carrying the same two facts.
 */
function showsAddButton(
  person: { id: string; role: UserRole },
  audience: ProductAudience,
  enrolledParticipantIds: Set<string>,
  addedIds: Set<string>,
): boolean {
  return (
    audienceAdmitsRole(audience, person.role) ||
    enrolledParticipantIds.has(person.id) ||
    addedIds.has(person.id)
  );
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
  audience,
  enrolledParticipantIds,
  addedIds,
  pendingIds,
  errorById,
  onAdd,
}: FamilyBlockRowProps) {
  const t = useTranslations("admin.products.participantPicker");
  const c = useTranslations("common");
  return (
    <div className="rounded-lg border border-border">
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
              <p className="flex items-center gap-1.5 text-xs text-foreground">
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0 text-destructive"
                  aria-hidden
                />
                <span className="truncate">{errorById[parent.id]}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn(ROLE_BADGE_STYLES[parent.role], "shrink-0")}>
            {c(ROLE_LABEL_KEYS[parent.role])}
          </Badge>
          {showsAddButton(parent, audience, enrolledParticipantIds, addedIds) && (
            <AddButton
              isEnrolled={enrolledParticipantIds.has(parent.id)}
              isAdded={addedIds.has(parent.id)}
              isPending={pendingIds.has(parent.id)}
              onAdd={() => onAdd(parent.id)}
            />
          )}
        </div>
      </div>

      {gamers.length > 0 && (
        <div className="border-t border-border">
          {gamers.map((gamer) => (
            <GamerPickerRow
              key={gamer.id}
              gamer={gamer}
              showsButton={showsAddButton(
                gamer,
                audience,
                enrolledParticipantIds,
                addedIds,
              )}
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
  gamer: UserListGamer;
  /** See `showsAddButton` — false renders no button at all, not a disabled one. */
  showsButton: boolean;
  isEnrolled: boolean;
  isAdded: boolean;
  isPending: boolean;
  error: string | undefined;
  onAdd: () => void;
}

function GamerPickerRow({
  gamer,
  showsButton,
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
            <p className="flex items-center gap-1.5 text-xs text-foreground">
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 text-destructive"
                aria-hidden
              />
              <span className="truncate">{error}</span>
            </p>
          )}
        </div>
      </div>
      {showsButton && (
        <AddButton
          isEnrolled={isEnrolled}
          isAdded={isAdded}
          isPending={isPending}
          onAdd={onAdd}
        />
      )}
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

"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { UsersService, type UserListFilters } from "./users.service";
import { minecraftKeys } from "@/services/minecraft/minecraft.queries";
import { robloxKeys } from "@/services/roblox/roblox.queries";
import { ADMIN_PEOPLE_LIST_PAGE_SIZE } from "@/lib/constants/admin-people-lists";
import { nextKeysetCursor, type KeysetCursor } from "@/lib/supabase/keyset";
import {
  USER_LIST_SEARCH_MIN_QUERY,
  type AdminGameAccountBody,
} from "./users.contracts";
import type { ProfileUpdate, UserRole } from "@/types";

/**
 * The people cache's key hierarchy.
 *
 * Exported because the two gedu standing writes invalidate `lists()` from their
 * own service now: certification and the criminal record check are columns of a
 * list row, so an admin's verdict on one educator changes what these lists
 * render. A key factory is the only honest way to say that — the alternative is
 * a literal `["users", "list"]` in another file, which drifts the first time
 * this one is reshaped.
 */
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  // Every argument that changes the answer is in the key, and nothing else:
  // React Query hashes the object deterministically, so two callers asking the
  // same question share one cache entry however they spelled it.
  // `withTotal` is one of them: a page read without its total holds `null`
  // where the counting surface expects a number, so the two must not share an
  // entry — otherwise whichever surface asked first decides what the other sees.
  list: (filters: UserListFilters, withTotal: boolean) =>
    [...userKeys.lists(), filters, { withTotal }] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  byRole: (role: UserRole) => [...userKeys.all, "role", role] as const,
};

export function useProfile(userId: string) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => service.getProfile(userId),
    enabled: !!userId,
  });
}

/**
 * The admin people list, one keyset page at a time.
 *
 * **Infinite rather than plain, and the same hook for all three surfaces** —
 * the users page, the participant picker and the gedu picker. Each shows the
 * newest page and grows as the reader scrolls into it, so the payload is
 * proportional to the screen rather than to the table; pages accumulate rather
 * than replace, so a revealed page appends *below* rows already painted and
 * nothing on screen moves.
 *
 * **`enabled` is what keeps an always-mounted sheet from reading.** Both picker
 * sheets are in the tree from the panel's first render, closed, so they can
 * animate open — and a sheet nobody has opened has no reader for a page of
 * people. The sheets latch "has been opened" and pass it here.
 *
 * **`keepPreviousData` is a layout decision, not a nicety.** A keystroke
 * changes the query key, so without it the list empties and refills on every
 * character: the rows a reader is looking at vanish, the "nothing matches" line
 * asserts itself before any answer exists, and the row they were reaching for
 * comes back at a different offset. Holding the previous page keeps whatever
 * survives the narrowing exactly where it was — which is what the layout rule
 * actually asks — and keeps the empty state from being claimed and then
 * contradicted a round trip later. The price is that what is on screen can be
 * one needle behind, which `isPlaceholderData` reports; a surface asking for
 * the *next* page must consult it, because the cursor on screen belongs to the
 * previous question.
 */
export function useUserList(
  filters: UserListFilters,
  options?: { enabled?: boolean; withTotal?: boolean },
) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  // Off unless a surface renders the number. An exact count of a *search* is a
  // second pass over the whole table evaluating the family blob for every row,
  // which is the expensive half of the read — so it is paid only where a count
  // line exists to show it.
  const withTotal = options?.withTotal ?? false;

  // Normalised once and used for the key *and* the read, so "ada" and "ada "
  // cannot become two cache entries answering the same question. A needle below
  // the search floor normalises to empty for the same reason: the read ignores
  // it and answers with the plain newest page, so keyed on its own it would be
  // a second request for a page already in the cache.
  const trimmed = filters.search.trim();
  const normalized: UserListFilters = {
    search: trimmed.length < USER_LIST_SEARCH_MIN_QUERY ? "" : trimmed,
    role: filters.role,
    spokenLanguage: filters.spokenLanguage,
  };

  // The page param is the keyset cursor, absent on the first page. Both the
  // initial value and the query function's parameter are annotated: React
  // Query infers the param type from several sites at once, and an
  // `undefined` literal on its own narrows it to `undefined` — which then
  // rejects the very cursor `getNextPageParam` hands back.
  const firstPage: KeysetCursor | undefined = undefined;

  return useInfiniteQuery({
    queryKey: userKeys.list(normalized, withTotal),
    queryFn: ({ pageParam }: { pageParam: KeysetCursor | undefined }) =>
      service.getUserListPage(normalized, { cursor: pageParam, withTotal }),
    initialPageParam: firstPage,
    // The keyset module owns what "there is more" means — a page shorter than
    // it asked for is the end of the list — so the page size here and the one
    // the read sends have to be the same constant or the question is answered
    // wrongly in both directions.
    getNextPageParam: (lastPage) =>
      nextKeysetCursor(lastPage.rows, ADMIN_PEOPLE_LIST_PAGE_SIZE),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useUsersByRole(role: UserRole) {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useQuery({
    queryKey: userKeys.byRole(role),
    queryFn: () => service.getUsersByRole(role),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: ProfileUpdate }) =>
      service.updateProfile(userId, updates),
    onSuccess: (data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * An admin editing another account's game username.
 *
 * Invalidates the **stored-row** branch of whichever platform was written —
 * not the platform root: that also holds the resolved pictures, which cost
 * upstream requests against a shared per-IP budget and did not change because a
 * name did. The account query underneath the admin page's rows is what
 * refetches, which is what feeds the row its new props.
 *
 * **And the people lists, because a game handle is one of the strings a family
 * is findable by.** The list's search runs against a blob the view folds each
 * platform's username into, so an admin who corrects a handle and then searches
 * for it must find the family. Nothing holding such a list is mounted while
 * this runs — the write happens on the user-detail page — so the invalidation
 * costs a stale mark rather than a refetch, and the list reloads correct the
 * next time it is opened.
 */
export function useUpdateUserGameAccount() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: ({
      userId,
      edit,
    }: {
      userId: string;
      edit: AdminGameAccountBody;
    }) => service.updateUserGameAccount(userId, edit),
    onSuccess: (_result, { userId, edit }) => {
      if (edit.platform === "minecraft") {
        queryClient.invalidateQueries({
          queryKey: minecraftKeys.account(userId),
        });
      } else {
        queryClient.invalidateQueries({ queryKey: robloxKeys.account(userId) });
      }
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

/**
 * Send the signed-in user a verification link for their own address.
 *
 * **Nothing is invalidated on success, and that is not an omission.** Sending
 * the mail changes no state this client has read: `email_verified_at` is stamped
 * later, when somebody opens their inbox and follows the link, on a page load
 * that rebuilds the cache from scratch. Refetching the profile here would only
 * confirm what is already on screen.
 *
 * The mutation resolves to a `VerificationEmailSendOutcome`, so `onSuccess`
 * still has to read which of the two happened: being turned away by the per-hour
 * limit is a success as far as the request went, and a different sentence as far
 * as the person is concerned.
 */
export function useSendVerificationEmail() {
  const supabase = getClient();
  const service = new UsersService(supabase);

  return useMutation({
    mutationFn: () => service.sendVerificationEmail(),
  });
}

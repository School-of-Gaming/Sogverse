"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { robloxRenderUrl } from "@/lib/roblox";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import type { GameFigure } from "@/lib/constants/game-platforms";
import type { RobloxAccount } from "@/types";
import { RobloxService } from "./roblox.service";
import type {
  RobloxProfileResponse,
  RobloxRenderMap,
  RobloxRenderUrls,
} from "./roblox.contracts";

/**
 * Three branches under one root, and the split is load-bearing.
 *
 * `accounts` holds what we have **stored** — rows out of `roblox_accounts`,
 * cheap indexed reads by primary key. `profiles` holds a **name** resolved at
 * capture time, three upstream calls deep. `renders` holds the pictures for an
 * **id** we already stored, which is the cheap two-call path and the one every
 * page load uses.
 *
 * A save invalidates `accounts` and never the root, precisely because the root
 * would drag every mounted lookup into a refetch and spend a budget of sixty
 * requests a minute — shared by every IP the serverless fleet has — to re-learn
 * answers nothing changed. Lookups are keyed by the **lowercased** username: the
 * Roblox lookup is case-insensitive, so `Builderman` and `builderman` are the
 * same account and must not occupy two cache entries. Renders are keyed by the
 * numeric id, which has no such ambiguity.
 */
export const robloxKeys = {
  all: ["roblox"] as const,
  profiles: () => [...robloxKeys.all, "profile"] as const,
  profile: (username: string) =>
    [...robloxKeys.profiles(), username.toLowerCase()] as const,
  accounts: () => [...robloxKeys.all, "account"] as const,
  myAccount: () => [...robloxKeys.accounts(), "me"] as const,
  account: (userId: string) => [...robloxKeys.accounts(), userId] as const,
  renders: () => [...robloxKeys.all, "render"] as const,
  // Keyed by figure as well as id: a cache entry holds the figure that was
  // asked for and nothing else, so a surface drawing a headshot must not read
  // an entry resolved for the full figure and find a null it would misread as
  // "no picture".
  render: (robloxUserId: number, figure: GameFigure) =>
    [...robloxKeys.renders(), robloxUserId, figure] as const,
  // One entry for one *batch*, and the id list is normalized into it — deduped
  // and numerically sorted — so the key names the SET of accounts asked about
  // rather than the order a roster happened to hand them over in. Two renders
  // of the same list in a different order are one cache entry and one request.
  // The `"batch"` segment keeps it clear of the single-id keys above, whose
  // second element is a number.
  renderBatch: (robloxUserIds: readonly number[], figure: GameFigure) =>
    [
      ...robloxKeys.renders(),
      "batch",
      figure,
      normalizeRobloxIds(robloxUserIds).join(","),
    ] as const,
};

/** Deduped, numerically sorted — the canonical form of a batch's id list. */
function normalizeRobloxIds(robloxUserIds: readonly number[]): number[] {
  return [...new Set(robloxUserIds)].sort((a, b) => a - b);
}

/**
 * A render URL stays good for as long as anyone is looking at the page.
 *
 * The JSON naming it is `no-cache` upstream, but the URL it hands back addresses
 * an immutable image — it only changes when the person redesigns their avatar,
 * which is not something a page open in another tab needs to notice. So this is
 * resolved once per id per session and never re-fetched, which is the difference
 * between one request and one per remount on a page an admin clicks through.
 */
const RENDER_STALE_TIME = Infinity;

/**
 * The caller's own saved handle. A keyed read of one row by primary key — it
 * lands in a frame or two, so there is no loading affordance to design.
 */
export function useMyRobloxAccount() {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.myAccount(),
    queryFn: () => service.getMyRobloxAccount(),
  });
}

/**
 * Somebody else's saved handle — a parent reading their own child's row, or an
 * admin reading anyone's. Seed `initialData` from a server fetch where the page
 * already has the row, so it paints complete on the first frame.
 */
export function useRobloxAccount(
  userId: string,
  options?: { initialData?: RobloxAccount | null },
) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.account(userId),
    queryFn: () => service.getRobloxAccount(userId),
    enabled: !!userId,
    initialData: options?.initialData,
  });
}

/**
 * The renders for one **stored, verified** account, drawn on page load.
 *
 * Takes the numeric id rather than the handle, and that is the whole design: an
 * account we saved carries the id, so the name→id hop is not just avoidable but
 * meaningless — the id is the fact and the name is only its label. `null`
 * disables the query, which is what an *unverified* row passes, because a handle
 * nobody confirmed has no id and resolving the name instead could draw whichever
 * stranger happens to own it. The silhouette is the correct picture there.
 *
 * **Never retried.** A picture is decoration; a failed fetch degrades to the
 * silhouette and the person still sees the name and the tick. Retrying would
 * spend three more requests against the exact per-IP bucket this path exists to
 * conserve, to redraw something nobody is waiting on.
 *
 * **Singular on purpose, and a list must not map it over rows.** The upstream
 * cost is per request, not per id, so N rows calling this is N requests against
 * that bucket — the failure mode the batch route was built to avoid. A roster
 * collects its ids and asks the service for all of them at once.
 */
export function useRobloxRender(
  robloxUserId: number | null,
  figure: GameFigure = "full",
) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  // The URL for the figure asked for, not the whole set: the other field would
  // be `null` because it was never requested, and a call site reading it would
  // take that for "Roblox has no picture".
  return useQuery<string | null>({
    queryKey: robloxKeys.render(robloxUserId ?? 0, figure),
    queryFn: async () => {
      if (robloxUserId === null) return null;
      const renders = await service.resolveRenders([robloxUserId], [figure]);
      const resolved = renders[String(robloxUserId)];
      return resolved === undefined ? null : robloxRenderUrl(resolved, figure);
    },
    enabled: robloxUserId !== null,
    staleTime: RENDER_STALE_TIME,
    retry: false,
  });
}

/**
 * The renders for **every stored, verified account on a page**, in one request
 * — for a list that is resolved once and then stops changing.
 *
 * This is the shape a list must use, and `useRobloxRender` is the shape a
 * single identity may use: the upstream cost is per *request*, not per id, so
 * mapping the singular hook over N rows is N requests against a 60-per-minute
 * bucket the whole serverless fleet shares — which one roster can drain on its
 * own. A caller collects the ids of its verified rows, asks once, and hands
 * each row the URL it gets back.
 *
 * **Keyed by the whole id set, so a changed set is a different question and is
 * asked from scratch.** That is the right trade for a snapshot — an admin's
 * groups panel, a gedu's roster — where the ids arrive with the page and the
 * only thing that reorders them is a caller handing them over differently,
 * which the normalized key already collapses to one entry. It is the wrong
 * trade for a list whose membership moves while the page is open: each change
 * would discard the answer and re-ask about everyone, so a room filling one
 * person at a time costs a request per join *for the whole room*. A live list
 * uses `useLiveRobloxRenders` instead.
 *
 * **Answers are matched by the id the response names, never by position.** The
 * result is a record keyed by the account id as a string, built by looking each
 * asked-for id up in the response — the endpoint promises no order, and reading
 * positionally would hand one child another child's face, which is the one
 * failure worse than no picture. The response names *every* id it was asked
 * about, so an entry present with a `null` URL means "asked, and Roblox has no
 * render" — draw the silhouette. An entry that is missing entirely means the
 * answer is not in yet.
 *
 * **Never retried, never persisted, resolved once per session.** A thumbnail is
 * decoration: a failed fetch degrades to the silhouette, and a retry would
 * spend more of the shared budget redrawing something nobody is waiting on. The
 * URL addresses an immutable image, so `staleTime` is infinite — but the JSON
 * naming it is `no-cache` upstream, so it is session-lived and never a column.
 *
 * **The batch has a ceiling: `ROBLOX_THUMBNAIL_BATCH_MAX` ids per request.** The
 * route refuses a longer list outright rather than truncating it, because a
 * half-answered roster is worse than a clean failure — the missing rows are
 * indistinguishable from accounts with no avatar. This hook passes on what it
 * is given and does not chunk: no surface we have comes close to the ceiling,
 * and a page that one day does needs to decide deliberately how to split the
 * work rather than inherit a silent policy from here.
 *
 * An empty list makes no request at all — there is nothing to ask about, and
 * `enabled: false` is cheaper than a round trip that answers `{}`.
 */
export function useRobloxRenders(
  robloxUserIds: readonly number[],
  figure: GameFigure = "full",
) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  const ids = normalizeRobloxIds(robloxUserIds);

  return useQuery<RobloxRenderMap>({
    queryKey: robloxKeys.renderBatch(ids, figure),
    queryFn: () =>
      service.resolveRenders(ids, [figure]).then(urlsFor(ids, figure)),
    enabled: ids.length > 0,
    staleTime: RENDER_STALE_TIME,
    retry: false,
  });
}

/**
 * Turn a batch's answer into the map a surface reads: **built by asking the
 * response about each id we sent**, so an id the response somehow omitted lands
 * as `null` — the silhouette — rather than as somebody else's picture.
 */
function urlsFor(ids: readonly number[], figure: GameFigure) {
  return (renders: Partial<Record<string, RobloxRenderUrls>>) => {
    const urls: Record<string, string | null> = {};
    for (const id of ids) {
      const resolved = renders[String(id)];
      urls[String(id)] =
        resolved === undefined ? null : robloxRenderUrl(resolved, figure);
    }
    return urls;
  };
}

/**
 * The renders for a list whose **membership changes while the page is open** —
 * a voice room filling up, which is the only such list we have.
 *
 * `useRobloxRenders` is keyed by its whole id set, and that is exactly wrong
 * here: a join changes the set, so the cached answer is discarded and everyone
 * is re-asked about. Joining a ten-person room one person at a time costs
 * 1+2+…+10 upstream thumbnail calls against a bucket of sixty a minute that the
 * whole serverless fleet shares — a single busy session draining a budget the
 * by-id path exists to conserve.
 *
 * So this hook accumulates instead of re-asking. It keeps an ever-seen set of
 * ids beside a resolved map, and each time the membership changes it asks about
 * the difference — **once, for the whole batch of newcomers, and never again
 * about anyone already asked after.** A change that brings no new verified
 * account (somebody left, somebody with no linked handle arrived) issues no
 * request at all. There is still no per-row hook anywhere in the shape: the
 * request count is one per *change that brings new people*, not one per person.
 *
 * **An id is marked seen before its request goes out, not after.** That is what
 * makes a second join ask only about the newcomer while the first request is
 * still in flight, and it is also what makes React's development-mode double
 * invocation of the effect issue one request rather than two.
 *
 * **Answers are matched by the id the response names, never by position** — the
 * endpoint promises no order, and a positional read hands one child another
 * child's face. Because every id is asked about exactly once, no two responses
 * can name the same id, so responses landing out of order merge cleanly and the
 * map never fights itself.
 *
 * **Never retried, never persisted, resolved once per id per session.** A batch
 * that fails settles its ids as `null` — the silhouette — and they are not asked
 * about again: a thumbnail is decoration, and a retry spends more of the shared
 * budget redrawing something nobody is waiting on. The map lives in component
 * state rather than the query cache, so it is session-lived by construction and
 * has no route into anything persisted.
 *
 * `figure` is fixed at a call site; passing a different one re-asks about
 * everybody under the new figure, because a render only answers for the figure
 * it was requested with.
 */
export function useLiveRobloxRenders(
  robloxUserIds: readonly number[],
  figure: GameFigure = "full",
): RobloxRenderMap {
  const supabase = getClient();

  const [renders, setRenders] = useState<RobloxRenderMap>({});
  const askedRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  // Set in the body rather than initialised once, because React's development
  // double-invocation runs this effect's cleanup and then its setup again — a
  // ref that only ever moved to `false` would stay there for the real mount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The set as one primitive, so the effect below re-runs when the membership
  // really changed and not merely because a parent handed over an equal array.
  const idList = normalizeRobloxIds(robloxUserIds).join(",");

  useEffect(() => {
    const ids = idList === "" ? [] : idList.split(",").map(Number);
    const unseen = ids.filter((id) => !askedRef.current.has(`${figure}:${id}`));
    if (unseen.length === 0) return;

    for (const id of unseen) askedRef.current.add(`${figure}:${id}`);

    const service = new RobloxService(supabase);
    void service
      .resolveRenders(unseen, [figure])
      .then(urlsFor(unseen, figure))
      // A failed batch is an answer of "no picture" for the ids it asked about,
      // settled rather than left pending: the rows are already drawing the
      // silhouette and nothing is waiting on this.
      .catch(() => Object.fromEntries(unseen.map((id) => [String(id), null])))
      .then((urls: Record<string, string | null>) => {
        if (!mountedRef.current) return;
        setRenders((previous) => ({ ...previous, ...urls }));
      });
  }, [idList, figure, supabase]);

  return renders;
}

/**
 * Pull: resolve a username we already hold — a saved handle whose avatar a
 * surface wants to draw without anyone pressing a button. Two external hops
 * behind one route, so it is a real network call, not a cached read.
 */
export function useRobloxProfile(username: string | null) {
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useQuery({
    queryKey: robloxKeys.profile(username ?? ""),
    queryFn: () => service.verifyRobloxUsername(username ?? ""),
    enabled: !!username,
  });
}

/**
 * Push: verify a username the user has just typed.
 *
 * The success path **seeds** the profile cache rather than invalidating it. The
 * usual rule — a mutation invalidates what it changed — assumes the mutation
 * left a fresher truth on the server that the cache now has to go and re-read.
 * Nothing is written here (the lookup persists nothing), and the response *is*
 * the authoritative answer, so re-fetching it would be a second round trip for
 * a value already in hand.
 */
export function useVerifyRoblox() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useMutation({
    mutationFn: (username: string) => service.verifyRobloxUsername(username),
    onSuccess: (profile: RobloxProfileResponse, username: string) => {
      queryClient.setQueryData(robloxKeys.profile(username), profile);
      // Roblox hands back the canonical casing, which may differ from what was
      // typed. Both spellings normalize to the same key, so this is a no-op
      // unless the canonical name differs by more than case.
      queryClient.setQueryData(robloxKeys.profile(profile.username), profile);
    },
  });
}

/**
 * A gedu editing a group member's handle.
 *
 * `groupId` is not sent to the server — the RPC re-derives what the caller may
 * touch from their own assignments — it is here purely so the invalidation can
 * name the one feed whose roster row just changed.
 *
 * **Two keys, and neither of them is the platform's root.** The workspace's
 * roster comes from the feed document, so that is what has to refetch for the
 * row to show its new state; the stored-account entry for that one gamer is the
 * other thing this write really changed. Invalidating `robloxKeys.all` — or
 * even `renders()` — would drag every mounted render lookup into a refetch to
 * re-learn an answer the save did not touch, spending a per-IP budget the whole
 * fleet shares. The refreshed roster carries the new id, and the batch keyed by
 * that id list resolves it on its own.
 */
export function useUpdateGroupMemberRoblox(groupId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useMutation({
    mutationFn: (vars: { gamerId: string; robloxUsername: string | null }) =>
      service.updateGroupMemberRoblox(vars.gamerId, vars.robloxUsername),
    onSuccess: (_result, vars) => {
      queryClient.invalidateQueries({ queryKey: geduSessionKeys.feed(groupId) });
      queryClient.invalidateQueries({
        queryKey: robloxKeys.account(vars.gamerId),
      });
    },
  });
}

/**
 * Save the caller's own handle, or clear it with `null`.
 *
 * Invalidates the stored-account branch and nothing else — the row really did
 * change, and the lookup branch did not.
 */
export function useUpdateMyRoblox() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new RobloxService(supabase);

  return useMutation({
    mutationFn: (robloxUsername: string | null) =>
      service.updateMyRoblox(robloxUsername),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: robloxKeys.accounts() });
    },
  });
}

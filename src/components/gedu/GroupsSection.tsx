"use client";

import {
  useMyAssignedSessions,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import { GroupsSectionView } from "./GroupsSectionView";

/**
 * Data-bound Sessions section for the gedu dashboard. Calls
 * `useMyAssignedSessions` (which owns the expansion + `useNow()` tick)
 * and hands the resulting time-sorted list to the presentational
 * `GroupsSectionView`. Mirrors the parent's `SessionsSection`.
 *
 * The query lives here and nowhere below, which is what lets the view be
 * rendered from fixtures in a preview scene without a network call.
 *
 * `initialRows` is the server-prefetched payload from `gedu/page.tsx`
 * so the section paints with real data on first frame, no skeleton flash.
 */
export function GroupsSection({
  initialRows,
}: {
  initialRows: MyAssignedProductSessionRow[];
}) {
  const items = useMyAssignedSessions({ initialData: initialRows });
  return <GroupsSectionView items={items} />;
}

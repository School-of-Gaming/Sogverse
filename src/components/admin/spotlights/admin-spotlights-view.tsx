"use client";

import {
  useAdminSpotlights,
  useDeleteSpotlight,
  useSetSpotlightEnabled,
} from "@/services/spotlights";
import { AdminSpotlightsPage } from "./admin-spotlights-page";

/** The live data shell for `/admin/spotlights`: one read and the list's two writes, into the body beside it. */
export function AdminSpotlightsView() {
  const { data, status } = useAdminSpotlights();
  const setEnabled = useSetSpotlightEnabled();
  const deleteSpotlight = useDeleteSpotlight();

  return (
    <AdminSpotlightsPage
      spotlights={data ?? []}
      status={status}
      actions={{
        // Each mutation resolves once the list has been read again, so the
        // row already shows the new state when its control comes back.
        setEnabled: async (id, enabled) => {
          await setEnabled.mutateAsync({ id, enabled });
        },
        remove: (id) => deleteSpotlight.mutateAsync(id),
      }}
    />
  );
}

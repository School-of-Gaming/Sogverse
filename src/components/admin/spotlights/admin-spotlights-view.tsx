"use client";

import {
  useAdminSpotlights,
  useDeleteSpotlight,
} from "@/services/spotlights/spotlights.queries";
import { AdminSpotlightsPage } from "./admin-spotlights-page";

/** The live data shell for `/admin/spotlights`: one read and the list's one write, into the body beside it. */
export function AdminSpotlightsView() {
  const { data, status } = useAdminSpotlights();
  const deleteSpotlight = useDeleteSpotlight();

  return (
    <AdminSpotlightsPage
      spotlights={data ?? []}
      status={status}
      actions={{
        // Resolves once the list has been read again, so the dialog closes
        // onto a list without the row.
        remove: (id) => deleteSpotlight.mutateAsync(id),
      }}
    />
  );
}

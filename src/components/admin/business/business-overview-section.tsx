import "server-only";

import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { wireErrorMessage } from "@/lib/api/wire-error-message";
import { createClient } from "@/lib/supabase/server";
import { AdminBusinessService } from "@/services/admin-business/admin-business.service";
import type { BusinessOverview } from "@/services/admin-business/admin-business.build";
import { BusinessOverviewView } from "./business-view";

/** The read, or the reason it did not happen. Never both, never neither. */
type OverviewResult =
  | { ok: true; overview: BusinessOverview }
  | { ok: false; reason: string | null };

async function loadOverview(now: Date): Promise<OverviewResult> {
  // Outside the `try` on purpose. Building the server client reads cookies, and
  // in the App Router a dynamic-render signal travels as a thrown control-flow
  // object — caught here it would be reported to the admin as a failed read and
  // silently break the render it was steering.
  const supabase = await createClient();
  const service = new AdminBusinessService(supabase);

  try {
    return { ok: true, overview: await service.getOverview(now) };
  } catch (error) {
    return { ok: false, reason: wireErrorMessage(error) };
  }
}

/**
 * **The whole overview, awaited on the server under the route's `<Suspense>`.**
 * It walks every family's seats and payments and reads a year of both
 * invoicing documents, so it is a perceptibly slow read: the route draws the
 * title at once and this section's skeleton beside it, and the figures stream
 * in when the read lands. Nothing on the page refetches it, so it never
 * reaches the browser's query cache.
 *
 * **A failure is carried, not flattened.** Every figure comes out of this one
 * read, so there is no partial page to fall back to; an empty one would say
 * the business took nothing, which is the one wrong answer this page must
 * never give. The failure renders in its place, with the message off the wire
 * when there is one — including the municipality invoicing page's own refusal,
 * which names the club an admin has to fix.
 */
export async function BusinessOverviewSection({ now }: { now: Date }) {
  const result = await loadOverview(now);
  if (result.ok) return <BusinessOverviewView overview={result.overview} />;

  const t = await getTranslations("admin.business");
  return (
    // The reason is a message off the wire, never translated copy — it is
    // spliced into a sentence that is, which is why there are two keys.
    <Alert variant="destructive">
      <AlertDescription>
        {result.reason === null
          ? t("loadError")
          : t("loadErrorWithReason", { reason: result.reason })}
      </AlertDescription>
    </Alert>
  );
}

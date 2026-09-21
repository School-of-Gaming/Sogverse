import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AdminSubstitutionsPage } from "@/components/admin/substitutions/AdminSubstitutionsPage";
import { createClient } from "@/lib/supabase/server";
import {
  SessionSubstitutionService,
  sessionSubstitutionKeys,
  type AdminSubstitutionQueue,
} from "@/services/session-substitution";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminSubstitutions") };
}

/** The read, or the reason it did not happen. Never both, never neither. */
type QueueResult =
  | { ok: true; queue: AdminSubstitutionQueue }
  | { ok: false; reason: string | null };

/**
 * The whole page, awaited here rather than asked for from the browser.
 *
 * One admin-wide read that the page cannot render a single row without, which
 * makes it exactly the read worth moving to the server. The RPC is guard-first
 * on `assert_admin()`, so calling it with the admin's own server-side session
 * is the same call the browser was making — one network hop earlier, against a
 * client that already holds the session cookie.
 *
 * **A failure is carried, not flattened.** Both lists come out of this one
 * document, so there is no partial page to fall back to: an empty queue would
 * say no session needs a substitute, which is the one wrong answer this page
 * must never give.
 */
async function loadQueue(): Promise<QueueResult> {
  // Outside the `try` on purpose. Building the server client reads cookies, and
  // in the App Router a dynamic-render signal travels as a thrown control-flow
  // object — caught here it would be reported to the admin as a failed read and
  // silently break the render it was steering.
  const supabase = await createClient();
  const service = new SessionSubstitutionService(supabase);

  try {
    return { ok: true, queue: await service.getAdminQueue() };
  } catch (error) {
    return { ok: false, reason: wireReason(error) };
  }
}

/**
 * The message off the wire, or `null` for anything that is not one.
 *
 * Postgres refusing or failing produces an error carrying a `code` and a
 * `message` written to be read, and splicing that into the band tells the admin
 * something they can act on. A schema mismatch does not: a `ZodError`'s message
 * is a JSON dump of every issue, which would render as a wall of brackets. So
 * the reason is taken only from the wire-shaped error, and everything else — a
 * parse failure, a network fault, a bug — falls to the generic sentence.
 */
function wireReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error) || !("message" in error)) return null;
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return message.length > 0 ? message : null;
}

/**
 * `/admin/substitutions` — sessions somebody cannot make, and who stood in.
 *
 * The route reads the document and hands it to the client shell, which owns
 * everything after: the mapping, the clock, the viewer's zone and the one write
 * on the page. **There is no loading state anywhere below this line** — the
 * first paint is the finished page, because the data was already in hand when
 * the HTML was written.
 *
 * **The document reaches the query cache by hydration.** A soft navigation back
 * here re-runs this route, so the RPC is answered again — but a seed handed
 * down as `initialData` is consulted only when the key is empty, and by then it
 * is not. Hydrating writes it into the entry instead, by recency, so the newest
 * answer wins and nothing is fetched twice. The shell still takes the document
 * as a prop, which is what makes the query's `data` non-optional.
 *
 * Nothing pins the route dynamic and nothing needs to: the Supabase server
 * client reads cookies, which is what makes a request-scoped render
 * request-scoped. The role gate is the proxy's `/admin` prefix check, which
 * this route inherits like every other page under it.
 */
export default async function AdminSubstitutionsRoute() {
  const result = await loadQueue();

  if (!result.ok) {
    return <AdminSubstitutionsLoadFailure reason={result.reason} />;
  }

  // Named through the hook's own key factory rather than a literal: a key one
  // segment off does not fail, it fills an entry nobody reads and buys nothing.
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionSubstitutionKeys.adminQueue(), result.queue);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminSubstitutionsPage initialQueue={result.queue} />
    </HydrationBoundary>
  );
}

/**
 * The page's chrome over a band saying why there is nothing under it.
 *
 * The heading waits on nothing, so it is here exactly as it is on the loaded
 * page — minus the zone line, which is a fact about a document that did not
 * arrive. Below it is the failure and nothing else: an empty queue would say
 * every session is staffed when what happened is that nobody asked.
 */
async function AdminSubstitutionsLoadFailure({
  reason,
}: {
  reason: string | null;
}) {
  const t = await getTranslations("admin.substitutions");

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      {/* The reason is a message off the wire, never translated copy — it is
          spliced into a sentence that is, which is why there are two keys rather
          than one with an optionally-empty argument. */}
      <Alert variant="destructive">
        <AlertDescription>
          {reason === null ? t("loadError") : t("loadErrorWithReason", { reason })}
        </AlertDescription>
      </Alert>
    </div>
  );
}

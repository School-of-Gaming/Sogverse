import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { UnlockGate } from "@/components/pin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("unlockPin") };
}

/**
 * Resolve `pin_is_set` server-side so the gate renders its final shape
 * (create-vs-enter) on the first frame — no client loading skeleton. Returns
 * `undefined` on the rare RPC failure, in which case the gate falls back to a
 * client fetch. The RPC is `auth.uid()`-scoped, so the server session's own
 * customer row is what's read.
 */
async function getPinIsSet(): Promise<boolean | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pin_is_set");
    if (error) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

export default async function ParentUnlockPage() {
  const initialPinIsSet = await getPinIsSet();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <UnlockGate initialPinIsSet={initialPinIsSet} />
    </div>
  );
}

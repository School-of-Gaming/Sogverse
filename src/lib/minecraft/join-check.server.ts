import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { JoinCheckLookup, LinkedGamer } from "./join-check";

/**
 * Gathers everything the join check judges for one Minecraft UUID: every
 * account that linked it, and each linked gamer's active seats.
 *
 * `minecraft_uuid` is not unique — siblings share a Minecraft account — so the
 * lookup is a set and the answer is "does anyone holding this UUID qualify",
 * never a single row. Nothing can tell which sibling is at the keyboard.
 *
 * Two round trips: the linked accounts with their profiles, then the gamers'
 * active seats with their products. Only gamers are carried forward; a gedu who
 * linked the UUID makes it "linked" and nothing more, and no gedu's name leaves
 * this function. Which seats qualify is decided by `seatGrantsServerAccess`,
 * with one exception: only `active` seats are fetched, so a rule admitting a
 * seat in any other status has to widen this read's status filter as well.
 *
 * Returns the database error rather than throwing, so the route answers it.
 */
export async function loadJoinCheck(
  supabase: SupabaseClient<Database>,
  minecraftUuid: string,
): Promise<{ data: JoinCheckLookup } | { error: string }> {
  const { data: accounts, error: accountsError } = await supabase
    .from("minecraft_accounts")
    .select("user_id, minecraft_username, profile:profiles!inner(first_name, role)")
    .eq("minecraft_uuid", minecraftUuid);
  if (accountsError) return { error: accountsError.message };

  const gamerAccounts = accounts.filter(
    (account) => account.profile.role === "gamer",
  );
  if (gamerAccounts.length === 0) {
    return { data: { linked: accounts.length > 0, gamers: [] } };
  }

  const { data: participations, error: participationsError } = await supabase
    .from("participations")
    .select(
      `
        participant_id,
        status,
        product:products!inner(
          product_type,
          billing_mode,
          start_date,
          end_date,
          timezone,
          product_translations(locale, name)
        )
      `,
    )
    .in(
      "participant_id",
      gamerAccounts.map((account) => account.user_id),
    )
    .eq("status", "active");
  if (participationsError) return { error: participationsError.message };

  const gamers: LinkedGamer[] = gamerAccounts.map((account) => ({
    firstName: account.profile.first_name,
    minecraftUsername: account.minecraft_username,
    seats: participations
      .filter((participation) => participation.participant_id === account.user_id)
      .map(({ status, product }) => ({
        status,
        billingMode: product.billing_mode,
        productType: product.product_type,
        startDate: product.start_date,
        endDate: product.end_date,
        timezone: product.timezone,
        product:
          resolveTranslation(product.product_translations, DEFAULT_LOCALE)
            ?.name ?? "",
      })),
  }));

  return { data: { linked: true, gamers } };
}

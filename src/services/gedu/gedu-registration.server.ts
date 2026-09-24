import "server-only";

import { lookupMinecraftUser } from "@/lib/mojang";
import { lookupRobloxProfile } from "@/lib/roblox";
import { toE164Digits } from "@/lib/utils";
import type { AppSupabaseClient, SpokenLanguageCode } from "@/types";
import type { CompleteGeduRegistrationBody } from "./gedu-registration.contracts";

/**
 * The educator half of a registration that both registration routes share: the
 * form's own fields, prepared, and the promotion that writes them. What stays
 * in each route is how the account came to exist — created in the same request
 * by the register route, already signed in through Google for the completion
 * route — and what a failed promotion means for it.
 */

/**
 * The phone number as the `profiles.phone` CHECK stores it (`^\d{7,15}$`), `""`
 * for no number (the RPC NULLIFs it), or `null` for a number that cannot be
 * stored, which the caller refuses with a 400.
 */
export function geduPhoneDigits(phone: string | undefined): string | null {
  if (!phone || !phone.trim()) return "";
  const digits = toE164Digits(phone);
  if (!digits || !/^\d{7,15}$/.test(digits)) return null;
  return digits;
}

/** Each handle the educator gave, with the platform's account key if it has one. */
export interface ResolvedGeduHandles {
  minecraft: { username: string; uuid: string | null } | null;
  roblox: { username: string; userId: number | null } | null;
}

/**
 * Look both game handles up with their platforms.
 *
 * Both arrive trimmed and length-bounded, with an empty field already
 * collapsed to null by the shared value schemas; all that is left here is to
 * read "absent" out of the shapes it can take.
 *
 * **Nothing about either name gates the registration.** We do not judge what a
 * Minecraft or Roblox handle may look like — the platform does — and even its
 * answer decides only whether an account key is stored: an unresolvable name
 * is kept with a null key, and another account already holding it is allowed.
 *
 * Two unrelated third parties, so the lookups run together rather than in
 * sequence — an educator who gave both handles waits for the slower one.
 */
export async function resolveGeduGameHandles({
  minecraftUsername,
  robloxUsername,
}: Pick<
  CompleteGeduRegistrationBody,
  "minecraftUsername" | "robloxUsername"
>): Promise<ResolvedGeduHandles> {
  const mcName = minecraftUsername || null;
  const robloxName = robloxUsername || null;

  const [minecraft, roblox] = await Promise.all([
    mcName
      ? lookupMinecraftUser(mcName).then((mojang) => ({
          username: mcName,
          uuid: mojang?.uuid ?? null,
        }))
      : null,
    robloxName
      ? lookupRobloxProfile(robloxName).then((profile) => ({
          username: robloxName,
          userId: profile?.userId ?? null,
        }))
      : null,
  ]);

  return { minecraft, roblox };
}

/**
 * The atomic promotion: `register_gedu` swaps customer→gedu and writes the
 * profile fields, coverage and game accounts in one transaction. The client
 * has to be the service-role one — the RPC is granted to nobody else, because
 * it grants a role.
 */
export async function promoteToGedu(
  admin: AppSupabaseClient,
  {
    userId,
    fields,
    locale,
    phoneDigits,
    handles,
  }: {
    userId: string;
    /**
     * The two lists as a route receives them: absent when a client left them
     * out (the contract's defaults are not visible through the route's body
     * type), which the RPC reads as empty.
     */
    fields: {
      firstName: string;
      lastName: string;
      spokenLanguages?: SpokenLanguageCode[];
      locationIds?: string[];
    };
    locale: string;
    phoneDigits: string;
    handles: ResolvedGeduHandles;
  },
) {
  return admin.rpc("register_gedu", {
    p_user_id: userId,
    p_first_name: fields.firstName,
    p_last_name: fields.lastName,
    p_locale: locale,
    p_phone: phoneDigits,
    p_spoken_languages: fields.spokenLanguages ?? [],
    p_location_ids: fields.locationIds ?? [],
    p_minecraft_username: handles.minecraft?.username ?? "",
    p_minecraft_uuid: handles.minecraft?.uuid ?? "",
    // The empty string is this RPC's "absent" sentinel for every optional
    // text argument, and the account id travels as text for exactly that
    // reason — a bigint parameter could not carry it. The RPC NULLIFs and
    // casts on the other side.
    p_roblox_username: handles.roblox?.username ?? "",
    p_roblox_user_id:
      handles.roblox?.userId === null || handles.roblox?.userId === undefined
        ? ""
        : String(handles.roblox.userId),
  });
}

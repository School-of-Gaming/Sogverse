import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";
import { toE164Digits } from "@/lib/utils";
import { resolveLocale } from "@/lib/constants/locales";
import { registerGeduBody } from "@/services/gedu/gedu-registration.contracts";

/**
 * POST /api/gedu/register
 *
 * Educators self-register, like parents. A new gedu is created unverified; an
 * admin verifies them before they can be assigned to a group (the verification
 * gate lives in the assignment UI, not here).
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "educators self-register, so no session can exist yet. The highest-value public route on the surface: it creates an account, and the account it creates is unverified until an admin approves it",
  body: registerGeduBody,

  // The promotion RPC's failure used to be returned to the registrant as a 500
  // carrying its raw message. That is closed: the one outcome they can act on
  // (the Minecraft account is taken) keeps its own copy, and everything else is
  // logged and answered generically. Nothing here opts into disclosure, because
  // an unauthenticated caller is the last one who should be shown database text.

  handler: async ({ body }) => {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      spokenLanguages,
      locale: requestedLocale,
      locationIds,
      minecraftUsername,
    } = body;

    const locale = resolveLocale(requestedLocale);

    // Phone → digits to match the profiles.phone CHECK (^\d{7,15}$). Empty or
    // absent stays "" and the RPC NULLIFs it.
    let phoneDigits = "";
    if (phone && phone.trim()) {
      const digits = toE164Digits(phone);
      if (!digits || !/^\d{7,15}$/.test(digits)) {
        return NextResponse.json(
          { error: "Invalid phone number" },
          { status: 400 },
        );
      }
      phoneDigits = digits;
    }

    const admin = createAdminClient();

    // Resolve Minecraft BEFORE creating the auth user — the UNIQUE constraint
    // on minecraft_uuid can reject this, and createUser burns the email
    // irreversibly. Checking first lets the gedu retry with a different name
    // without an orphaned auth user.
    let resolvedMc: { username: string; uuid: string | null } | null = null;
    const mcName = minecraftUsername?.trim();
    if (mcName) {
      if (!isValidMinecraftUsername(mcName)) {
        return NextResponse.json(
          {
            error:
              "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores.",
          },
          { status: 400 },
        );
      }
      const mojang = await lookupMinecraftUser(mcName);
      resolvedMc = { username: mcName, uuid: mojang?.uuid ?? null };

      if (resolvedMc.uuid) {
        const { data: existingMc } = await admin
          .from("minecraft_accounts")
          .select("user_id")
          .eq("minecraft_uuid", resolvedMc.uuid)
          .maybeSingle();
        if (existingMc) {
          return NextResponse.json(
            {
              error: "This Minecraft account is already linked to another user",
            },
            { status: 409 },
          );
        }
      }
    }

    // Step 1: create the auth user. The handle_new_user trigger seeds a
    // customer-role profile + customer_profiles row; email_confirm
    // short-circuits the (disabled) confirmation flow so the gedu can sign in
    // immediately.
    const composedDisplayName = [firstName, lastName].filter(Boolean).join(" ");
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          display_name: composedDisplayName,
        },
      });

    if (authError) {
      // Most commonly: the email is already registered. That is the one thing
      // the registrant can act on, so it keeps its own copy — and it says no
      // more than the sign-in form would already tell them.
      console.error("[gedu/register] createUser failed", authError);
      return NextResponse.json(
        {
          error:
            "That email could not be registered. If you already have an account, sign in instead.",
        },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    // Step 2: atomic promotion. The RPC swaps customer→gedu, writes the profile
    // fields, coverage, and Minecraft account in one transaction. On any
    // failure we delete the auth user so no half-promoted debris survives — the
    // narrow remaining gap (process death between createUser and the RPC) is
    // far smaller than the old multi-step invite route's exposure.
    const { error: rpcError } = await admin.rpc("register_gedu", {
      p_user_id: userId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_locale: locale,
      p_phone: phoneDigits,
      p_spoken_languages: spokenLanguages ?? [],
      p_location_ids: locationIds ?? [],
      p_minecraft_username: resolvedMc?.username ?? "",
      p_minecraft_uuid: resolvedMc?.uuid ?? "",
    });

    if (rpcError) {
      await admin.auth.admin.deleteUser(userId);
      if (rpcError.code === "23505") {
        return NextResponse.json(
          { error: "This Minecraft account is already linked to another user" },
          { status: 409 },
        );
      }
      console.error("[gedu/register] register_gedu failed", rpcError);
      return NextResponse.json(
        { error: "Registration could not be completed. Please try again." },
        { status: 500 },
      );
    }

    return { userId };
  },
});

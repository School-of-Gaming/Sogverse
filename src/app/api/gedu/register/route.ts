import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";
import { toE164Digits } from "@/lib/utils";
import { resolveLocale } from "@/lib/constants/locales";
import { registerGeduBody } from "@/services/gedu/gedu-registration.contracts";

// Public, unauthenticated: gedus self-register (like parents). A new gedu is
// created unverified; an admin verifies them before they can be assigned to a
// group (the verification gate lives in the assignment UI, not here).
export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, registerGeduBody);
    if (body instanceof NextResponse) return body;

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

    // Phone → digits to match the profiles.phone CHECK (^\d{7,15}$). Empty/absent
    // stays "" and the RPC NULLIFs it.
    let phoneDigits = "";
    if (phone && phone.trim()) {
      const digits = toE164Digits(phone);
      if (!digits || !/^\d{7,15}$/.test(digits)) {
        return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
      }
      phoneDigits = digits;
    }

    const admin = createAdminClient();

    // Resolve Minecraft BEFORE creating the auth user — the UNIQUE constraint on
    // minecraft_uuid can reject this, and createUser burns the email
    // irreversibly. Checking first lets the gedu retry with a different name
    // without an orphaned auth user.
    let resolvedMc: { username: string; uuid: string | null } | null = null;
    const mcName = minecraftUsername?.trim();
    if (mcName) {
      if (!isValidMinecraftUsername(mcName)) {
        return NextResponse.json(
          { error: "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores." },
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
            { error: "This Minecraft account is already linked to another user" },
            { status: 409 },
          );
        }
      }
    }

    // Step 1: create the auth user. The handle_new_user trigger seeds a
    // customer-role profile + customer_profiles row; email_confirm short-circuits
    // the (disabled) confirmation flow so the gedu can sign in immediately.
    const composedDisplayName = [firstName, lastName].filter(Boolean).join(" ");
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
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
      // Most commonly: the email is already registered.
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // Step 2: atomic promotion. The RPC swaps customer→gedu, writes the profile
    // fields, coverage, and Minecraft account in one transaction. On any failure
    // we delete the auth user so no half-promoted debris survives — the narrow
    // remaining gap (process death between createUser and the RPC) is far smaller
    // than the old multi-step invite route's exposure.
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
      const isDupMc = rpcError.code === "23505";
      return NextResponse.json(
        {
          error: isDupMc
            ? "This Minecraft account is already linked to another user"
            : rpcError.message,
        },
        { status: isDupMc ? 409 : 500 },
      );
    }

    return NextResponse.json({ userId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

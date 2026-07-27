import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupMinecraftUser } from "@/lib/mojang";
import { updateGamerBody } from "@/services/gamers/gamers.contracts";

/**
 * PATCH /api/gamers/[id] — a parent edits one of their own gamers.
 *
 * Two authorization layers before anything is written: the parent_gamer link is
 * confirmed on the RLS-bound client (so the database agrees the caller owns the
 * link), and the target's role is confirmed to be `gamer` on the admin client
 * (so a link row can never be used to reach a non-gamer account).
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can update gamer accounts",
  params: z.object({ id: z.string().uuid() }),
  body: updateGamerBody,

  // The hand-rolled `typeof` checks are now the shared body schema, which also
  // preserves the one distinction the old code carried in `"key" in body`: an
  // explicit null Minecraft username unlinks, an absent key leaves it alone.
  //
  // Every write failure used to be returned as a 500 carrying the driver's or
  // GoTrue's own message. Those are logged now and answered through the shared
  // table; the already-linked conflict keeps its copy because the status alone
  // does not explain it.

  handler: async ({ supabase, user, params, body }) => {
    const gamerId = params.id;

    // Verify parent-child relationship via the RLS-protected client.
    const { data: link, error: linkError } = await supabase
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", user.id)
      .eq("gamer_id", gamerId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Not authorized to manage this gamer" },
        { status: 403 },
      );
    }

    // Verify the target really is a gamer (defense in depth).
    const admin = createAdminClient();
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", gamerId)
      .single();

    if (targetError || targetProfile.role !== "gamer") {
      return NextResponse.json(
        { error: "Not authorized to manage this account" },
        { status: 403 },
      );
    }

    if (body.firstName !== undefined) {
      const { data: updatedRow, error: profileError } = await admin
        .from("profiles")
        .update({ first_name: body.firstName })
        .eq("id", gamerId)
        .select("first_name, last_name")
        .single();

      if (profileError) throw profileError;

      // Sync to auth metadata so the Supabase dashboard label stays current.
      // Compose display_name from the post-update row so the dashboard sees a
      // human-readable full name. The profiles table is the source of truth.
      const composed = [updatedRow.first_name, updatedRow.last_name]
        .filter(Boolean)
        .join(" ");
      const { error: authError } = await admin.auth.admin.updateUserById(
        gamerId,
        {
          user_metadata: {
            first_name: updatedRow.first_name,
            display_name: composed,
          },
        },
      );

      if (authError) throw authError;
    }

    if (body.password !== undefined) {
      const { error: pwError } = await admin.auth.admin.updateUserById(gamerId, {
        password: body.password,
      });
      if (pwError) throw pwError;
    }

    if (body.minecraftUsername !== undefined) {
      const username = body.minecraftUsername;
      const mcUpsert =
        username === null
          ? { user_id: gamerId, minecraft_username: null, minecraft_uuid: null }
          : {
              user_id: gamerId,
              minecraft_username: username,
              minecraft_uuid:
                (await lookupMinecraftUser(username))?.uuid ?? null,
            };

      const { error: mcError } = await admin
        .from("minecraft_accounts")
        .upsert(mcUpsert, { onConflict: "user_id" });

      if (mcError) {
        if (mcError.code === "23505") {
          return NextResponse.json(
            {
              error: "This Minecraft account is already linked to another user",
            },
            { status: 409 },
          );
        }
        throw mcError;
      }
    }

    const { data: updatedProfile, error: fetchError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", gamerId)
      .single();

    if (fetchError) throw fetchError;

    return { gamer: updatedProfile };
  },
});

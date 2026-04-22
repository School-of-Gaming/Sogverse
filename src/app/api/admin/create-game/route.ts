import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const reqId = Math.random().toString(36).slice(2, 10);
  console.log(`[DBG create-game ${reqId}] enter`);
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can create games",
    });
    if (result instanceof NextResponse) {
      console.log(`[DBG create-game ${reqId}] requireRole rejected`, {
        status: result.status,
      });
      return result;
    }
    console.log(`[DBG create-game ${reqId}] auth ok`, { userId: result.user.id });

    const body = await request.json();
    console.log(`[DBG create-game ${reqId}] body`, body);
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      console.log(`[DBG create-game ${reqId}] reject: empty name`);
      return NextResponse.json(
        { error: "Game name is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("games")
      .insert({ name })
      .select()
      .single();
    console.log(`[DBG create-game ${reqId}] insert result`, {
      data,
      errorCode: error?.code,
      errorMessage: error?.message,
    });

    if (error) {
      // Unique constraint violation
      if (error.code === "23505") {
        console.log(`[DBG create-game ${reqId}] duplicate name -> 409`);
        return NextResponse.json(
          { error: "A game with that name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log(`[DBG create-game ${reqId}] success`, {
      insertedId: data.id,
      insertedName: data.name,
    });
    return NextResponse.json({ game: data });
  } catch (err) {
    console.log(`[DBG create-game ${reqId}] exception`, {
      errName: err instanceof Error ? err.name : typeof err,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

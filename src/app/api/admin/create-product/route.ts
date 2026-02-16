import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    // Verify the caller is authenticated and is an admin
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if ((profile as { role: string } | null)?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create products" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const price = typeof body.price === "number" ? body.price : NaN;
    const imageUrl =
      typeof body.image_url === "string" ? body.image_url.trim() : "";
    const gameId = typeof body.game_id === "string" ? body.game_id : "";
    const dayOfWeek =
      typeof body.day_of_week === "number" ? body.day_of_week : -1;
    const startTime =
      typeof body.start_time === "string" ? body.start_time : "";
    const durationMinutes =
      typeof body.duration_minutes === "number" ? body.duration_minutes : 0;
    const minAge = typeof body.min_age === "number" ? body.min_age : -1;
    const maxAge = typeof body.max_age === "number" ? body.max_age : -1;

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }
    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }
    if (isNaN(price) || price < 0) {
      return NextResponse.json(
        { error: "Valid price is required" },
        { status: 400 }
      );
    }
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image URL is required" },
        { status: 400 }
      );
    }
    if (!gameId) {
      return NextResponse.json(
        { error: "Game is required" },
        { status: 400 }
      );
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json(
        { error: "Day of week must be 0-6" },
        { status: 400 }
      );
    }
    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      return NextResponse.json(
        { error: "Start time must be in HH:MM format" },
        { status: 400 }
      );
    }
    if (durationMinutes <= 0) {
      return NextResponse.json(
        { error: "Duration must be greater than 0" },
        { status: 400 }
      );
    }
    if (minAge < 0) {
      return NextResponse.json(
        { error: "Min age must be 0 or greater" },
        { status: 400 }
      );
    }
    if (maxAge < minAge) {
      return NextResponse.json(
        { error: "Max age must be greater than or equal to min age" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("products")
      .insert({
        name,
        description,
        price,
        image_url: imageUrl,
        created_by: user.id,
        game_id: gameId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        timezone: "Europe/Helsinki",
        duration_minutes: durationMinutes,
        min_age: minAge,
        max_age: maxAge,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

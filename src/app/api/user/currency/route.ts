import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportedCurrency } from "@/lib/constants/currency";

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currency } = await request.json();

    if (!isSupportedCurrency(currency)) {
      return NextResponse.json(
        { error: "Invalid currency" },
        { status: 400 }
      );
    }

    // Use admin client to bypass the server client's type limitation with .update()
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ currency })
      .eq("id", user.id);

    if (error) {
      console.error("Currency update error:", error);
      return NextResponse.json(
        { error: "Failed to update currency" },
        { status: 500 }
      );
    }

    return NextResponse.json({ currency });
  } catch (err) {
    console.error("Currency update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

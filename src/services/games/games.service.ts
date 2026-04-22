import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game, Database } from "@/types";

export class GamesService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getAllGames(): Promise<Game[]> {
    const { data, error } = await this.supabase
      .from("games")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return data;
  }

  async createGame(name: string): Promise<Game> {
    console.log("[DBG games.service] createGame:enter", { name });
    const response = await fetch("/api/admin/create-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    console.log("[DBG games.service] createGame:response", {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok) {
      const data = await response.json();
      console.log("[DBG games.service] createGame:error body", data);
      throw new Error(data.error || "Failed to create game");
    }

    const body = await response.json();
    console.log("[DBG games.service] createGame:success body", body);
    return body.game;
  }
}

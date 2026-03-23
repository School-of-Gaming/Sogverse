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
    const response = await fetch("/api/admin/create-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create game");
    }

    const { game } = await response.json();
    return game;
  }
}

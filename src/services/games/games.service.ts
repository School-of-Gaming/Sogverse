import type { Game } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class GamesService {
  constructor(private supabase: SupabaseClientType) {}

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

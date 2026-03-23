"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GamesService } from "./games.service";

const gameKeys = {
  all: ["games"] as const,
  lists: () => [...gameKeys.all, "list"] as const,
};

export function useGames() {
  const supabase = getClient();
  const service = new GamesService(supabase);

  return useQuery({
    queryKey: gameKeys.lists(),
    queryFn: () => service.getAllGames(),
  });
}

export function useCreateGame() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GamesService(supabase);

  return useMutation({
    mutationFn: (name: string) => service.createGame(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
    },
  });
}

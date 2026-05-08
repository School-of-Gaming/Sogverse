"use client";

import { useQuery } from "@tanstack/react-query";
import { FamilyService } from "./family.service";

export const familyKeys = {
  all: ["family"] as const,
  list: () => [...familyKeys.all, "list"] as const,
};

export function useFamily() {
  return useQuery({
    queryKey: familyKeys.list(),
    queryFn: () => new FamilyService().getFamily(),
  });
}

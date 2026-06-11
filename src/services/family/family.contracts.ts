import { z } from "zod";

/** One switchable account in the family switcher (self + linked gamers). */
export const familyMember = z.object({
  id: z.string(),
  role: z.enum(["customer", "gamer"]),
  first_name: z.string(),
});

export type FamilyMember = z.infer<typeof familyMember>;

/** Response of GET /api/family/list. */
export const familyListResponse = z.object({
  family: z.array(familyMember),
});

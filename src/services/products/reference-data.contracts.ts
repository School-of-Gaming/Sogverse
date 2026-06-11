import { z } from "zod";

/**
 * Request body of PATCH /api/admin/site-notes. Either side is optional;
 * sending only the half being edited keeps the request shape obvious — but
 * at least one must be present.
 */
export const updateSiteNotesBody = z
  .object({
    location_id: z.string().min(1, "location_id is required"),
    member: z
      .object({
        address: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .optional(),
    staff: z
      .object({
        notes: z.string().nullable().optional(),
      })
      .optional(),
  })
  .refine((body) => body.member !== undefined || body.staff !== undefined, {
    message: "Provide at least one of 'member' or 'staff'",
  });

/** Response of PATCH /api/admin/site-notes. */
export const updateSiteNotesResponse = z.object({ ok: z.literal(true) });

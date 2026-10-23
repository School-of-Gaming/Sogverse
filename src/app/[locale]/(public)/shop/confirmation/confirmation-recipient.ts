import type { Profile } from "@/types";

/**
 * The address the confirmation page names as where the mail went, or `null`
 * for the line with no address in it.
 *
 * The mail always goes to the payer's profile address, and only the payer may
 * be shown it: the page is reachable by whoever holds the link — a child's own
 * session included — and an address is not theirs to read. So it is the
 * signed-in profile's own address when that profile is the payer, and nothing
 * otherwise; never an address found anywhere else.
 */
export function confirmationRecipientEmail(
  viewerProfile: Pick<Profile, "id" | "email"> | null | undefined,
  customerId: string,
): string | null {
  return viewerProfile?.id === customerId ? viewerProfile.email : null;
}

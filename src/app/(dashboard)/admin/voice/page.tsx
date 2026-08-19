import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The instant-room page folded into Tools, which now holds every
 * platform-operations card an admin has. This route survives only so a
 * bookmark or a pasted link lands on the card rather than on a 404.
 */
export default function AdminVoicePage() {
  redirect(ROUTES.admin.tools);
}

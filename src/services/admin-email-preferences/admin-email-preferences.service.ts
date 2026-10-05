import {
  Constants,
  type AdminEmailKind,
  type AdminEmailPreference,
  type AppSupabaseClient,
} from "@/types";

/**
 * Every staff email kind an admin can opt into, in the order the
 * `admin_email_kind` enum declares them — the order the settings page lists
 * them in. Derived from codegen, so a kind added by migration appears here with
 * no edit.
 */
export const ADMIN_EMAIL_KINDS: readonly AdminEmailKind[] =
  Constants.public.Enums.admin_email_kind;

/**
 * The staff emails the signed-in admin has opted into.
 *
 * **No row means off.** A kind the admin has never answered is off, and so is
 * one they turned off; only `enabled = true` puts them on that mail.
 */
export class AdminEmailPreferencesService {
  constructor(private supabase: AppSupabaseClient) {}

  /** The signed-in admin's own answers. RLS scopes the read to the caller. */
  async getMine(): Promise<AdminEmailPreference[]> {
    const { data, error } = await this.supabase
      .from("admin_email_preferences")
      .select("admin_id, kind, enabled, updated_at");

    if (error) throw error;
    return data;
  }

  /** Turn one kind on or off for the signed-in admin. */
  async setMine(kind: AdminEmailKind, enabled: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_admin_email_preference", {
      p_kind: kind,
      p_enabled: enabled,
    });

    if (error) throw error;
  }
}

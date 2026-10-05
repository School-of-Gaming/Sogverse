import type {
  AppSupabaseClient,
  NotificationChannel,
  NotificationKind,
  NotificationPreference,
} from "@/types";

/**
 * The toggles the settings page offers, grouped by channel: each channel names
 * the kinds a person can turn on or off there, in the order they are listed.
 *
 * A `Record` over the channel enum, so a channel added by migration fails the
 * type-check here until someone decides which kinds it carries — a kind that
 * makes sense by email need not make sense on another channel.
 */
export const NOTIFICATION_TOGGLES: Readonly<
  Record<NotificationChannel, readonly NotificationKind[]>
> = {
  email: ["session_report_copy"],
};

/**
 * The notifications the signed-in person has opted into.
 *
 * **No row means off.** A kind never answered on a channel is off there, and
 * so is one turned off; only `enabled = true` puts the person on that
 * notification.
 */
export class NotificationPreferencesService {
  constructor(private supabase: AppSupabaseClient) {}

  /** The signed-in person's own answers. RLS scopes the read to the caller. */
  async getMine(): Promise<NotificationPreference[]> {
    const { data, error } = await this.supabase
      .from("notification_preferences")
      .select("profile_id, kind, channel, enabled, updated_at");

    if (error) throw error;
    return data;
  }

  /** Turn one kind on or off on one channel for the signed-in person. */
  async setMine(
    kind: NotificationKind,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_notification_preference", {
      p_kind: kind,
      p_channel: channel,
      p_enabled: enabled,
    });

    if (error) throw error;
  }
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  NOTIFICATION_TOGGLES,
  useMyNotificationPreferences,
  useSetNotificationPreference,
} from "@/services/notification-preferences";
import {
  Constants,
  type NotificationChannel,
  type NotificationKind,
  type NotificationPreference,
} from "@/types";

/**
 * The baseline a failed read falls back to: everything off. Module-level so it
 * is one stable array rather than a fresh one per render.
 */
const NO_PREFERENCES: readonly NotificationPreference[] = [];

/** One toggle's identity: a kind on a channel. */
type ToggleKey = `${NotificationChannel}:${NotificationKind}`;

const toggleKey = (channel: NotificationChannel, kind: NotificationKind): ToggleKey =>
  `${channel}:${kind}`;

/** The channels in the order the `notification_channel` enum declares them. */
const CHANNELS: readonly NotificationChannel[] =
  Constants.public.Enums.notification_channel;

/**
 * **Which notifications reach the viewer, grouped by channel — a card of its
 * own with its own Save.** Each channel is a group (today only Email), and each
 * group holds one row per kind offered on that channel: a sentence naming it
 * and a muted line saying what will arrive. Every toggle is off until turned
 * on; no stored row means off.
 *
 * The card is self-contained like the gedu coverage editor: it owns the read,
 * the local edits and the writes, and its Save is enabled only when something
 * differs from what is on file. It is not a save-on-click control — every
 * control on the settings page waits for a Save button.
 *
 * Rendered only for a viewer who has at least one toggle, which the page
 * decides; today that is an admin, because the only kind is an admin's and the
 * setter refuses anyone else.
 */
export function NotificationPreferencesCard() {
  const t = useTranslations("settings.notifications");
  const c = useTranslations("common");

  const { data: rows, isError: readFailed } = useMyNotificationPreferences();
  const setPreference = useSetNotificationPreference();

  /**
   * The baseline the boxes render from and a save diffs against. **A failed
   * read resolves to "all off" rather than "not known yet"**, so the boxes stay
   * usable instead of dead; the change-only save is what makes that safe — an
   * untouched box equals the assumed baseline and is never written. While the
   * read is in flight it stays `undefined` and the boxes stay disabled. Rows
   * already read win over a later failed refetch, which would otherwise flip a
   * stored answer to "off" on screen.
   */
  const saved = rows ?? (readFailed ? NO_PREFERENCES : undefined);
  const savedAnswers = new Map(
    saved?.map((row) => [toggleKey(row.channel, row.kind), row.enabled]),
  );
  const savedEnabled = (key: ToggleKey) => savedAnswers.get(key) ?? false;

  /**
   * Edits on top of the saved answers. Untouched toggles stay absent, which is
   * what lets a save write only what actually changed.
   */
  const [edits, setEdits] = useState<Partial<Record<ToggleKey, boolean>>>({});
  const enabled = (key: ToggleKey) => edits[key] ?? savedEnabled(key);

  const changed = CHANNELS.flatMap((channel) =>
    NOTIFICATION_TOGGLES[channel]
      .filter((kind) => {
        const key = toggleKey(channel, kind);
        return enabled(key) !== savedEnabled(key);
      })
      .map((kind) => ({ channel, kind })),
  );
  const isDirty = saved !== undefined && changed.length > 0;

  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Set synchronously before the writes start, because `isPending` flips false
   * before the refreshed read has re-rendered the card — a gap in which the
   * button would re-enable.
   */
  const [committing, setCommitting] = useState(false);

  async function handleSave() {
    if (committing) return;
    setSaveError(null);
    setCommitting(true);

    try {
      // One write per changed toggle. Each mutation's onSuccess returns the
      // invalidation, so by the time the loop ends the refetch has landed and
      // dropping the edits cannot flash the old answers.
      for (const { channel, kind } of changed) {
        await setPreference.mutateAsync({
          kind,
          channel,
          enabled: enabled(toggleKey(channel, kind)),
        });
      }
      setEdits({});
    } catch {
      // Our own sentence, never the PostgrestError's raw Postgres English. The
      // boxes keep what the viewer chose, so Save again retries exactly the
      // toggles that still differ.
      setSaveError(t("saveFailed"));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {CHANNELS.map((channel) => (
          <fieldset key={channel} className="space-y-2">
            <legend className="text-sm font-medium leading-none">
              {t(`channels.${channel}`)}
            </legend>
            <div className="flex flex-col gap-2">
              {NOTIFICATION_TOGGLES[channel].map((kind) => {
                const key = toggleKey(channel, kind);
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={enabled(key)}
                      onChange={(e) => {
                        setSaveError(null);
                        const next = e.target.checked;
                        setEdits((current) => ({ ...current, [key]: next }));
                      }}
                      disabled={saved === undefined || committing}
                    />
                    <span className="space-y-0.5">
                      <span className="block">{t(`kinds.${kind}.label`)}</span>
                      <span className="block text-muted-foreground">
                        {t(`kinds.${kind}.hint`)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* One reserved line for the failure message, so surfacing it cannot
            move the save button out from under the pointer. */}
        <div className="flex items-start justify-between gap-3">
          <p
            className="flex min-h-[20px] flex-1 items-start gap-1.5 text-sm text-foreground"
            role="alert"
          >
            {saveError !== null && (
              <>
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden
                />
                <span>{saveError}</span>
              </>
            )}
          </p>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || committing}
          >
            {committing ? c("saving") : c("saveChanges")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

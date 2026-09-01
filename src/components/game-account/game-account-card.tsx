"use client";

import { useState, type ReactNode } from "react";
import { Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRobloxRender } from "@/services/roblox";
import { GameUsernameEditableRow } from "./game-username-editable-row";
import {
  GAME_PLATFORMS,
  robloxAccountId,
  type GameAccountExternalId,
  type GamePlatform,
} from "./platforms";

/**
 * One saved game identity, wired to a save — and the two shapes every surface
 * that owns one has wanted so far.
 *
 * `GameAccountField` is the unit: the row, the picture it needs, and the one
 * sentence a failure gets. `GameAccountCard` is that field inside a titled card,
 * which is what a page showing one platform per card wants.
 *
 * **Extracted because it had been written three times.** Settings, the parent's
 * gamer detail and the admin user page each grew their own copy of the same
 * forty lines — the same error ladder, the same silhouette-vs-render decision,
 * the same rethrow — and they had already begun to differ in the shape of the
 * error extraction. Three copies of a save handler is three places for the next
 * rule about saving to be applied twice and forgotten once.
 */

/** What a caller does with the committed value. Rejecting shows the reason. */
export type GameAccountSave = (username: string | null) => Promise<unknown>;

interface GameAccountFieldProps {
  platform: GamePlatform;
  /** The saved username, or `null` when there is none yet. */
  username: string | null;
  /** The stored account key, when a lookup ever confirmed one. */
  externalId: GameAccountExternalId | null;
  /** Whose account this is, for the pencil's accessible name. Omit for "yours". */
  personName?: string;
  /**
   * Persist the committed value. **Declared here rather than borrowed from a
   * feature's update type** — the field does not care which mutation is behind
   * it, and a signature lifted from one of them would make every other caller
   * look like it was doing something unusual.
   */
  onSave: GameAccountSave;
  /**
   * A visible label above the row, for a surface whose card title is not already
   * the platform's name. Omitted where the card says it.
   */
  label?: string;
  className?: string;
}

export function GameAccountField({
  platform,
  username,
  externalId,
  personName,
  onSave,
  label,
  className,
}: GameAccountFieldProps) {
  const g = useTranslations("gameAccount");
  const [error, setError] = useState<string | null>(null);
  const name = GAME_PLATFORMS[platform].name;

  // `null` for Minecraft (the row derives its skin from the name) and for an
  // unverified Roblox handle — no stored id to resolve, and looking the *name*
  // up instead could draw whichever stranger happens to own it.
  const { data: render } = useRobloxRender(
    robloxAccountId(platform, externalId),
  );

  /**
   * Committing the row *is* saving it — there is no separate Save button,
   * because the row's own commit already asked the question one would have
   * answered.
   *
   * The row has verified the name against the platform by the time this runs, so
   * what arrives is the canonical casing; the route re-runs the lookup
   * server-side anyway, because a client-verified name is not evidence. The
   * caller's mutation invalidates the account query, which feeds the row its new
   * props — the loop that keeps this component from holding a second copy of the
   * username.
   *
   * **A success sentence is not part of that loop, and there is none.** The row
   * itself is the receipt: the new name is on screen, the tick lands beside it,
   * the picture arrives in the box. A banner saying so again in words announces
   * something already visible and makes the ordinary path the noisy one. Only a
   * failure gets a sentence, because a failure is the one outcome the row cannot
   * show on its own.
   */
  const handleCommit = async (value: string | null) => {
    // Cleared first, so a retry after a failure does not leave the old reason
    // sitting under a row that has since succeeded.
    setError(null);

    try {
      await onSave(value);
    } catch (err: unknown) {
      // **The rejection is not read.** Whatever a mutation rejects with — an
      // `Error` carrying a route's English, a Postgrest object, a `TypeError`
      // from a dropped connection — says the same thing to the person in front
      // of it: the change did not take. Preferring its `message`, as this did,
      // only meant a server-authored English sentence on screen in every locale.
      setError(g("saveFailed", { platform: name }));
      // Rethrown after the message is set: the row is awaiting this, and a
      // silent resolve would leave it showing a name nothing stored.
      throw err;
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label !== undefined && <p className="text-sm font-medium">{label}</p>}

      <GameUsernameEditableRow
        platform={platform}
        username={username}
        externalId={externalId}
        personName={personName}
        // Minecraft omits it and derives its skin from the name. Roblox hands in
        // what the by-id lookup resolved — or `null` while it is in flight,
        // which draws the silhouette in a box already at its final size, so the
        // picture lands without moving anything.
        avatarUrl={platform === "roblox" ? (render ?? null) : undefined}
        // Returned, not voided: the row waits on the write before it lets go of
        // the name it is showing.
        onCommit={({ username: committed }) => handleCommit(committed)}
      />

      {/* Failures only, and below the row rather than above it. A banner above
          would push the row — the very thing the person just used, and is still
          looking at — down the page as it lands. What it does push is whatever
          sits below, and only ever because this person just committed something
          here and it did not take. On the ordinary path nothing appears at all
          and nothing moves. */}
      {error && (
        <div className="rounded-md border border-destructive bg-muted p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

interface GameAccountCardProps
  extends Omit<GameAccountFieldProps, "label" | "className"> {
  title: string;
  description: string;
  /** An extra line under the description — a platform's attribution credit. */
  note?: ReactNode;
}

/**
 * The field in a card of its own, for a page that gives each platform one.
 *
 * No `label`: the card's title is already the platform's name, and a second
 * heading two lines under the first says it twice.
 */
export function GameAccountCard({
  title,
  description,
  note,
  ...field
}: GameAccountCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
        {note}
      </CardHeader>
      <CardContent>
        <GameAccountField {...field} className="max-w-sm" />
      </CardContent>
    </Card>
  );
}

"use client";

import { useId, useState } from "react";
import { Check, Copy, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import {
  MinecraftUsernameRow,
  type MinecraftCheckStatus,
} from "@/components/minecraft/minecraft-username-row";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn, computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GamerSessionRow } from "./types";

const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const;

interface GamerRosterRowProps {
  gamer: GamerSessionRow;
  /**
   * Save a new Minecraft username for this child. **Omit it and the row is
   * read-only** — which is what the surfaces that only display a roster want,
   * and what keeps the edit affordance from appearing somewhere nothing is
   * listening for it.
   *
   * A trimmed empty string means "clear it".
   */
  onSaveMinecraftUsername?: (gamerId: string, username: string) => void;
  /**
   * Where the Mojang check for this child's name has got to, when one is in
   * flight or has just landed. Omitted, the row derives its own resting state
   * from whether the account carries a verified UUID — which is what every row
   * nobody has touched shows.
   *
   * The caller owns this rather than the row, because the check is one request
   * per save and the owner of the save is the only one who knows when it started.
   */
  minecraftStatus?: MinecraftCheckStatus;
}

/**
 * One child on the assigned-group roster.
 *
 * **Two lines, and the split is the whole design.** Line one is identity —
 * identicon, first name, age/gender, Minecraft username. Line two is the parent
 * email on its own, because an email is the one field here with no useful upper
 * bound: `sofia.margareta.lindqvist-holmberg@kotiposti.example.com` sharing a
 * line with a name either wrapped into a ragged three-line block or squeezed the
 * name down to an ellipsis, and the rail this row lives in is a third of the
 * page. Given a line to itself it truncates from one end, predictably, and the
 * row keeps the same height whoever is in it.
 *
 * The email is still the click-to-copy button it always was — the gedu's most
 * common action on this row is mailing a parent — and the "copy all" helper
 * above the list covers the whole group.
 *
 * **Minecraft usernames are editable here.** Children mistype them, change them,
 * or never got round to entering one, and the gedu is the person who finds out —
 * mid-session, when the name doesn't match anyone on the server. So the identity
 * line carries a pencil: quiet by default (muted, and only fully opaque on hover
 * or keyboard focus, so eight of them don't turn the rail into a toolbar), but
 * always present rather than revealed on hover, since an affordance that only
 * exists under the cursor doesn't exist on a touchscreen. Opening it swaps the
 * line for a small input *in place*, with Save and Cancel to its right; nothing
 * below moves, because the input is the same height as the line it replaced —
 * and the same is true of the check that follows the save, which lands in a slot
 * that was already holding its space.
 */
export function GamerRosterRow({
  gamer,
  onSaveMinecraftUsername,
  minecraftStatus,
}: GamerRosterRowProps) {
  const t = useTranslations("gedu.sessionDetails");
  const timeZone = useTimezone();

  const detailParts: string[] = [];
  if (gamer.date_of_birth) {
    detailParts.push(t("age", { age: computeAge(gamer.date_of_birth, timeZone) }));
  }
  if (gamer.gender) {
    detailParts.push(t(GENDER_KEY[gamer.gender]));
  }
  const detail = detailParts.join(" · ");

  return (
    <li className="space-y-1.5 rounded-md border border-border bg-card p-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <Identicon id={gamer.gamer_id} size={32} />
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium leading-tight">
            <span className="truncate">{gamer.first_name}</span>
            {detail && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {detail}
              </span>
            )}
          </p>
          <MinecraftIdentityCell
            gamer={gamer}
            status={minecraftStatus}
            onSave={onSaveMinecraftUsername}
          />
        </div>
      </div>
      {gamer.parent_email !== null && (
        <ParentEmailCell email={gamer.parent_email} />
      )}
    </li>
  );
}

/**
 * The child's Minecraft identity — skin, username, check state — plus the inline
 * editor it swaps for.
 *
 * The draft is seeded when the editor opens rather than held across closes, so
 * cancelling really discards. Save closes optimistically — the caller owns the
 * row, so the new username arrives back as a prop, and so does whatever the
 * check made of it.
 *
 * **The resting state is derived from the account, not remembered.** A row
 * nobody has touched shows `valid` when the account carries a verified UUID and
 * `idle` when it does not, so eight untouched rows are not eight rows claiming a
 * check just ran. An explicit status from the caller wins, because that is a
 * check that really is in flight or really did just land.
 */
function MinecraftIdentityCell({
  gamer,
  status,
  onSave,
}: {
  gamer: GamerSessionRow;
  status?: MinecraftCheckStatus;
  onSave?: (gamerId: string, username: string) => void;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const resolvedStatus =
    status ?? (gamer.minecraft_uuid !== null ? "valid" : "idle");

  const identity = (
    <MinecraftUsernameRow
      username={gamer.minecraft_username}
      status={resolvedStatus}
      className="min-w-0 flex-1"
    />
  );

  if (onSave === undefined) return identity;

  if (draft !== null) {
    const commit = () => {
      onSave(gamer.gamer_id, draft.trim());
      setDraft(null);
    };
    return (
      // `h-7` on the row and on every control in it: the editor is exactly as
      // tall as the identity line it replaced, so opening it moves nothing.
      <div className="flex h-7 items-center gap-1.5">
        <label className="sr-only" htmlFor={inputId}>
          {t("minecraftUsernameLabel")}
        </label>
        <Input
          id={inputId}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          placeholder={t("minecraftUsernamePlaceholder")}
          className="h-7 w-40 min-w-0 flex-1 px-2 py-0 text-xs"
        />
        <Button
          type="button"
          size="sm"
          onClick={commit}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {t("minecraftUsernameSave")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDraft(null)}
          aria-label={t("minecraftUsernameCancel")}
          className="h-7 w-7 shrink-0 p-0"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="group/mc flex h-7 min-w-0 items-center gap-1">
      {identity}
      <button
        type="button"
        onClick={() => setDraft(gamer.minecraft_username ?? "")}
        aria-label={t("editMinecraftUsername", { name: gamer.first_name })}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/mc:opacity-100"
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The parent's email as a click-to-copy button, filling the row's second line.
 *
 * It is prefixed by nothing and labelled by its `aria-label`: the row is already
 * one child, and "Parent" in front of every address cost a third of the width
 * the address needed. Long addresses truncate rather than wrap — a wrapped email
 * makes each row a different height and turns a roster into a ragged column.
 */
function ParentEmailCell({ email }: { email: string }) {
  const t = useTranslations("gedu.sessionDetails");
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => void copy(email)}
      aria-label={copied ? t("emailCopied") : t("copyParentEmail", { email })}
      className={cn(
        "group flex w-full min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-muted/40 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        copied && "border-success/40 text-success",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{email}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Copy
          className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
          aria-hidden
        />
      )}
    </button>
  );
}

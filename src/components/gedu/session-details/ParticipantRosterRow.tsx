"use client";

import { useId, useState } from "react";
import { Check, Copy, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import {
  gameFigureHeight,
  GameUsernameRow,
  type GameAccountStatus,
} from "@/components/game-account";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { cn, computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import { rosterContactEmail, type ParticipantSessionRow } from "./types";

const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const;

interface ParticipantRosterRowProps {
  participant: ParticipantSessionRow;
  /**
   * Save a new Minecraft username for this child. **Omit it and the row is
   * read-only** — which is what the surfaces that only display a roster want,
   * and what keeps the edit affordance from appearing somewhere nothing is
   * listening for it.
   *
   * A trimmed empty string means "clear it".
   *
   * **Awaited.** The inline editor greys out for the round trip and closes only
   * once the write has landed; a rejection leaves it open with the typed name
   * still in the box.
   *
   * Never reached on an adult row, which renders no Minecraft cell at all.
   */
  onSaveMinecraftUsername?: (
    participantId: string,
    username: string,
  ) => void | Promise<void>;
  /**
   * Where the Mojang check for this child's name has got to, when one is in
   * flight or has just landed. Omitted, the row derives its own resting state
   * from whether the account carries a verified UUID — which is what every row
   * nobody has touched shows.
   *
   * The caller owns this rather than the row, because the check is one request
   * per save and the owner of the save is the only one who knows when it started.
   */
  minecraftStatus?: GameAccountStatus;
}

/**
 * One person on the assigned-group roster — a child, or since 00173 an adult
 * holding a seat of their own.
 *
 * **Two lines, and the split is the whole design.** Line one is identity —
 * identicon, first name, age/gender, Minecraft username. Line two is the
 * contact email on its own, because an email is the one field here with no
 * useful upper bound: `sofia.margareta.lindqvist-holmberg@kotiposti.example.com`
 * sharing a line with a name either wrapped into a ragged three-line block or
 * squeezed the name down to an ellipsis, and the rail this row lives in is a
 * third of the page. Given a line to itself it truncates from one end,
 * predictably, and the row keeps the same height whoever is in it.
 *
 * The email is still the click-to-copy button it always was — the gedu's most
 * common action on this row is mailing whoever is responsible for the seat —
 * and the "copy all" helper above the list covers the whole group.
 *
 * **The adult variant is an absence, not a set of blanks.** A parent has a
 * `Parent` badge where a child has their age and gender, their own address in
 * the contact cell (there is no linked parent to name), and *no Minecraft cell
 * whatsoever* — game-account linking for parents does not exist, so a
 * placeholder saying "none" beside a pencil that opens an editor for an account
 * that cannot be created would be an affordance pointing at nothing. Rendering
 * three empty child fields would read as a roster row that failed to load; the
 * row is shorter instead, and shorter is the honest shape. Nothing here moves
 * after paint, so the shorter row costs no layout stability: the discriminator
 * arrives with the roster, in the same payload as the name.
 *
 * **Minecraft usernames are editable here** — on child rows. Children mistype
 * them, change them, or never got round to entering one, and the gedu is the
 * person who finds out mid-session, when the name doesn't match anyone on the
 * server. So the identity line carries a pencil: quiet by default (muted, and
 * only fully opaque on hover or keyboard focus, so eight of them don't turn the
 * rail into a toolbar), but always present rather than revealed on hover, since
 * an affordance that only exists under the cursor doesn't exist on a
 * touchscreen. Opening it swaps the line for a small input *in place*, with Save
 * and Cancel to its right; nothing below moves, because the input is the same
 * height as the line it replaced — and the same is true of the check that
 * follows the save, which lands in a slot that was already holding its space.
 * The one thing that does add height is the line saying a save was refused, and
 * that is a direct answer to the button the gedu just pressed rather than
 * something arriving on the data's own schedule.
 */
export function ParticipantRosterRow({
  participant,
  onSaveMinecraftUsername,
  minecraftStatus,
}: ParticipantRosterRowProps) {
  const t = useTranslations("gedu.sessionDetails");
  const c = useTranslations("common");
  const timeZone = useTimezone();

  // The one bit that decides the variant. The RPC emits `participant_email`
  // only where participant = customer, so a non-null value *is* "this seat is
  // held by an adult" — there is no second signal to reconcile it against and
  // no role column on the roster row to disagree with it.
  const isAdult = participant.participant_email !== null;
  const contactEmail = rosterContactEmail(participant);

  const detailParts: string[] = [];
  if (participant.date_of_birth) {
    detailParts.push(
      t("age", { age: computeAge(participant.date_of_birth, timeZone) }),
    );
  }
  if (participant.gender) {
    detailParts.push(t(GENDER_KEY[participant.gender]));
  }
  const detail = detailParts.join(" · ");

  return (
    <li className="space-y-1.5 rounded-md border border-border bg-card p-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <Identicon id={participant.participant_id} size={32} />
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium leading-tight">
            <span className="truncate">{participant.first_name}</span>
            {isAdult ? (
              /* The same badge and the same word the admin surfaces use for a
                 customer profile, read off the shared role constants rather
                 than restated — a second spelling of "Parent" is a second
                 thing to translate and a second thing to forget. */
              <Badge
                className={cn(
                  ROLE_BADGE_STYLES.customer,
                  "shrink-0 px-1.5 py-0 text-[10px] font-normal",
                )}
              >
                {c(ROLE_LABEL_KEYS.customer)}
              </Badge>
            ) : (
              detail && (
                <span className="text-[11px] font-normal text-muted-foreground">
                  {detail}
                </span>
              )
            )}
          </p>
          {!isAdult && (
            <MinecraftIdentityCell
              participant={participant}
              status={minecraftStatus}
              onSave={onSaveMinecraftUsername}
            />
          )}
        </div>
      </div>
      {contactEmail !== null && <ContactEmailCell email={contactEmail} />}
    </li>
  );
}

/**
 * The child's Minecraft identity — skin, username, check state — plus the inline
 * editor it swaps for.
 *
 * The draft is seeded when the editor opens rather than held across closes, so
 * cancelling really discards. **Save holds the editor open, greyed, until the
 * write has landed** — the round trip includes a Mojang lookup, so it is a real
 * wait rather than a formality — and closes only then; the new username and the
 * verified state arrive back as props, because the caller owns the row. A
 * refused write leaves the editor open with the typed name still in the box and
 * one line saying it did not save.
 *
 * **The resting state and the figure belong to the shared row now.** It derives
 * the state from the account's own columns, so eight untouched rows are not
 * eight rows claiming a check just ran, and it draws a real skin only for a
 * verified account — the render host resolves by *name*, so a figure for an
 * unconfirmed string could quietly show a stranger's costume beside a child's
 * name. An explicit status from the caller still wins, because that is a check
 * that really is in flight or really did just land.
 *
 * **The lookup stays on the server here, unlike every other editable surface.**
 * The write this row awaits resolves the name against Mojang on its way through
 * and answers with what was stored, so a client-side check in front of it would
 * be the same question asked twice and the same rate limit paid twice. That is
 * why this cell keeps its own editor instead of the shared editable row, which
 * owns its verification — the two are different flows, not two spellings of one.
 */
function MinecraftIdentityCell({
  participant,
  status,
  onSave,
}: {
  participant: ParticipantSessionRow;
  status?: GameAccountStatus;
  onSave?: (participantId: string, username: string) => void | Promise<void>;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const identity = (
    <GameUsernameRow
      platform="minecraft"
      username={participant.minecraft_username}
      externalId={participant.minecraft_uuid}
      status={status}
      className="min-w-0 flex-1"
    />
  );

  if (onSave === undefined) return identity;

  if (draft !== null) {
    /**
     * `committing` is flipped before the caller's write is reached, so the
     * button cannot be pressed twice, and it is cleared only where the gedu
     * needs it back — the failure path — or in the same commit that closes the
     * editor for good.
     */
    const commit = async () => {
      if (committing) return;
      setFailed(false);
      setCommitting(true);
      try {
        await onSave(participant.participant_id, draft.trim());
      } catch {
        setCommitting(false);
        setFailed(true);
        return;
      }
      setCommitting(false);
      setDraft(null);
    };
    return (
      <div className="space-y-1">
        {/* The shared figure height, the same one the display row below uses, so
            entering and leaving edit mode never changes the roster row's height;
            the controls inside stay `h-7`, centered in it. Read off the constant
            rather than restated, because that height belongs to the shared row
            and has already changed once. */}
        <div className={cn("flex items-center gap-1.5", gameFigureHeight("full"))}>
          <label className="sr-only" htmlFor={inputId}>
            {t("minecraftUsernameLabel")}
          </label>
          <Input
            id={inputId}
            autoFocus
            value={draft}
            disabled={committing}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape" && !committing) setDraft(null);
            }}
            placeholder={t("minecraftUsernamePlaceholder")}
            className="h-7 w-40 min-w-0 flex-1 px-2 py-0 text-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={committing}
            onClick={() => void commit()}
            className="h-7 gap-1 px-2 text-xs"
          >
            {committing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden />
            )}
            {t("minecraftUsernameSave")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={committing}
            onClick={() => setDraft(null)}
            aria-label={t("minecraftUsernameCancel")}
            className="h-7 w-7 shrink-0 p-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
        {failed && (
          <p role="alert" className="text-[11px] text-destructive">
            {t("minecraftSaveFailed")}
          </p>
        )}
      </div>
    );
  }

  return (
    /* The row owns the height — the figure fills it exactly, so it renders
       inside the row instead of spilling into its neighbours. */
    <div
      className={cn(
        "group/mc flex min-w-0 items-center gap-1",
        gameFigureHeight("full"),
      )}
    >
      {identity}
      <button
        type="button"
        onClick={() => setDraft(participant.minecraft_username ?? "")}
        aria-label={t("editMinecraftUsername", { name: participant.first_name })}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/mc:opacity-100"
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The seat's contact address as a click-to-copy button, filling the row's
 * second line — a child's linked parent, or an adult's own address.
 *
 * It is prefixed by nothing and labelled by its `aria-label`: the row is already
 * one person, and a word in front of every address cost a third of the width the
 * address needed. Long addresses truncate rather than wrap — a wrapped email
 * makes each row a different height and turns a roster into a ragged column.
 *
 * The label deliberately does not say *whose* address it is. It said "parent"
 * until adults could hold seats; saying it now would be wrong on the rows where
 * it matters most, and saying "parent or participant" is a sentence nobody
 * wants read to them by a screen reader eight times.
 */
function ContactEmailCell({ email }: { email: string }) {
  const t = useTranslations("gedu.sessionDetails");
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => void copy(email)}
      aria-label={copied ? t("emailCopied") : t("copyContactEmail", { email })}
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

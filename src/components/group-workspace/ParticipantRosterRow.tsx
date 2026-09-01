"use client";

import { useId, useState } from "react";
import { Check, Copy, Loader2, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { GamerFlairButton, NewcomerBadge } from "@/components/member-flair";
import {
  gameFigureHeight,
  GAME_PLATFORMS,
  GameUsernameRow,
  type GameAccountStatus,
  type GamePlatform,
} from "@/components/game-account";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import { cn, computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  rosterContactEmail,
  rosterGameAccount,
  type ParticipantSessionRow,
} from "./types";

const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const;

interface ParticipantRosterRowProps {
  participant: ParticipantSessionRow;
  /**
   * Which game identity this roster is about, or `null` for a product about no
   * single game account at all.
   *
   * It is the product's, not the row's: a roster shows one platform for
   * everybody on it, decided by the topic, because the question a gedu is
   * asking mid-session is "does this name match the one on my server" and there
   * is only ever one server. `null` renders **no identity cell whatsoever** —
   * the same absence the adult variant already makes, for the same reason. A
   * blank cell beside a pencil that edits an account the product has no use for
   * is an affordance pointing at nothing, and reserving its space would leave a
   * hole in a rail that is a third of the page.
   */
  platform: GamePlatform | null;
  /**
   * Save a new username for this child, on whichever platform the roster is
   * showing. **Omit it and the row is read-only** — which is what the surfaces
   * that only display a roster want, and what keeps the edit affordance from
   * appearing somewhere nothing is listening for it.
   *
   * A trimmed empty string means "clear it".
   *
   * **Awaited.** The inline editor greys out for the round trip and closes only
   * once the write has landed; a rejection leaves it open with the typed name
   * still in the box.
   *
   * Never reached on an adult row or on a product with no platform, neither of
   * which renders an identity cell at all.
   */
  onSaveGameUsername?: (
    participantId: string,
    username: string,
  ) => void | Promise<void>;
  /**
   * When this person joined the group the roster belongs to, as an ISO stamp,
   * or `null` where that is not recorded or the badge does not apply — the
   * newcomer badge's clock.
   *
   * **This is the per-member half of the flair, and the only half that is
   * optional.** Most of a roster is past the window or was never stamped, and a
   * `null` here simply renders no badge; what a caller cannot do is decline the
   * capability, because the badge's gate is the *data* — the stamp comes off a
   * staff-scoped read, and this row is only ever drawn on a staff-only page.
   *
   * Paired with {@link flairNow} — a badge without a clock would have to invent
   * one, and a clock it invented would disagree with the page around it.
   */
  newcomerJoinedAt: string | null;
  /**
   * The instant the newcomer badge's meter is measured against — the caller's
   * request-stable clock, the same one everything else on the page answers off.
   */
  flairNow: Date;
  /**
   * Whether anything has been recorded about this person in this group — a
   * Gedu note, a creation, or both. It only lights the button at the end of the
   * row; neither value's *text* reaches this row, which merely opens the dialog
   * that holds them.
   *
   * Arrives with the roster rather than after it — so the button is painted in
   * its final state in the first frame, rather than lighting up under a reader
   * who is already looking at the row.
   */
  hasContent: boolean;
  /**
   * Whether this person still owes a creation for the group's final session —
   * the per-member itemization of a session-level obligation, which turns the
   * button's tone to warning and renames it.
   *
   * The gate is the caller's, because it is a fact about the *product* (does it
   * require creations) and its *schedule* (has the final session happened),
   * neither of which a roster row knows. Absent on every ordinary product.
   */
  owesCreation?: boolean;
  /**
   * Open this person's per-gamer dialog — the caller owns it, because one
   * roster can only have one open.
   *
   * **Every row gets it**, including the majority with nothing recorded yet:
   * opening an empty dialog *is* the add flow, and gating the affordance on
   * {@link hasContent} would leave no way to write the first note or add the
   * first creation. That is also why it is required rather than a capability a
   * caller can withhold — a roster on this page with no way in is not a state
   * the product has.
   */
  onOpenFlair: () => void;
  /**
   * Where the platform's check for this child's name has got to, when one is in
   * flight or has just landed. Omitted, the row derives its own resting state
   * from whether the account carries a confirmed key — which is what every row
   * nobody has touched shows.
   *
   * The caller owns this rather than the row, because the check is one request
   * per save and the owner of the save is the only one who knows when it started.
   */
  gameStatus?: GameAccountStatus;
  /**
   * The figure to draw, when the platform cannot derive one from the name.
   *
   * Three meanings, exactly as the shared row documents them: a string draws
   * that image, `null` draws the bundled stand-in and goes looking for nothing,
   * and **omitted lets the platform decide** — which on Minecraft is a network
   * request off the username and on Roblox is the stand-in. A Roblox roster
   * therefore always passes this explicitly, `null` included, because a Roblox
   * render can only be resolved by account id and is resolved for the whole
   * list at once by whoever owns the list. A Minecraft roster omits it.
   */
  avatarUrl?: string | null;
}

/**
 * One person on the assigned-group roster — a child, or since 00173 an adult
 * holding a seat of their own.
 *
 * **Two lines, and the split is the whole design.** Line one is identity —
 * identicon, first name, age/gender, game username. Line two is the
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
 * the contact cell (there is no linked parent to name), and *no identity cell
 * whatsoever* — game-account linking for parents does not exist, so a
 * placeholder saying "none" beside a pencil that opens an editor for an account
 * that cannot be created would be an affordance pointing at nothing. Rendering
 * three empty child fields would read as a roster row that failed to load; the
 * row is shorter instead, and shorter is the honest shape. Nothing here moves
 * after paint, so the shorter row costs no layout stability: the discriminator
 * arrives with the roster, in the same payload as the name.
 *
 * **A product about no game account makes the same absence, on every row.** The
 * topic decides which identity a roster shows, and most topics name subject
 * matter rather than one piece of software — so a programming club's roster is
 * the short row throughout. The precedent is the adult variant above and the
 * reasoning is identical: nothing is reserved for a cell that cannot appear
 * while this page is open, because the platform is a property of the product and
 * a product's topic does not change under the reader.
 *
 * **Game usernames are editable here** — on child rows. Children mistype
 * them, change them, or never got round to entering one, and the gedu is the
 * person who finds out mid-session, when the name doesn't match anyone on the
 * server. So the identity line carries a pencil: quiet by default (muted, and
 * only fully opaque on hover or keyboard focus, so eight of them don't turn the
 * rail into a toolbar), but always present rather than revealed on hover, since
 * an affordance that only exists under the cursor doesn't exist on a
 * touchscreen. Opening it swaps the line for a small input *in place*, with
 * Cancel and Save to its right in that order — the app-wide button order (root
 * `CLAUDE.md`, "Button Order") puts the affirmative rightmost. Nothing below
 * moves when the editor opens, because the input is the same height as the line
 * it replaced — and the same is true of the check that follows the save, which
 * lands in a slot that was already holding its space.
 * The one thing that does add height is the line saying a save was refused, and
 * that is a direct answer to the button the gedu just pressed rather than
 * something arriving on the data's own schedule.
 *
 * **Staff flair is a required fact of this row, not an extra.** A newcomer badge
 * on the identity line and the per-gamer dialog's button at the end of it come
 * off a staff-scoped read, and the only page that draws this row is the
 * staff-only group workspace — so the capability is never in question and the
 * row does not pretend it can be. What *is* per-member is which marks are lit: a
 * `null` join stamp renders no badge, and a member nobody has recorded anything
 * about gets the same button, dimmed. Both facts arrive in the same payload as
 * the roster, so neither lands beside a name that is already on screen.
 *
 * **The owed-creation marker is the button's third tone, not a fourth thing on
 * the row.** On a product that contractually requires a creation from every
 * member, the run's final session is not finished until they are all in, and the
 * roster is what itemizes who is missing. Toning the control that already opens
 * that member's dialog is what keeps the plan's one-authoring-surface rule true
 * — a badge beside it would be either a second way in or a mark you cannot act
 * on — and it costs no layout at all, where a new element in the trailing group
 * would have to be ordered against the ones already there.
 */
export function ParticipantRosterRow({
  participant,
  platform,
  onSaveGameUsername,
  gameStatus,
  avatarUrl,
  newcomerJoinedAt,
  flairNow,
  hasContent,
  owesCreation,
  onOpenFlair,
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

  const avatar = <Identicon id={participant.participant_id} size={32} />;

  return (
    <li className="space-y-1.5 rounded-md border border-border bg-card p-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">{avatar}</Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          {/* A div, not a p: the adult variant's Badge renders a div, and a
              block element inside a p is invalid HTML — the browser closes the
              p early and React fails hydration on the mismatch. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium leading-tight">
            <span className="truncate">{participant.first_name}</span>
            {/* Order on this line: the name, then this person's own detail,
                then their role badge, and the newcomer badge last. The middle
                slot is the child's age and gender or — on an adult row — the
                Parent badge, since a parent has no such detail; the voice room
                follows the same rule with the game username in that slot. An
                adult can be new to a group like anyone else, so this is not a
                child-only mark.

                **The newcomer badge goes last because it is the one thing here
                that can arrive late.** On this page it does not — the flair
                comes in the same payload as the roster — but the rule is shared
                with the voice room, where the overlay lands a round trip after
                the row paints, and a mark that appears at the end of the run is
                absorbed by the line's slack instead of shoving a role badge
                sideways. One order, both surfaces, and no surface has to
                remember why.

                All four queue in one wrapping line and never displace one
                another. */}
            {!isAdult && detail && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {detail}
              </span>
            )}
            {isAdult && (
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
            )}
            {/* Renders nothing for a member with no stamp or one past the
                window, which is most of a roster — the per-member gate lives
                in the badge rather than in a condition here. */}
            <NewcomerBadge joinedAt={newcomerJoinedAt} now={flairNow} />
          </div>
          {!isAdult && platform !== null && (
            <GameIdentityCell
              participant={participant}
              platform={platform}
              status={gameStatus}
              avatarUrl={avatarUrl}
              onSave={onSaveGameUsername}
            />
          )}
        </div>
        <GamerFlairButton
          name={participant.first_name}
          hasContent={hasContent}
          owesCreation={owesCreation}
          onOpen={onOpenFlair}
        />
      </div>
      {contactEmail !== null && <ContactEmailCell email={contactEmail} />}
    </li>
  );
}

/**
 * The child's identity on the product's platform — figure, username, check
 * state — plus the inline editor it swaps for.
 *
 * **One cell, either platform, and the platform is a parameter rather than a
 * fork.** Everything the two do differently — the figure's proportion, its
 * stand-in, whether a picture can be derived from a name, the brand word in the
 * copy — already lives in the shared descriptor registry, so a Roblox copy of
 * this cell would have been a second place for the interaction contract to
 * drift while restating none of the platform's actual differences.
 *
 * The draft is seeded when the editor opens rather than held across closes, so
 * cancelling really discards. **Save holds the editor open, greyed, until the
 * write has landed** — the round trip includes the platform's own lookup, so it
 * is a real wait rather than a formality — and closes only then; the new
 * username and the verified state arrive back as props, because the caller owns
 * the row. A refused write leaves the editor open with the typed name still in
 * the box and one line saying it did not save.
 *
 * **The resting state belongs to the shared row.** It derives the state from the
 * account's own columns, so eight untouched rows are not eight rows claiming a
 * check just ran. An explicit status from the caller still wins, because that is
 * a check that really is in flight or really did just land.
 *
 * **The figure is not this cell's to find, on either platform.** Minecraft
 * derives one from a verified name (its skin host is addressable by username),
 * and Roblox cannot — its renders resolve by account id, in one batched request
 * for the whole roster, so the URL is handed down. Either way the picture is a
 * prop or a derivation, never a lookup this cell makes per row.
 *
 * **The lookup stays on the server here, unlike every other editable surface.**
 * The write this row awaits resolves the name against the platform on its way
 * through and answers with what was stored, so a client-side check in front of
 * it would be the same question asked twice and the same rate limit paid twice.
 * That is why this cell keeps its own editor instead of the shared editable row,
 * which owns its verification — the two are different flows, not two spellings
 * of one.
 */
function GameIdentityCell({
  participant,
  platform,
  status,
  avatarUrl,
  onSave,
}: {
  participant: ParticipantSessionRow;
  platform: GamePlatform;
  status?: GameAccountStatus;
  avatarUrl?: string | null;
  onSave?: (participantId: string, username: string) => void | Promise<void>;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const { username, externalId } = rosterGameAccount(participant, platform);
  // The brand word the copy interpolates. Read off the descriptor rather than
  // spelled here, so the one place a platform is named is the one place it is
  // named — and it is deliberately not a translated string: "Minecraft" is
  // "Minecraft" in every locale, and the locales own the words around it.
  const platformName = GAME_PLATFORMS[platform].name;

  const identity = (
    <GameUsernameRow
      platform={platform}
      username={username}
      externalId={externalId}
      status={status}
      avatarUrl={avatarUrl}
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
        <div
          className={cn("flex items-center gap-1.5", gameFigureHeight("full"))}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t("gameUsernameLabel", { platform: platformName })}
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
            // The same transport bound the shared editable row carries — this
            // input is bespoke to the roster, so it has to restate it or a gedu
            // is the one person who can type past the wire schema and only find
            // out on save.
            maxLength={GAME_USERNAME_MAX_LENGTH}
            placeholder={t("gameUsernamePlaceholder", {
              platform: platformName,
            })}
            className="h-7 w-40 min-w-0 flex-1 px-2 py-0 text-xs"
          />
          {/* Cancel then Save — the app-wide button order (root `CLAUDE.md`,
              "Button Order") puts the affirmative last, so it reads rightmost.
              This row never stacks, so it needs no `flex-col-reverse`. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={committing}
            onClick={() => setDraft(null)}
            aria-label={t("gameUsernameCancel")}
            className="h-7 w-7 shrink-0 p-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
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
            {t("gameUsernameSave")}
          </Button>
        </div>
        {failed && (
          <p role="alert" className="text-[11px] text-destructive">
            {t("gameSaveFailed")}
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
        "group/game flex min-w-0 items-center gap-1",
        gameFigureHeight("full"),
      )}
    >
      {identity}
      <button
        type="button"
        onClick={() => setDraft(username ?? "")}
        aria-label={t("editGameUsername", {
          name: participant.first_name,
          platform: platformName,
        })}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/game:opacity-100"
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
        copied && "border-success text-success",
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

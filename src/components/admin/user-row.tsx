import Link from "next/link";
import {
  FileWarning,
  MailCheck,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { gamerUsernameFromEmail, hasRealEmail } from "@/lib/gamer-sign-in";
import type { GamerSignIn, UserRole } from "@/types";

interface UserRowUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  /** When the address was confirmed from the recipient's own inbox, or null. */
  email_verified_at: string | null;
  role: UserRole;
}

/**
 * What is *missing* from an educator's standing — the negative half of the row,
 * and the only half either of these two facts ever prints.
 *
 * It arrives as one object rather than as two independent flags because the two
 * marks are rendered as one block: see the ordering note in `UserRow` for why
 * the block is atomic and what it costs to split it.
 */
export interface GeduStandingWarnings {
  /** Has not accepted the contract version in force. */
  contract: boolean;
  /** No acceptable criminal record extract has been recorded. */
  criminalRecordCheck: boolean;
}

interface UserRowProps {
  user: UserRowUser;
  linkedGamers?: UserRowUser[];
  /** Base path for user detail links. Defaults to "/admin/users" */
  basePath?: string;
  /**
   * Whether an admin has certified this educator: `true` shows the mark, `false`
   * withholds it, and `null` means the answer is unknown — the read failed, or
   * this row is not a gedu and the question does not arise. Three states rather
   * than two because "not certified" and "we could not find out" must not
   * collapse into each other; only a positive answer may print the mark.
   */
  certified?: boolean | null;
  /**
   * What this educator's standing is missing, or `null` where that is not
   * known — either read failed, either read has not answered yet, or the row is
   * not a gedu.
   *
   * Same three-state honesty as `certified` and for the same reason: a warning
   * mark is a claim that somebody has *not* done something, and a read that did
   * not land cannot support one. `null` is not "nothing missing"; it is
   * silence.
   */
  standingWarnings?: GeduStandingWarnings | null;
  /**
   * Every gamer's sign-in mode, keyed by user id — for this row's own user and
   * for each nested child alike, which is why it is a lookup rather than a value
   * on `UserRowUser`.
   *
   * A missing entry is silence, not `parent`: an unanswered read prints no
   * identity line rather than asserting a child has no credential. The page
   * holds its skeleton until this has landed, so in practice the only missing
   * entries are the accounts that genuinely have no `gamer_profiles` row.
   */
  gamerSignIns?: ReadonlyMap<string, GamerSignIn>;
}

/**
 * What to print under a person's name: an address, a username, or nothing.
 *
 * One function for the two places a person appears in this component — the row
 * itself and the nested children under a parent — so a child cannot be described
 * one way in the list and another way two lines further down.
 */
function identityLine(
  user: UserRowUser,
  signIn: GamerSignIn | undefined,
): { kind: "email" | "username"; value: string } | null {
  if (hasRealEmail({ role: user.role, sign_in: signIn ?? null })) {
    return user.email ? { kind: "email", value: user.email } : null;
  }
  if (signIn !== "username") return null;
  const username = gamerUsernameFromEmail(user.email);
  return username ? { kind: "username", value: username } : null;
}

/**
 * One admin users-list row.
 *
 * **Four marks that mean four different things, in a fixed order.** Left to
 * right, always: the unsigned-contract warning, the missing-record-check
 * warning, the certification shield, the email check — then the role badge and
 * the chevron. The shield is about a *person* an admin has vouched for and the
 * green check is about an *address* confirmed by whoever reads that inbox; the
 * two warnings are about things the educator has not done yet. An educator can
 * carry any combination, so the order never varies with which of them are
 * present. Scanning a column of rows only works if a given mark is always in
 * the same place.
 *
 * **The two warnings show regardless of certification, and that is the point.**
 * They are not a pre-certification checklist — neither gates anything — they
 * are how a certified educator who never signed the terms or never presented an
 * extract is findable at all. Hiding them behind "not yet certified" would hide
 * exactly the accounts worth finding: the legacy ones certified before either
 * fact was recorded.
 *
 * **The order is load-bearing and this list is right-packed, so nothing here
 * may be reordered on aesthetic grounds.** The group sits at the row's right
 * edge, so a mark that arrives after first paint has to be inserted at the
 * *left* end or it pushes the marks already painted sideways. Both warnings and
 * the shield arrive late, from two different reads; the shield's read is one of
 * the two the warnings wait for, so the warnings can never land first, and
 * putting them leftmost is what makes both arrivals grow the group leftward
 * into the row's slack. That is also why the warnings arrive as **one object**
 * rather than two flags: their two reads can resolve in either order, and a
 * caller that rendered each as it landed would let the second one push the
 * first across the row.
 *
 * A gamer gets the email check only when their address is a real mailbox — that
 * is, in sign-in mode `email`. Every other child holds a synthetic
 * `@gamer.sogverse.internal` handle, so there is no inbox to confirm it from and
 * a check would be asserting something nobody did. The other three marks are
 * questions only an educator's row raises.
 *
 * **The line under a name follows the same fact.** A child with a mailbox shows
 * it; a child in `username` mode shows the username their parent chose, labelled
 * as one so it is not read as a truncated address; a switch-only child shows
 * nothing, because their handle is a string nobody has ever seen.
 *
 * **Every mark is printed only on a definite answer.** A mark is a claim
 * somebody made, so the absence of an answer has to read as silence rather than
 * as its opposite — see `certified` and `standingWarnings` for the three states
 * that keeps honest.
 */
export function UserRow({
  user,
  linkedGamers,
  basePath = "/admin/users",
  certified,
  standingWarnings,
  gamerSignIns,
}: UserRowProps) {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const contract = useTranslations('admin.geduContract');
  const check = useTranslations('admin.geduCriminalRecordCheck');
  const identity = identityLine(user, gamerSignIns?.get(user.id));
  const emailVerified =
    hasRealEmail({ role: user.role, sign_in: gamerSignIns?.get(user.id) ?? null }) &&
    user.email_verified_at !== null;
  const warnings = user.role === "gedu" ? standingWarnings ?? null : null;
  return (
    <div className="rounded-lg border">
      <Link
        href={`${basePath}/${user.id}`}
        className="group flex items-center justify-between p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div className="flex items-center gap-4">
          <Avatar>
            <Identicon id={user.id} size={40} />
          </Avatar>
          <div>
            <p className="font-medium">
              {(user.role !== "gamer"
                ? [user.first_name, user.last_name].filter(Boolean).join(" ")
                : user.first_name) || t('unnamedUser')}
            </p>
            {identity && <IdentityLine identity={identity} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {warnings?.contract && (
            <StandingMark
              icon={FileWarning}
              tone="warning"
              label={contract('rowNotAccepted')}
            />
          )}
          {warnings?.criminalRecordCheck && (
            <StandingMark
              icon={Scale}
              tone="warning"
              label={check('rowNotRecorded')}
            />
          )}
          {user.role === "gedu" && certified === true && (
            <StandingMark
              icon={ShieldCheck}
              tone="success"
              label={t('certification.certified')}
            />
          )}
          {emailVerified && (
            <StandingMark
              icon={MailCheck}
              tone="success"
              label={t('emailVerified')}
            />
          )}
          <Badge className={ROLE_BADGE_STYLES[user.role]}>
            {c(ROLE_LABEL_KEYS[user.role])}
          </Badge>
          <NavChevron />
        </div>
      </Link>

      {user.role === "customer" && (!linkedGamers || linkedGamers.length === 0) && (
        <div className="border-t bg-muted/30 py-3 pl-14 pr-4">
          <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
        </div>
      )}

      {linkedGamers && linkedGamers.length > 0 && (
        <div className="border-t bg-muted/30">
          {linkedGamers.map((gamer) => {
            const gamerIdentity = identityLine(gamer, gamerSignIns?.get(gamer.id));
            return (
            <Link
              key={gamer.id}
              href={`${basePath}/${gamer.id}`}
              className="group flex items-center justify-between py-3 pr-4 pl-14 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <Identicon id={gamer.id} size={28} />
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {gamer.first_name || t('unnamedGamer')}
                  </p>
                  {gamerIdentity && <IdentityLine identity={gamerIdentity} />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${ROLE_BADGE_STYLES.gamer} text-[10px] px-2 py-0`}>
                  {c("roleGamer")}
                </Badge>
                <NavChevron size="sm" />
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The line under a name: an address as itself, a username with a word saying so.
 *
 * The label is what stops `lily2015` reading as a mangled email in a column
 * where every other line is one. It is small and muted furniture rather than
 * prose — a marker an admin scans past, not a sentence — which is why it takes
 * the caps treatment the root file permits for exactly that (root `CLAUDE.md`,
 * "Styling": eyebrows, pills and field labels may be capped; headings may not).
 */
function IdentityLine({
  identity,
}: {
  identity: { kind: "email" | "username"; value: string };
}) {
  const t = useTranslations("admin.users");
  if (identity.kind === "email") {
    return <p className="text-sm text-muted-foreground">{identity.value}</p>;
  }
  return (
    <p className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
      <span className="text-[10px] uppercase tracking-wide">
        {t("usernameLabel")}
      </span>
      <span className="truncate">{identity.value}</span>
    </p>
  );
}

/**
 * One standing mark in the row's right-packed group.
 *
 * **The label is carried twice, and both are needed.** `aria-label` on a
 * `role="img"` wrapper is what a screen reader announces; the native `title` is
 * what a mouse gets on hover, and this is a desk surface an admin scans a whole
 * column of — a glyph that only announces itself to assistive tech is a glyph a
 * sighted admin has to learn by opening a row. They take the same string
 * deliberately: one meaning, one wording, no second phrasing to keep in step.
 *
 * The wrapper exists because the icons do not take a `title` prop; it is a
 * `flex` span the same size as the glyph, so the group's spacing is unchanged.
 * The icon itself is `aria-hidden` — the wrapper is already the image, and
 * labelling both would announce it twice.
 */
function StandingMark({
  icon: Icon,
  tone,
  label,
}: {
  icon: LucideIcon;
  tone: "success" | "warning";
  label: string;
}) {
  return (
    <span role="img" aria-label={label} title={label} className="flex">
      <Icon
        className={`h-4 w-4 ${tone === "success" ? "text-success" : "text-warning"}`}
        aria-hidden
      />
    </span>
  );
}

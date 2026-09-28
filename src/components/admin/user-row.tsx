import { Link } from "@/i18n/navigation";
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
import type { UserRole } from "@/types";
import { ROUTES } from "@/lib/constants";

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
  /**
   * Whether an admin has certified this educator: `true` shows the mark,
   * `false` withholds it.
   *
   * **Two states, because the flag rides along on the row it is about.** It
   * used to be three — a `null` for "the certification read failed, so we know
   * nothing about anybody" — and that state went with the read: the list's own
   * query carries the flag now, so a row on screen has a definite answer and a
   * row with no answer is not on screen at all. Meaningless on a non-gedu row,
   * which is what `role` is for.
   */
  certified?: boolean;
  /**
   * What this educator's standing is missing, or `null` where that is not
   * known — the acceptance read failed, it has not answered yet, or the row is
   * not a gedu.
   *
   * Three states rather than two, and this is the only mark that still needs
   * them: a warning is a claim that somebody has *not* done something, and a
   * read that did not land cannot support one. `null` is not "nothing
   * missing"; it is silence.
   */
  standingWarnings?: GeduStandingWarnings | null;
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
 * *left* end or it pushes the marks already painted sideways. The shield and
 * the green check come with the row and are on screen from its first frame;
 * the two warnings are the only late arrivals, because one of their facts is
 * contract acceptance, which is a separate read. Putting them leftmost is what
 * makes that arrival grow the group leftward into the row's slack rather than
 * shove the marks beside it. That is also why they arrive as **one object**
 * rather than two flags: rendered independently, the late half would push the
 * half that came with the row across the row.
 *
 * A gamer gets none of them, and prints no address either. A child's stored
 * address is either a synthetic `@gamer.sogverse.internal` handle nobody has
 * ever seen or a mailbox whose confirmation is a detail of that child's own
 * account, so a check here would assert something nobody did and an address
 * here would be noise in a column an admin scans by name — the user detail page
 * is where a child's credentials are read. The other three marks are questions
 * only an educator's row raises.
 *
 * **Every mark is printed only on a definite answer.** A mark is a claim
 * somebody made, so the absence of an answer has to read as silence rather than
 * as its opposite — see `standingWarnings` for the three states that keeps
 * honest, and `certified` for why that mark no longer needs them.
 */
export function UserRow({
  user,
  linkedGamers,
  certified,
  standingWarnings,
}: UserRowProps) {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const contract = useTranslations('admin.geduContract');
  const check = useTranslations('admin.geduCriminalRecordCheck');
  const emailVerified = user.role !== "gamer" && user.email_verified_at !== null;
  const warnings = user.role === "gedu" ? standingWarnings ?? null : null;
  return (
    <div className="rounded-lg border border-border">
      <Link
        href={ROUTES.admin.user(user.id)}
        className="group flex items-center justify-between p-4 transition-colors hover:bg-hover hover:text-foreground"
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
            {user.role !== "gamer" && user.email && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
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
          <Badge variant="outline" className={ROLE_BADGE_STYLES[user.role]}>
            {c(ROLE_LABEL_KEYS[user.role])}
          </Badge>
          <NavChevron />
        </div>
      </Link>

      {user.role === "customer" && (!linkedGamers || linkedGamers.length === 0) && (
        <div className="border-t border-border py-3 pl-14 pr-4">
          <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
        </div>
      )}

      {/* The children sit on the parent's own ground, marked by the indent and
          the divider and never by a lift: a lifted run of rows reads as a
          different kind of thing from the row above it, and the hover layer
          would then land on two grounds at once, so one list would answer the
          pointer in two colours. */}
      {linkedGamers && linkedGamers.length > 0 && (
        <div className="border-t border-border">
          {linkedGamers.map((gamer) => (
            <Link
              key={gamer.id}
              href={ROUTES.admin.user(gamer.id)}
              className="group flex items-center justify-between py-3 pr-4 pl-14 transition-colors hover:bg-hover hover:text-foreground"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <Identicon id={gamer.id} size={28} />
                </Avatar>
                <p className="text-sm font-medium">
                  {gamer.first_name || t('unnamedGamer')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`${ROLE_BADGE_STYLES.gamer} text-[10px] px-2 py-0`}>
                  {c("roleGamer")}
                </Badge>
                <NavChevron size="sm" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
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

/**
 * Question 3 — the role chip.
 *
 * **Where this came from, in the owner's words.** The reference branch dressed
 * the four role badges in brand and Yty colours (gamer act, parent Harmony
 * strong, gedu Wit soft, admin ink) and the owner liked how they looked, which
 * raised the real question: **could roles take Yty colours as a UI grammar
 * throughout the app?** With one qualification the owner made themselves — role
 * colours are seen mostly by admins, "but that's not to say it's a rule".
 *
 * **The grammar's own sentence is what makes this a question with an answer.**
 * A role is one of the three facts the tone grammar names first — "a role, a
 * product kind, a Yty element, a status" — so a role takes a row in
 * `grammar.ts` whatever it wears, and what is being ruled here is only what
 * goes in the row's colour slot. Two rules constrain it:
 *
 * - **One meaning per hue, per surface.** A hue may carry two meanings across
 *   two surfaces that never meet; it may not carry two on one screen.
 * - **Meaning never travels by hue alone.** A colour-coded thing carries a
 *   glyph and a label, so a reader who cannot see the colour loses nothing.
 *   Today's badges are a word on a fill and no mark at all, which means every
 *   shape below gains a glyph — including the shape that changes no colour.
 *
 * **Where a role badge renders today.** `ROLE_BADGE_STYLES` in
 * `lib/constants/roles.ts` is the one recipe and nine surfaces read it —
 * regenerate the list rather than trusting this one:
 *
 *     grep -rn "ROLE_BADGE_STYLES" src --include=*.tsx --include=*.ts
 *
 * | file | what it draws |
 * |---|---|
 * | `admin/user-row.tsx` | the users table's row badge, and the gamer badge on a linked child's sub-row |
 * | `admin/users/page.tsx` | the role filter pills — the *selected* pill wears the role's own fill |
 * | `admin/users/[id]/page.tsx` | the profile header, plus the linked gamer and parent badges |
 * | `admin/products/groups/participant-chip.tsx` | the parent chip in the group planner |
 * | `admin/products/participant-picker-sheet.tsx` | the parent row in the picker |
 * | `group-workspace/ParticipantRosterRow.tsx` | the gedu/admin group roster's parent badge |
 * | `voice/ParticipantRow.tsx` | the voice room's parent badge |
 * | `admin/ui-components/page.tsx` | the style guide's own row of all four |
 *
 * **Eight of those nine are staff surfaces, and the ninth is why this is not
 * simply an admin decision.** The voice room's participant row is seen by
 * gamers and parents in a live session, and it sits directly beside the zone
 * list, whose tiles are the four Yty families at full value. That one surface
 * is where a role hue and an element hue meet in the same frame, so it is drawn
 * here with the zones beside it rather than described.
 *
 * **A tenth site is not a badge and matters more than most of them.**
 * `admin/dashboard/users-strip.tsx` already keys a glyph per role — customer
 * `Users`, gamer `Gamepad2`, gedu `GraduationCap`, admin `ShieldCheck` — which
 * is half of a `ROLE_GRAMMAR` row, decided in a page and never ruled. Three of
 * its four are unavailable to a grammar row, which is what the glyph choices
 * below turn on.
 *
 * ## The glyphs, and what each one is picked against
 *
 * A role glyph has to clear three sets it will share a screen with: the kind
 * glyphs (`Gamepad2`, `School`, `Tent`, `PartyPopper`), the element glyphs
 * (`Heart`, `Lighthouse`, `Handshake`, `Brain`) and the forty custom-zone icons
 * a moderator may pick from in the very room this is drawn in.
 *
 * - **Gamer → `User`.** The single person. `Gamepad2` is what the strip uses
 *   and it is spoken for: it is the consumer club's kind glyph, so an admin
 *   would meet the same mark as a role on one page and as a product kind on the
 *   next. `Joystick` is in the zone picker. What is left is the plain person,
 *   which is also the honest reading — a gamer is a person here, not a device.
 * - **Parent → `Users`.** Two people, which is what a parent *is* in this
 *   product: an adult with children linked to them. This is the strip's own
 *   glyph and the one of the four that survives unchanged.
 * - **Gedu → `Compass`.** A guide, and the brand's own word for the role is
 *   "Scouts of the Online Age". `GraduationCap` (the strip's) is school
 *   vocabulary in a product whose copy bans "course", "curriculum" and "class",
 *   and it sits one step from `School`, which is already the municipality
 *   club's kind glyph. The compass is the scout's mark and collides with
 *   nothing.
 * - **Admin → `KeyRound`.** Who holds the keys to the platform. `Shield` and
 *   `ShieldCheck` are unavailable and the users table is where you can see why:
 *   `ShieldCheck` is already the *gedu certification* mark on that very row, so
 *   an admin badge in a shield would put two shields on one line meaning two
 *   different things. `Wrench` is in the zone picker.
 *
 * The four are deliberately four different silhouettes rather than four
 * variants of one person mark: a role chip is read at 10–12px, where
 * `UserRoundCog` and `UserRoundCheck` are the same smudge.
 *
 * ## The three shapes, and why these three
 *
 * Each is drawn in three places: the four chips together, three rows of the
 * admin users table, and the voice roster beside the zone tiles. The first
 * column of every row is what the app does today.
 *
 * 1. **Neutral figure chips.** The chip shape the owner already picked out —
 *    `public/products/status-chip.tsx`: a neutral edge, the page ground, a
 *    glyph and the word — with the word in ink. It answers the question with
 *    "no": a role is told by its mark and its name, and no hue is spent on it
 *    at all. It is the only shape that cannot collide with anything, and it is
 *    drawn first so the other two are judged against what is gained by
 *    spending a colour rather than against today's fills alone.
 * 2. **The brand pair for people.** Gamer act, gedu world, parent and admin
 *    neutral: the two roles that *are* Sogverse to a reader take the two
 *    signature colours, and the two that administer it stay ink. It is close to
 *    today, which already spends act and world on gamer and parent, and it
 *    keeps the four families free for what they already code. Drawn twice —
 *    as figure chips and as today's filled badges — because that is the one
 *    place in this question where figure-and-fill can be seen on the same hues
 *    at the same size, and act's ink label and world's white one are the two
 *    fills the palette actually offers.
 * 3. **The families**, as the reference branch had them: gamer Glow, parent
 *    Harmony, gedu Wit, admin neutral. Matched on the elements' own meanings:
 *    Glow is the relationship with others and a gamer's whole reason for being
 *    here is the people they play beside; Harmony is the relationship with
 *    yourself, which is the balance a parent holds on a child's behalf; Wit is
 *    the relationship with technology, which is what a gedu teaches. Admin
 *    takes no family, which leaves Valor unspent and says so: an admin is not
 *    a relationship a child has.
 *
 * **The permutation was considered and is not drawn.** Swapping gamer and
 * parent (gamer Harmony, the relationship with yourself; parent Glow, the
 * relationship with others) reads as well on the elements' definitions, and it
 * changes nothing that this page can decide: the same four hues land on the
 * same four rows, so both mappings collide identically with everything below.
 * A second column would be two pictures of one question, and the question it
 * asks — which of two element meanings a role is *about* — is answered in
 * prose or not at all.
 *
 * ## The collision, which is the whole of the third shape's cost
 *
 * **In the voice room**, drawn: the zone list is the four families at full
 * value, one tile each, and a gamer standing in the Glow zone would wear a Glow
 * chip that means "gamer" while sitting inside a Glow tile that means "Glow".
 * The glyph-and-label rule is what keeps that survivable — the chip says
 * "Gamer" beside a person mark, the tile says "Glow" beside a lighthouse — but
 * it is survivable rather than free, and the room is the one place a *child*
 * meets both. The brand pair has a weaker version of the same problem and the
 * neutral shape has none.
 *
 * **On admin surfaces**, not drawn here because the kinds are not on this
 * page: the product kinds already spend all four families (consumer club Glow,
 * municipality club Wit, camp Valor, event Harmony), and three of the four
 * role rows in the families shape land on a hue a kind already owns — gamer on
 * the consumer club's green, gedu on the municipality club's blue, parent on
 * the event's pink. An admin's group page carries both facts at once, so this
 * is the surface where one-meaning-per-hue is genuinely spent twice.
 *
 * ## What each shape lands
 *
 * Whichever wins, two things land with it. A **`ROLE_GRAMMAR` row** joins the
 * kind and element rows in `grammar.ts`, holding the glyph and — if the shape
 * has one — the family or brand colour; and Sogverse's `ROLE_BADGE_STYLES`
 * stops being a table of class strings and reads the library, so a role's
 * appearance changes in one place for all nine surfaces.
 *
 * **The gedu gradient is retired by all three.** `bg-gradient-to-r from-act
 * to-world` is the only place in the app that blends the two signature colours
 * at their authored values, and every shape here replaces it — with ink, with
 * world, or with Wit. Question 2 rules it on its own terms as a gradient; this
 * section is where it stops existing whichever way that goes.
 *
 * Per shape, beyond those two:
 *
 * - **Neutral figure**: the four rows carry a glyph and nothing else, the badge
 *   becomes the chip, and the role filter pills lose the fills they light up
 *   with. No hue is spent, so nothing anywhere has to be checked for a
 *   collision again.
 * - **The brand pair**: act and world stay where they are and gain marks;
 *   parent moves off world to neutral in the figure variant, which is the one
 *   real change to what an admin sees today. Act on a role chip has to be
 *   weighed against act's own rule — one amber thing on a screen is the thing
 *   to press — and a users table is a page of amber chips that are not.
 * - **The families**: three families gain a second meaning, and the two
 *   surfaces above are where that is paid for.
 *
 * ## How this is drawn
 *
 * Every class string is the app's own, from `ui/badge.tsx`,
 * `public/products/status-chip.tsx`, `admin/user-row.tsx`,
 * `voice/ParticipantRow.tsx` and `voice/ZoneList.tsx`. Two mechanical edits:
 * the border *colour* moves into each column, because two `border-*` utilities
 * in one class list resolve by stylesheet order rather than by the order they
 * are written; and the zone card's active glow is written as the inline
 * box-shadow that `.zone-glow` sets in Sogverse's stylesheet, which the demo
 * does not import.
 *
 * **The identicon is drawn as an empty `lifted` tile**, in the users rows and
 * in the zone tiles alike. It is artwork with its own four colours rather than
 * an icon, and standing a glyph in for it here would put a person mark inside
 * the avatar directly beside a person mark inside the chip.
 *
 * **The roster's `today` column badges only the parent, because that is what
 * the room does**: the voice row carries a badge for `customer` and for nobody
 * else. Every candidate column badges all three, which is the shape of the
 * question — a role grammar throughout the app puts two more chips into a
 * child's live session — so what the columns compare is both the hue and the
 * two chips that are not there today.
 *
 * **The fill columns carry no glyph, because today's badges carry none.** The
 * glyph-and-label rule is satisfied on a fill by the word the fill is under;
 * what the figure columns show is the same rule met without spending a ground.
 */

import {
  Compass,
  KeyRound,
  MailCheck,
  Mic,
  ShieldCheck,
  User,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  BRAND,
  NEUTRALS,
  statusHex,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../../src/tokens/brand";
import { YTY_ELEMENT_GRAMMAR } from "../../../src/tokens/grammar";
import { Case, Compare, Exemplar, Glyph, INK, Panel, Question } from "./parts";

// ------------------------------------------------------------------ the roles

/** The four, spelled as the database's own role identifiers. */
type RoleId = "gamer" | "customer" | "gedu" | "admin";

/**
 * The order the four are drawn in: the two roles a family holds, then the two
 * that run the platform. It is the order the badges read in on the style guide
 * and the order the shapes' arguments run in.
 */
const ROLE_ORDER = [
  "gamer",
  "customer",
  "gedu",
  "admin",
] as const satisfies readonly RoleId[];

/** The word on the chip — `common.role*` in the message files, at `en`. */
const ROLE_WORD: Record<RoleId, string> = {
  gamer: "Gamer",
  customer: "Parent",
  gedu: "Gedu",
  admin: "Admin",
};

/** The mark each role would carry. The reasoning is in this file's header. */
const ROLE_GLYPH: Record<RoleId, LucideIcon> = {
  gamer: User,
  customer: Users,
  gedu: Compass,
  admin: KeyRound,
};

// ----------------------------------------------------------------- the shapes

const ACT = BRAND.act.hex;
const ACT_INK = BRAND.act.foreground;
const WORLD = BRAND.world.hex;
const WORLD_INK = BRAND.world.foreground;
const GROUND = NEUTRALS.background.hex;

/**
 * How one shape dresses one role.
 *
 * `classes` is the ground, the edge and the word's colour together, because a
 * fill and its ink are one decision. `ink` is the same decision for the glyph,
 * which cannot take a class here: the page draws its marks as SVG with an
 * explicit stroke. A shape that draws no glyph still names one, so a column
 * moved from fill to figure does not have to invent the value.
 */
interface Dress {
  readonly classes: string;
  readonly ink: string;
}

/**
 * One column: what the app does today, or one shape of the question.
 *
 * `glyphs` decides both the mark and the chip's own metrics, because the two
 * travel together — a shape with a mark is the status chip and a shape without
 * one is the badge, and each column is class-for-class the component it is
 * copied from rather than one shape wearing another's padding.
 *
 * `everyRoleInTheRoom` is false only for today, where the voice roster badges
 * the parent and nobody else.
 */
interface Shape {
  readonly label: string;
  readonly glyphs: boolean;
  readonly everyRoleInTheRoom: boolean;
  readonly dress: Record<RoleId, Dress>;
}

/** `ui/badge.tsx` — the filled badge, with its border colour moved per column. */
const BADGE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";

/** `public/products/status-chip.tsx` at `sm` — the figure chip. */
const CHIP =
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";

/** The same two at the voice row's scale, which shrinks the badge it draws. */
const BADGE_ROW =
  "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-normal";
const CHIP_ROW =
  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-normal";

const TODAY: Shape = {
  label: "today · fills",
  glyphs: false,
  everyRoleInTheRoom: false,
  dress: {
    gamer: { classes: "border-border bg-act text-act-foreground shadow", ink: ACT_INK },
    customer: { classes: "border-border bg-world text-world-foreground", ink: WORLD_INK },
    gedu: {
      classes:
        "border-border bg-gradient-to-r from-act to-world text-world-foreground",
      ink: WORLD_INK,
    },
    admin: { classes: "border-border bg-foreground text-background", ink: GROUND },
  },
};

const NEUTRAL: Shape = {
  label: "neutral · figure",
  glyphs: true,
  everyRoleInTheRoom: true,
  dress: {
    gamer: { classes: "border-border bg-background text-foreground", ink: INK },
    customer: { classes: "border-border bg-background text-foreground", ink: INK },
    gedu: { classes: "border-border bg-background text-foreground", ink: INK },
    admin: { classes: "border-border bg-background text-foreground", ink: INK },
  },
};

const PAIR_FIGURE: Shape = {
  label: "brand pair · figure",
  glyphs: true,
  everyRoleInTheRoom: true,
  dress: {
    gamer: { classes: "border-border bg-background text-act", ink: ACT },
    customer: { classes: "border-border bg-background text-foreground", ink: INK },
    gedu: { classes: "border-border bg-background text-world", ink: WORLD },
    admin: { classes: "border-border bg-background text-foreground", ink: INK },
  },
};

const PAIR_FILL: Shape = {
  label: "brand pair · fills",
  glyphs: false,
  everyRoleInTheRoom: true,
  dress: {
    gamer: { classes: "border-border bg-act text-act-foreground", ink: ACT_INK },
    customer: { classes: "border-border bg-lifted text-foreground", ink: INK },
    gedu: { classes: "border-border bg-world text-world-foreground", ink: WORLD_INK },
    admin: { classes: "border-border bg-foreground text-background", ink: GROUND },
  },
};

const FAMILIES: Shape = {
  label: "families · figure",
  glyphs: true,
  everyRoleInTheRoom: true,
  dress: {
    gamer: {
      classes: "border-border bg-background text-yty-glow",
      ink: YTY_FAMILIES.glow.hex,
    },
    customer: {
      classes: "border-border bg-background text-yty-harmony",
      ink: YTY_FAMILIES.harmony.hex,
    },
    gedu: {
      classes: "border-border bg-background text-yty-wit",
      ink: YTY_FAMILIES.wit.hex,
    },
    admin: { classes: "border-border bg-background text-foreground", ink: INK },
  },
};

const SHAPES: readonly Shape[] = [
  TODAY,
  NEUTRAL,
  PAIR_FIGURE,
  PAIR_FILL,
  FAMILIES,
];

/** The chip itself, at either of the two scales the app draws it at. */
function RoleChip({
  shape,
  role,
  scale,
}: {
  shape: Shape;
  role: RoleId;
  scale: "table" | "row";
}) {
  const dress = shape.dress[role];
  const base = shape.glyphs
    ? scale === "row"
      ? CHIP_ROW
      : CHIP
    : scale === "row"
      ? BADGE_ROW
      : BADGE;
  return (
    <span className={`${base} ${dress.classes}`}>
      {shape.glyphs && (
        <Glyph
          icon={ROLE_GLYPH[role]}
          size={scale === "row" ? 10 : 12}
          colour={dress.ink}
        />
      )}
      {ROLE_WORD[role]}
    </span>
  );
}

/** One exemplar drawn once per shape, so the five columns compare themselves. */
function Row({
  file,
  page,
  render,
}: {
  file: string;
  page: string;
  render: (shape: Shape) => React.ReactNode;
}) {
  return (
    <Compare columns={5}>
      {SHAPES.map((shape) => (
        <Panel key={shape.label} label={shape.label}>
          <Exemplar file={file} page={page}>
            {render(shape)}
          </Exemplar>
        </Panel>
      ))}
    </Compare>
  );
}

// ------------------------------------------------------------- the four chips

/**
 * `lib/constants/roles.ts` — the four, on the card ground they are met on.
 *
 * Drawn together and away from any row because a role chip's first job is to
 * be told apart from the other three at a glance, in a table an admin scans a
 * column of. It is also the only drawing in the section that shows the admin
 * chip: neither context below has an admin in it, since the users table's three
 * rows are the three roles a real page is full of and an admin does not join a
 * child's voice room.
 */
function RoleChips({ shape }: { shape: Shape }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {ROLE_ORDER.map((role) => (
          <RoleChip key={role} shape={shape} role={role} scale="table" />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------- the admin users table

/**
 * `admin/user-row.tsx` — three rows of the users table, inside the card the
 * list sits in.
 *
 * The gedu's row carries its certification mark and the parent's its
 * email-verified mark, both drawn as the app draws them (`text-success`), and
 * they are not decoration here: the certification mark is a `ShieldCheck` on
 * the same line as the role chip, which is the reason the admin chip cannot
 * have a shield.
 *
 * A gamer's row shows the username line rather than an address, because a child
 * in `username` sign-in holds a synthetic handle and the row labels it as one.
 */
interface Person {
  readonly name: string;
  readonly role: RoleId;
  readonly line: string;
  readonly username?: boolean;
  readonly mark?: LucideIcon;
}

const USERS: readonly Person[] = [
  { name: "Lotta Virtanen", role: "gedu", line: "lotta@sog.gg", mark: ShieldCheck },
  { name: "Mikko Korhonen", role: "customer", line: "mikko@esimerkki.fi", mark: MailCheck },
  { name: "Aino", role: "gamer", line: "aino2015", username: true },
];

function UsersTable({ shape }: { shape: Shape }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="space-y-4">
        {USERS.map((person) => (
          <div key={person.name} className="rounded-lg border border-border">
            <span className="group flex items-center justify-between p-4">
              <span className="flex min-w-0 items-center gap-4">
                {/* The identicon's slot: artwork, not a glyph. See the header. */}
                <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-md bg-lifted" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{person.name}</span>
                  {person.username === true ? (
                    <span className="flex items-baseline gap-1.5 text-sm text-muted-foreground">
                      <span className="text-[10px] uppercase tracking-wide">
                        Username
                      </span>
                      <span className="truncate">{person.line}</span>
                    </span>
                  ) : (
                    <span className="block truncate text-sm text-muted-foreground">
                      {person.line}
                    </span>
                  )}
                </span>
              </span>
              <span className="ml-2 flex shrink-0 items-center gap-2">
                {person.mark !== undefined && (
                  <Glyph
                    icon={person.mark}
                    size={16}
                    colour={statusHex("success")}
                  />
                )}
                <RoleChip shape={shape} role={person.role} scale="table" />
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------- the voice roster and the zone list

/**
 * `voice/ZoneList.tsx` and `voice/ParticipantRow.tsx` — the room as a gamer or
 * a parent meets it, on a phone: the zone stack, and the roster under it.
 *
 * The two are drawn in one panel because the collision is between them and not
 * inside either. The four Yty zones are the families at full value in their
 * glyphs and at the app's `/10` tint behind them (the tint is question 1's open
 * icon-tile exemption, drawn as the app draws it today rather than pre-empted
 * here), and Harmony is the current zone, wearing the inset glow the real card
 * takes and holding the two people who are in it.
 *
 * The lobby zone and the custom zones are left out: the lobby is neutral by
 * design and a custom zone wears one of the sixteen picks, which say only "a
 * moderator chose this". Neither can collide with a role, and both would push
 * the roster off the panel.
 */
const ZONES: readonly { readonly id: YtyFamilyId; readonly name: string; readonly tile: string }[] = [
  { id: "harmony", name: "Harmony", tile: "bg-yty-harmony/10" },
  { id: "glow", name: "Glow", tile: "bg-yty-glow/10" },
  { id: "valor", name: "Valor", tile: "bg-yty-valor/10" },
  { id: "wit", name: "Wit", tile: "bg-yty-wit/10" },
];

const ROSTER: readonly { readonly name: string; readonly role: RoleId }[] = [
  { name: "Lotta", role: "gedu" },
  { name: "Aino", role: "gamer" },
  { name: "Mikko", role: "customer" },
];

function VoiceRoom({ shape }: { shape: Shape }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {ZONES.map((zone) => {
          const current = zone.id === "harmony";
          return (
            <div
              key={zone.id}
              className="rounded-xl border border-border px-3 py-2.5"
              style={
                current
                  ? {
                      boxShadow: `inset 0 0 1.25rem -0.25rem ${YTY_FAMILIES[zone.id].hex}`,
                    }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${zone.tile}`}
                >
                  <Glyph
                    icon={YTY_ELEMENT_GRAMMAR[zone.id].glyph}
                    colour={YTY_FAMILIES[zone.id].hex}
                  />
                </span>
                <span className="flex-1 truncate text-sm font-medium">
                  {zone.name}
                </span>
              </div>
              <div className="relative h-[68px]">
                <div className="flex h-full items-start gap-1 overflow-hidden pt-1.5">
                  {current &&
                    ROSTER.slice(1).map((person) => (
                      <span
                        key={person.name}
                        className="flex w-12 shrink-0 flex-col items-center gap-1"
                      >
                        <span className="relative h-11 w-11 overflow-hidden rounded-md border-2 border-border bg-lifted" />
                        <span className="w-full truncate text-center text-[10px] leading-tight">
                          {person.name}
                        </span>
                      </span>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {ROSTER.map((person) => (
          <div
            key={person.name}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border p-2"
          >
            <span className="shrink-0 overflow-hidden rounded-md">
              <span className="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-md bg-lifted" />
            </span>
            <span className="min-w-0 max-w-fit flex-1 truncate text-sm font-medium">
              {person.name}
            </span>
            {(shape.everyRoleInTheRoom || person.role === "customer") && (
              <RoleChip shape={shape} role={person.role} scale="row" />
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <Glyph icon={Video} size={14} colour={NEUTRALS.mutedForeground.hex} />
              <Glyph icon={Mic} size={14} colour={NEUTRALS.mutedForeground.hex} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RolesSection() {
  return (
    <Question n={3} title="The role chip">
      <Case title="The four chips">
        <Row
          file="lib/constants/roles.ts"
          page="/admin/ui-components, the role badges"
          render={(shape) => <RoleChips shape={shape} />}
        />
      </Case>

      <Case title="The admin users table">
        <Row
          file="admin/user-row.tsx"
          page="/admin/users, a gedu, a parent and a gamer"
          render={(shape) => <UsersTable shape={shape} />}
        />
      </Case>

      <Case title="The voice roster, beside the zone tiles">
        <Row
          file="voice/ZoneList.tsx, voice/ParticipantRow.tsx"
          page="a live session, seen by a gamer or a parent"
          render={(shape) => <VoiceRoom shape={shape} />}
        />
      </Case>
    </Question>
  );
}

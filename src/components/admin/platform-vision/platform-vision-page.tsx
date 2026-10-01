import {
  BadgeCheck,
  BookOpen,
  Bot,
  Cake,
  ChartLine,
  Compass,
  Gamepad2,
  Gem,
  Gift,
  Globe,
  HandHeart,
  HeartHandshake,
  HouseHeart,
  Infinity as InfinityIcon,
  Lightbulb,
  MessageCircleOff,
  MessagesSquare,
  Rocket,
  Route,
  ShieldCheck,
  Shirt,
  Sparkles,
  Sprout,
  Star,
  Store,
  Swords,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { YTY_ELEMENTS } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";
import {
  CampfireArt,
  ForestToPixelsArt,
  GrowingAvatarArt,
  LoopArt,
  ProfileOrbitArt,
  RouteArt,
  SparkleBurstArt,
  StaircaseArt,
  ThreadArt,
} from "./vision-art";
import {
  VISION_AVATAR,
  VISION_CLOSING,
  VISION_COMMUNITY,
  VISION_FOUNDATION,
  VISION_GAMES,
  VISION_GEDUS,
  VISION_HERO,
  VISION_LOOP,
  VISION_PARENTS,
  VISION_PATH,
  VISION_THREAD,
  VISION_WALL,
  VISION_YTY,
  type WallIdea,
} from "./vision-content";
import { VISION_TONES, type VisionTone } from "./vision-tones";

/**
 * `/admin/platform-vision` — the big picture of Sogverse, for staff.
 *
 * An admin who asks "what is the dream?" is sent here. It is a vision board,
 * not a spec: ideas, hopes, values and the order we chase them in, light on
 * detail and with no dates. The words are in `vision-content.ts` (English
 * only, declared there) and the pictures in `vision-art.tsx`.
 *
 * **It spends the whole palette**, a departure from the admin act-plus-one
 * budget declared and justified in `vision-tones.ts`, where the six hues are
 * spelled. Headings and prose stay ink; colour arrives as edges, rules, marks,
 * glyphs, element names beside their glyphs, and the artwork.
 *
 * Static from first paint: no read, no state, nothing that arrives later, so
 * nothing on it can move under a reader.
 */
export function PlatformVisionPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-24 pb-16 sm:space-y-32">
      <HeroSection />
      <ThreadSection />
      <LoopSection />
      <YtySection />
      <AvatarSection />
      <GedusSection />
      <CommunitySection />
      <ParentsSection />
      <GamesSection />
      <WallSection />
      <PathSection />
      <FoundationSection />
      <ClosingSection />
    </div>
  );
}

// ------------------------------------------------------------ shared pieces

/** A glyph on the lifted neutral, edged in its hue. */
function GlyphTile({ icon: Icon, tone, size = "md" }: { icon: LucideIcon; tone: VisionTone; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border bg-lifted",
        size === "sm" ? "h-9 w-9" : "h-11 w-11",
        VISION_TONES[tone].edge,
      )}
    >
      <Icon aria-hidden="true" className={cn(size === "sm" ? "h-5 w-5" : "h-6 w-6", VISION_TONES[tone].glyph)} />
    </span>
  );
}

/** The eyebrow, the heading, a short rule in the section's hue, and the intro. */
function SectionHeader({
  id,
  icon,
  tone,
  eyebrow,
  heading,
  intro,
}: {
  id: string;
  icon: LucideIcon;
  tone: VisionTone;
  eyebrow: string;
  heading: string;
  intro?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        <GlyphTile icon={icon} tone={tone} size="sm" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      </div>
      <h2 id={id} className="mt-5 text-h3 sm:text-h2">
        {heading}
      </h2>
      <div aria-hidden="true" className={cn("mt-5 h-1 w-16 rounded-full", VISION_TONES[tone].mark)} />
      {intro && <p className="mt-6 text-body-l">{intro}</p>}
    </div>
  );
}

/** One idea as a card with a coloured top edge, a glyph and a few words. */
function IdeaCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: VisionTone;
  title: string;
  body: string;
}) {
  return (
    <Card className={cn("h-full border-t-4 p-6", VISION_TONES[tone].edgeTop)}>
      <div className="flex items-center gap-3">
        <GlyphTile icon={icon} tone={tone} />
        <h3 className="text-h4 font-semibold">{title}</h3>
      </div>
      <p className="mt-4 text-muted-foreground">{body}</p>
    </Card>
  );
}

// ------------------------------------------------------------ sections

function HeroSection() {
  return (
    <section
      aria-labelledby="vision-hero"
      className="grid items-center gap-10 pt-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16"
    >
      <div>
        <div className="flex items-center gap-3">
          <GlyphTile icon={Sparkles} tone="act" size="sm" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {VISION_HERO.eyebrow}
          </p>
        </div>
        <h1 id="vision-hero" className="mt-5 text-h1-mobile sm:text-h1">
          {VISION_HERO.title}
        </h1>
        <div aria-hidden="true" className="mt-6 h-1 w-24 rounded-full bg-world" />
        <p className="mt-6 text-body-l">{VISION_HERO.lead}</p>
        <figure className="mt-8 border-l-4 border-act pl-5">
          <blockquote className="font-serif text-2xl sm:text-3xl">{VISION_HERO.statement}</blockquote>
          <figcaption className="mt-2 text-sm text-muted-foreground">{VISION_HERO.statementLabel}</figcaption>
        </figure>
      </div>
      <ProfileOrbitArt title={VISION_HERO.artTitle} className="mx-auto w-full max-w-md" />
    </section>
  );
}

const THREAD_IN_TONES = ["valor", "harmony", "glow"] as const satisfies readonly VisionTone[];
const THREAD_OUT_TONES = ["world", "world", "world", "world"] as const satisfies readonly VisionTone[];
const PRINCIPLE_STYLE = [
  { icon: Gamepad2, tone: "world" },
  { icon: BookOpen, tone: "wit" },
  { icon: ShieldCheck, tone: "harmony" },
] as const satisfies readonly { icon: LucideIcon; tone: VisionTone }[];

/** A short list whose rows each carry a dot in the hue of the line drawn to it. */
function FlowList({
  label,
  items,
  tones,
}: {
  label: string;
  items: readonly string[];
  tones: readonly VisionTone[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <ul className="mt-4 space-y-3">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-3">
            <span aria-hidden="true" className={cn("h-3 w-3 shrink-0 rounded-full", VISION_TONES[tones[i % tones.length]].mark)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThreadSection() {
  return (
    <section aria-labelledby="vision-thread">
      <SectionHeader
        id="vision-thread"
        icon={Compass}
        tone="act"
        eyebrow={VISION_THREAD.eyebrow}
        heading={VISION_THREAD.heading}
        intro={VISION_THREAD.body}
      />
      <div className="mt-12 grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_minmax(0,1fr)]">
        <FlowList label={VISION_THREAD.writesInLabel} items={VISION_THREAD.writesIn} tones={THREAD_IN_TONES} />
        <ThreadArt
          inTones={THREAD_IN_TONES}
          outTones={THREAD_OUT_TONES}
          className="mx-auto w-full max-w-xs"
        />
        <FlowList label={VISION_THREAD.readsOutLabel} items={VISION_THREAD.readsOut} tones={THREAD_OUT_TONES} />
      </div>
      <p className="mt-14 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {VISION_THREAD.principlesLabel}
      </p>
      <ul className="mt-4 grid gap-6 md:grid-cols-3">
        {VISION_THREAD.principles.map((principle, i) => (
          <li key={principle.title}>
            <IdeaCard
              icon={PRINCIPLE_STYLE[i % PRINCIPLE_STYLE.length].icon}
              tone={PRINCIPLE_STYLE[i % PRINCIPLE_STYLE.length].tone}
              title={principle.title}
              body={principle.body}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoopSection() {
  return (
    <section aria-labelledby="vision-loop">
      <SectionHeader
        id="vision-loop"
        icon={InfinityIcon}
        tone="world"
        eyebrow={VISION_LOOP.eyebrow}
        heading={VISION_LOOP.heading}
        intro={VISION_LOOP.intro}
      />
      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <LoopArt title={VISION_LOOP.artTitle} className="mx-auto w-full max-w-sm" />
        <ol className="space-y-4">
          {VISION_LOOP.steps.map((step, i) => (
            <li
              key={step.title}
              className={cn("rounded-lg border border-l-4 border-border bg-card p-5", VISION_TONES[step.tone].edgeLeft)}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <h3 className="text-h4 font-semibold">{step.title}</h3>
              </div>
              <p className="mt-2 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-8 flex flex-col gap-4 rounded-lg border border-act bg-card p-6 sm:flex-row sm:items-start sm:p-8">
        <GlyphTile icon={Swords} tone="act" />
        <div>
          <h3 className="text-h4 font-semibold">{VISION_LOOP.rules.title}</h3>
          <p className="mt-2 text-muted-foreground">{VISION_LOOP.rules.body}</p>
        </div>
      </div>
    </section>
  );
}

function YtySection() {
  return (
    <section aria-labelledby="vision-yty">
      <SectionHeader
        id="vision-yty"
        icon={Sparkles}
        tone="glow"
        eyebrow={VISION_YTY.eyebrow}
        heading={VISION_YTY.heading}
        intro={VISION_YTY.intro}
      />
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {YTY_ELEMENTS.map((element) => (
          <li key={element.id}>
            <Card className={cn("h-full border-t-4 p-6", VISION_TONES[element.id].edgeTop)}>
              <div className="flex items-center gap-3">
                <GlyphTile icon={element.icon} tone={element.id} />
                <h3 className={cn("text-h4 font-semibold", element.color.accent)}>{element.name}</h3>
              </div>
              <p className="mt-4 font-medium">{element.description}</p>
              <p className="mt-2 text-sm text-muted-foreground">{VISION_YTY.grows[element.id]}</p>
            </Card>
          </li>
        ))}
      </ul>
      <div className="mt-8 grid items-center gap-8 rounded-lg border border-yty-wit bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div>
          <h3 className="text-h3">{VISION_YTY.wit.title}</h3>
          <p className="mt-3">{VISION_YTY.wit.body}</p>
          <p className="mt-5 font-serif text-2xl">{VISION_YTY.wit.slogan}</p>
        </div>
        <ForestToPixelsArt className="w-full" />
      </div>
    </section>
  );
}

function AvatarSection() {
  return (
    <section aria-labelledby="vision-avatar">
      <SectionHeader
        id="vision-avatar"
        icon={Gem}
        tone="harmony"
        eyebrow={VISION_AVATAR.eyebrow}
        heading={VISION_AVATAR.heading}
        intro={VISION_AVATAR.body}
      />
      <Card className="mt-12 p-4 sm:p-10">
        <GrowingAvatarArt title={VISION_AVATAR.artTitle} className="w-full" />
        {/* Four equal columns under four avatars standing at the column centres. */}
        <ul aria-hidden="true" className="mt-3 grid grid-cols-4">
          {YTY_ELEMENTS.map((element) => (
            <li key={element.id} className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center sm:gap-2">
              <element.icon className={cn("h-4 w-4", element.color.accent)} />
              <span className={cn("text-xs font-semibold sm:text-sm", element.color.accent)}>{element.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

const STAGE_TONES = ["act", "wit", "world"] as const satisfies readonly VisionTone[];

function GedusSection() {
  return (
    <section aria-labelledby="vision-gedus">
      <SectionHeader
        id="vision-gedus"
        icon={Store}
        tone="act"
        eyebrow={VISION_GEDUS.eyebrow}
        heading={VISION_GEDUS.heading}
        intro={VISION_GEDUS.intro}
      />
      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
        <ol className="space-y-4">
          {VISION_GEDUS.stages.map((stage, i) => (
            <li
              key={stage.title}
              className={cn(
                "rounded-lg border border-l-4 border-border bg-card p-5",
                VISION_TONES[STAGE_TONES[i % STAGE_TONES.length]].edgeLeft,
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {VISION_GEDUS.stageLabel} {i + 1}
              </p>
              <h3 className="mt-1 text-h4 font-semibold">{stage.title}</h3>
              <p className="mt-2 text-muted-foreground">{stage.body}</p>
            </li>
          ))}
        </ol>
        <StaircaseArt title={VISION_GEDUS.artTitle} className="mx-auto w-full max-w-md" />
      </div>
      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{VISION_GEDUS.foundation}</p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        <li>
          <IdeaCard
            icon={Trophy}
            tone="valor"
            title={VISION_GEDUS.profile.title}
            body={VISION_GEDUS.profile.body}
          />
        </li>
        <li>
          <IdeaCard
            icon={Users}
            tone="harmony"
            title={VISION_GEDUS.community.title}
            body={VISION_GEDUS.community.body}
          />
        </li>
      </ul>
    </section>
  );
}

const COMMUNITY_STYLE = [
  { icon: MessageCircleOff, tone: "harmony" },
  { icon: HeartHandshake, tone: "glow" },
  { icon: Trophy, tone: "valor" },
  { icon: HandHeart, tone: "act" },
] as const satisfies readonly { icon: LucideIcon; tone: VisionTone }[];

function CommunitySection() {
  return (
    <section aria-labelledby="vision-community">
      <SectionHeader
        id="vision-community"
        icon={UsersRound}
        tone="harmony"
        eyebrow={VISION_COMMUNITY.eyebrow}
        heading={VISION_COMMUNITY.heading}
        intro={VISION_COMMUNITY.intro}
      />
      <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
        <CampfireArt className="mx-auto w-full max-w-sm" />
        <ul className="grid gap-4 sm:grid-cols-2">
          {VISION_COMMUNITY.ideas.map((idea, i) => (
            <li key={idea.title}>
              <IdeaCard
                icon={COMMUNITY_STYLE[i % COMMUNITY_STYLE.length].icon}
                tone={COMMUNITY_STYLE[i % COMMUNITY_STYLE.length].tone}
                title={idea.title}
                body={idea.body}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const PARENT_STYLE = [
  { icon: Star, tone: "glow" },
  { icon: ChartLine, tone: "wit" },
  { icon: MessagesSquare, tone: "harmony" },
] as const satisfies readonly { icon: LucideIcon; tone: VisionTone }[];

function ParentsSection() {
  return (
    <section aria-labelledby="vision-parents">
      <SectionHeader
        id="vision-parents"
        icon={HouseHeart}
        tone="valor"
        eyebrow={VISION_PARENTS.eyebrow}
        heading={VISION_PARENTS.heading}
        intro={VISION_PARENTS.intro}
      />
      <ul className="mt-12 grid gap-6 lg:grid-cols-3">
        {VISION_PARENTS.ideas.map((idea, i) => (
          <li key={idea.title}>
            <IdeaCard
              icon={PARENT_STYLE[i % PARENT_STYLE.length].icon}
              tone={PARENT_STYLE[i % PARENT_STYLE.length].tone}
              title={idea.title}
              body={idea.body}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const GAME_TONES = ["act", "harmony", "glow", "valor", "wit", "world"] as const satisfies readonly VisionTone[];

function GamesSection() {
  return (
    <section aria-labelledby="vision-games">
      <SectionHeader
        id="vision-games"
        icon={Gamepad2}
        tone="valor"
        eyebrow={VISION_GAMES.eyebrow}
        heading={VISION_GAMES.heading}
        intro={VISION_GAMES.intro}
      />
      <ul className="mt-10 flex flex-wrap gap-3">
        {VISION_GAMES.lines.map((line, i) => (
          <li
            key={line}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
          >
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", VISION_TONES[GAME_TONES[i % GAME_TONES.length]].mark)} />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

const WALL_ICONS = {
  website: Rocket,
  merch: Shirt,
  birthday: Cake,
  bots: Bot,
  webinars: Swords,
  wellbeing: Sprout,
  shop: Gift,
  international: Globe,
} as const satisfies Record<WallIdea["icon"], LucideIcon>;

function WallSection() {
  return (
    <section aria-labelledby="vision-wall">
      <SectionHeader
        id="vision-wall"
        icon={Lightbulb}
        tone="wit"
        eyebrow={VISION_WALL.eyebrow}
        heading={VISION_WALL.heading}
      />
      {/* A pinboard: each note tilts a degree either way from `lg` up, with a pin in its own hue. */}
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {VISION_WALL.ideas.map((idea) => (
          <li key={idea.title} className="relative lg:odd:-rotate-1 lg:even:rotate-1">
            <span
              aria-hidden="true"
              className={cn("absolute -top-1.5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rounded-full", VISION_TONES[idea.tone].mark)}
            />
            <IdeaCard icon={WALL_ICONS[idea.icon]} tone={idea.tone} title={idea.title} body={idea.body} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const PATH_TONES = ["act", "world", "glow", "harmony"] as const satisfies readonly [
  VisionTone,
  VisionTone,
  VisionTone,
  VisionTone,
];

function PathSection() {
  return (
    <section aria-labelledby="vision-path">
      <SectionHeader
        id="vision-path"
        icon={Route}
        tone="glow"
        eyebrow={VISION_PATH.eyebrow}
        heading={VISION_PATH.heading}
        intro={VISION_PATH.intro}
      />
      <RouteArt tones={PATH_TONES} className="mt-12 hidden w-full lg:block" />
      {/* Four equal columns from `lg` up, each under its waypoint on the route. */}
      <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {VISION_PATH.steps.map((step, i) => (
          <li key={step.title} className="lg:text-center">
            <div className="flex items-baseline gap-3 lg:justify-center">
              <span
                aria-hidden="true"
                className={cn("h-3 w-3 shrink-0 rounded-full lg:hidden", VISION_TONES[PATH_TONES[i % PATH_TONES.length]].mark)}
              />
              <h3 className="text-h4 font-semibold">{step.title}</h3>
            </div>
            <p className="mt-2 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FoundationSection() {
  return (
    <section aria-labelledby="vision-foundation">
      <SectionHeader
        id="vision-foundation"
        icon={BadgeCheck}
        tone="glow"
        eyebrow={VISION_FOUNDATION.eyebrow}
        heading={VISION_FOUNDATION.heading}
        intro={VISION_FOUNDATION.body}
      />
      <ul className="mt-10 flex flex-wrap gap-3">
        {VISION_FOUNDATION.facts.map((fact) => (
          <li
            key={fact}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
          >
            <BadgeCheck aria-hidden="true" className="h-4 w-4 text-yty-glow" />
            {fact}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClosingSection() {
  return (
    <section
      aria-labelledby="vision-closing"
      className="rounded-lg border-2 border-world bg-card px-6 py-12 text-center sm:px-12 sm:py-16"
    >
      <SparkleBurstArt className="mx-auto h-16 w-40" />
      <h2 id="vision-closing" className="mt-6 text-h3 sm:text-h2">
        {VISION_CLOSING.heading}
      </h2>
      <p className="mx-auto mt-5 max-w-2xl text-body-l">{VISION_CLOSING.body}</p>
    </section>
  );
}

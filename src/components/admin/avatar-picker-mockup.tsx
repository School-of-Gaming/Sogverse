/* eslint-disable i18next/no-literal-string -- internal admin-only style-guide mockup; all copy is exploratory design scaffolding, not user-facing text that ships in any locale */
"use client";

import { useState } from "react";
import {
  // Gaming & play
  Gamepad2,
  Joystick,
  Dice5,
  Puzzle,
  Bot,
  Target,
  Trophy,
  Medal,
  // Animals — every animal icon in the Lucide library
  Cat,
  Dog,
  Rabbit,
  Squirrel,
  Rat,
  Panda,
  Turtle,
  Snail,
  Bird,
  Fish,
  FishSymbol,
  Shrimp,
  Shell,
  Bug,
  Worm,
  PawPrint,
  Feather,
  // Animal-signifiers (not animals themselves, but fun)
  Bone,
  Egg,
  Origami,
  Birdhouse,
  PiggyBank,
  // Space & sky
  Rocket,
  Star,
  Sparkles,
  Moon,
  Telescope,
  Zap,
  Flame,
  Rainbow,
  Snowflake,
  // Nature
  Leaf,
  Sprout,
  TreePine,
  Flower2,
  Mountain,
  // Food & treats
  Pizza,
  IceCreamCone,
  Cookie,
  Donut,
  Candy,
  Cherry,
  Popcorn,
  // Create & learn
  Music,
  Headphones,
  Camera,
  Palette,
  Book,
  GraduationCap,
  Lightbulb,
  Compass,
  // Extras
  Ghost,
  Crown,
  Gem,
  Gift,
  PartyPopper,
  Smile,
  Anchor,
  Coffee,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Candidate icon set                                                 */
/*                                                                     */
/*  Avoids the icons already carrying meaning: Heart/Sun/Sword/Brain   */
/*  (the four Yty elements) and Pickaxe (the Minecraft username badge).*/
/*  Skews fun + gaming + creatures since most pickers are kids.        */
/* ------------------------------------------------------------------ */

const AVATAR_ICONS: { id: string; label: string; Icon: LucideIcon }[] = [
  // Gaming & play
  { id: "gamepad", label: "Gamepad", Icon: Gamepad2 },
  { id: "joystick", label: "Joystick", Icon: Joystick },
  { id: "dice", label: "Dice", Icon: Dice5 },
  { id: "puzzle", label: "Puzzle", Icon: Puzzle },
  { id: "bot", label: "Robot", Icon: Bot },
  { id: "target", label: "Target", Icon: Target },
  { id: "trophy", label: "Trophy", Icon: Trophy },
  { id: "medal", label: "Medal", Icon: Medal },
  // Animals — every animal icon in the Lucide library
  { id: "cat", label: "Cat", Icon: Cat },
  { id: "dog", label: "Dog", Icon: Dog },
  { id: "rabbit", label: "Rabbit", Icon: Rabbit },
  { id: "squirrel", label: "Squirrel", Icon: Squirrel },
  { id: "rat", label: "Rat", Icon: Rat },
  { id: "panda", label: "Panda", Icon: Panda },
  { id: "turtle", label: "Turtle", Icon: Turtle },
  { id: "snail", label: "Snail", Icon: Snail },
  { id: "bird", label: "Bird", Icon: Bird },
  { id: "fish", label: "Fish", Icon: Fish },
  { id: "fish-outline", label: "Fish (outline)", Icon: FishSymbol },
  { id: "shrimp", label: "Shrimp", Icon: Shrimp },
  { id: "shell", label: "Shell", Icon: Shell },
  { id: "bug", label: "Bug", Icon: Bug },
  { id: "worm", label: "Worm", Icon: Worm },
  { id: "paw", label: "Paw", Icon: PawPrint },
  { id: "feather", label: "Feather", Icon: Feather },
  // Animal-signifiers — not animals themselves, but fun
  { id: "bone", label: "Bone", Icon: Bone },
  { id: "egg", label: "Egg", Icon: Egg },
  { id: "origami", label: "Paper crane", Icon: Origami },
  { id: "birdhouse", label: "Birdhouse", Icon: Birdhouse },
  { id: "piggybank", label: "Piggy bank", Icon: PiggyBank },
  // Space & sky
  { id: "rocket", label: "Rocket", Icon: Rocket },
  { id: "star", label: "Star", Icon: Star },
  { id: "sparkles", label: "Sparkles", Icon: Sparkles },
  { id: "moon", label: "Moon", Icon: Moon },
  { id: "telescope", label: "Telescope", Icon: Telescope },
  { id: "zap", label: "Bolt", Icon: Zap },
  { id: "flame", label: "Flame", Icon: Flame },
  { id: "rainbow", label: "Rainbow", Icon: Rainbow },
  { id: "snowflake", label: "Snowflake", Icon: Snowflake },
  // Nature
  { id: "leaf", label: "Leaf", Icon: Leaf },
  { id: "sprout", label: "Sprout", Icon: Sprout },
  { id: "tree", label: "Tree", Icon: TreePine },
  { id: "flower", label: "Flower", Icon: Flower2 },
  { id: "mountain", label: "Mountain", Icon: Mountain },
  // Food & treats
  { id: "pizza", label: "Pizza", Icon: Pizza },
  { id: "icecream", label: "Ice cream", Icon: IceCreamCone },
  { id: "cookie", label: "Cookie", Icon: Cookie },
  { id: "donut", label: "Donut", Icon: Donut },
  { id: "candy", label: "Candy", Icon: Candy },
  { id: "cherry", label: "Cherry", Icon: Cherry },
  { id: "popcorn", label: "Popcorn", Icon: Popcorn },
  // Create & learn
  { id: "music", label: "Music", Icon: Music },
  { id: "headphones", label: "Headphones", Icon: Headphones },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "palette", label: "Palette", Icon: Palette },
  { id: "book", label: "Book", Icon: Book },
  { id: "grad", label: "Graduation cap", Icon: GraduationCap },
  { id: "lightbulb", label: "Lightbulb", Icon: Lightbulb },
  { id: "compass", label: "Compass", Icon: Compass },
  // Extras
  { id: "ghost", label: "Ghost", Icon: Ghost },
  { id: "crown", label: "Crown", Icon: Crown },
  { id: "gem", label: "Gem", Icon: Gem },
  { id: "gift", label: "Gift", Icon: Gift },
  { id: "party", label: "Party popper", Icon: PartyPopper },
  { id: "smile", label: "Smile", Icon: Smile },
  { id: "anchor", label: "Anchor", Icon: Anchor },
  { id: "coffee", label: "Coffee", Icon: Coffee },
];

/* ------------------------------------------------------------------ */
/*  Candidate color palette                                            */
/*                                                                     */
/*  Backed by the --color-avatar-* tokens in globals.css. Each entry   */
/*  carries its own literal class strings (the Yty pattern) because    */
/*  Tailwind can't see dynamically-built class names.                  */
/* ------------------------------------------------------------------ */

const AVATAR_COLORS: {
  id: string;
  label: string;
  solid: string;
  tint: string;
  glyph: string;
}[] = [
  { id: "red", label: "Red", solid: "bg-avatar-red", tint: "bg-avatar-red/15", glyph: "text-avatar-red" },
  { id: "coral", label: "Coral", solid: "bg-avatar-coral", tint: "bg-avatar-coral/15", glyph: "text-avatar-coral" },
  { id: "orange", label: "Orange", solid: "bg-avatar-orange", tint: "bg-avatar-orange/15", glyph: "text-avatar-orange" },
  { id: "lime", label: "Lime", solid: "bg-avatar-lime", tint: "bg-avatar-lime/15", glyph: "text-avatar-lime" },
  { id: "green", label: "Green", solid: "bg-avatar-green", tint: "bg-avatar-green/15", glyph: "text-avatar-green" },
  { id: "teal", label: "Teal", solid: "bg-avatar-teal", tint: "bg-avatar-teal/15", glyph: "text-avatar-teal" },
  { id: "cyan", label: "Cyan", solid: "bg-avatar-cyan", tint: "bg-avatar-cyan/15", glyph: "text-avatar-cyan" },
  { id: "sky", label: "Sky", solid: "bg-avatar-sky", tint: "bg-avatar-sky/15", glyph: "text-avatar-sky" },
  { id: "indigo", label: "Indigo", solid: "bg-avatar-indigo", tint: "bg-avatar-indigo/15", glyph: "text-avatar-indigo" },
  { id: "violet", label: "Violet", solid: "bg-avatar-violet", tint: "bg-avatar-violet/15", glyph: "text-avatar-violet" },
  { id: "fuchsia", label: "Fuchsia", solid: "bg-avatar-fuchsia", tint: "bg-avatar-fuchsia/15", glyph: "text-avatar-fuchsia" },
  { id: "magenta", label: "Magenta", solid: "bg-avatar-magenta", tint: "bg-avatar-magenta/15", glyph: "text-avatar-magenta" },
  { id: "pink", label: "Pink", solid: "bg-avatar-pink", tint: "bg-avatar-pink/15", glyph: "text-avatar-pink" },
  { id: "rose", label: "Rose", solid: "bg-avatar-rose", tint: "bg-avatar-rose/15", glyph: "text-avatar-rose" },
  { id: "slate", label: "Slate", solid: "bg-avatar-slate", tint: "bg-avatar-slate/15", glyph: "text-avatar-slate" },
  { id: "stone", label: "Stone", solid: "bg-avatar-stone", tint: "bg-avatar-stone/15", glyph: "text-avatar-stone" },
];

export function AvatarPickerMockup() {
  const [iconId, setIconId] = useState(AVATAR_ICONS[0].id);
  const [colorId, setColorId] = useState(AVATAR_COLORS[0].id);

  const icon = AVATAR_ICONS.find((i) => i.id === iconId) ?? AVATAR_ICONS[0];
  const color = AVATAR_COLORS.find((c) => c.id === colorId) ?? AVATAR_COLORS[0];
  const Icon = icon.Icon;

  return (
    <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
      {/* Live preview — tinted vs solid, plus real avatar sizes */}
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </p>
        <div className={cn("flex h-24 w-24 items-center justify-center rounded-2xl", color.tint)}>
          <Icon className={cn("h-12 w-12", color.glyph)} aria-hidden />
        </div>

        {/* Real avatar sizes (the rounded-md Avatar used across the app) */}
        <div className="flex items-end gap-4 pt-2">
          {[
            { px: 48, icon: "h-6 w-6" },
            { px: 40, icon: "h-5 w-5" },
            { px: 32, icon: "h-4 w-4" },
          ].map((s) => (
            <div key={s.px} className="flex flex-col items-center gap-1.5">
              <Avatar style={{ height: s.px, width: s.px }}>
                <div className={cn("flex h-full w-full items-center justify-center", color.tint)}>
                  <Icon className={cn(s.icon, color.glyph)} aria-hidden />
                </div>
              </Avatar>
              <span className="text-xs text-muted-foreground">{s.px}px</span>
            </div>
          ))}
        </div>

        <p className="max-w-xs text-xs text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{icon.label}</span> on{" "}
          <span className="font-medium text-foreground">{color.label}</span>
        </p>
      </div>

      {/* Pickers */}
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Icon
          </p>
          <div className="flex flex-wrap gap-2">
            {AVATAR_ICONS.map(({ id, label, Icon: ItemIcon }) => {
              const selected = id === iconId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIconId(id)}
                  aria-pressed={selected}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-lg border transition-colors",
                    selected
                      ? cn("border-transparent ring-2 ring-ring", color.tint, color.glyph)
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <ItemIcon className="h-5 w-5" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Color
          </p>
          <div className="flex flex-wrap gap-3">
            {AVATAR_COLORS.map(({ id, label, solid }) => {
              const selected = id === colorId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setColorId(id)}
                  aria-pressed={selected}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105",
                    solid,
                    selected && "ring-2 ring-offset-2 ring-offset-background ring-foreground",
                  )}
                >
                  {selected && <Check className="h-5 w-5 text-background" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

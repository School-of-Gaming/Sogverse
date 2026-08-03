import { cva, type VariantProps } from "class-variance-authority";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";

/**
 * A person as a pill: their identicon and their first name, nothing else.
 *
 * This is the smallest way to say "this human is attached to this thing" —
 * who teaches a group, who is in a room — and it had already been hand-rolled
 * in three places with the same class list before it became a primitive here.
 * The identicon is the whole reason it is a chip rather than a name: a face is
 * recognised before a word is read, so a row of them is scannable in a way a
 * comma-separated list of names is not.
 *
 * **The avatar box and the identicon must be sized together.** `Identicon`
 * paints an SVG at an explicit pixel size inside an `Avatar` that is sized in
 * Tailwind units; if the two disagree the pattern is cropped or floats in a
 * corner. Keeping both in one variant here is what makes that impossible to get
 * wrong at a call site.
 *
 * Two sizes. `default` is the standalone list — a group card's teachers, where
 * the chips are the only thing on their line. `compact` is for a line that
 * already carries something else (a rail row with a button on the same row),
 * where a default chip pushes the row into wrapping.
 */
const personChipVariants = cva(
  "inline-flex items-center rounded-full border border-border bg-muted",
  {
    variants: {
      size: {
        default: "gap-1.5 px-2 py-1 text-xs",
        compact: "gap-1.5 px-1.5 py-0.5 text-[11px]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/** Avatar box class and identicon pixel size, per chip size. */
const AVATAR_BY_SIZE = {
  default: { className: "h-5 w-5", pixels: 20 },
  compact: { className: "h-4 w-4", pixels: 16 },
} as const;

export interface PersonChipProps
  extends VariantProps<typeof personChipVariants> {
  /**
   * The person's id — the identicon is hashed out of its hex bytes, so this
   * has to be the real UUID, never a readable stand-in.
   */
  id: string;
  /** What to show beside the face. A first name in every current caller. */
  name: string;
  className?: string;
}

export function PersonChip({ id, name, size, className }: PersonChipProps) {
  const avatar = AVATAR_BY_SIZE[size ?? "default"];

  return (
    <span className={cn(personChipVariants({ size }), className)}>
      <Avatar className={avatar.className}>
        <Identicon id={id} size={avatar.pixels} />
      </Avatar>
      <span className="leading-none">{name}</span>
    </span>
  );
}

export interface PersonChipListPerson {
  id: string;
  name: string;
}

/**
 * A wrapping row of chips. The wrapper exists because every caller wants the
 * same one — a set of people is never one chip wide, and a row that does not
 * wrap silently truncates whoever is last.
 */
export function PersonChipList({
  people,
  size,
  className,
}: {
  people: readonly PersonChipListPerson[];
  className?: string;
} & VariantProps<typeof personChipVariants>) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {people.map((person) => (
        <PersonChip
          key={person.id}
          id={person.id}
          name={person.name}
          size={size}
        />
      ))}
    </div>
  );
}

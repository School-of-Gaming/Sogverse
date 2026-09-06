"use client";

/**
 * The greys section's constructs that hold a state.
 *
 * **Why this file exists.** A hover is a CSS pseudo-class and needs no
 * JavaScript, so every hover-only exemplar stays in `section-greys.tsx` as a
 * server component. What lives here is the set of constructs whose *other*
 * state is the point: a rail entry that is active, a contact row that is
 * selected, an option a keyboard has landed on, a chip that is pressed. Those
 * cannot be drawn as one static picture, because the question the section asks
 * is whether the hover fill and the selected fill can be told apart — and two
 * fills are told apart by moving the pointer between them, not by reading two
 * screenshots.
 *
 * **Every class is a complete literal on each branch.** Tailwind scans source
 * text, so `hover:bg-${fill}` is a class the stylesheet does not contain. The
 * branches below spell both greys out and pick between them.
 *
 * **The glyphs are the demo's, not the app's.** The demo depends on neither
 * Sogverse nor its icon set, and a mark's shape is not what is being ruled on;
 * the marks here stand in for the ones the real construct wears, which is the
 * same substitution `parts.tsx` makes everywhere else on this page.
 */

import { useState } from "react";
import { Glyph, type GlyphName } from "./parts";

/** Which of the two greys a construct is drawn with. */
export type Fill = "accent" | "muted";

// ------------------------------------------------------------------ the rail

/**
 * `components/layout/sidebar.tsx` — the dashboard rail.
 *
 * The rail was ruled onto the card ground with no tokens of its own, and its
 * hover already reads `muted`; it is the one construct in the app for which
 * `muted` is *today* and `accent` is the alternative. Its active entry is the
 * brand pair, which is what makes the rail the easy case: the state that has to
 * survive the pointer leaving is amber, so the hover fill only has to be
 * visible, never distinguishable from a selection.
 *
 * The collapse geometry is dropped — the widths, the sticky offset and the
 * 700ms width transition are page layout rather than colour — and the entry is
 * drawn expanded. The 300ms background transition is kept, because how quickly
 * a fill arrives is part of how faint it feels.
 */
const RAIL_TRANSITION =
  "[transition:padding_700ms,gap_700ms,background-color_300ms,color_300ms]";

const RAIL_ENTRY =
  "flex w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium";

const RAIL_ITEMS: { id: string; label: string; glyph: GlyphName }[] = [
  { id: "dashboard", label: "Dashboard", glyph: "home" },
  { id: "products", label: "Products", glyph: "calendar" },
  { id: "users", label: "Users", glyph: "users" },
  { id: "sites", label: "Sites", glyph: "school" },
];

export function RailNav({ fill }: { fill: Fill }) {
  const [active, setActive] = useState("products");
  return (
    <aside className="flex w-full max-w-56 flex-col border-r border-border bg-card">
      <nav className="flex-1 space-y-1 overflow-hidden p-4">
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={
              item.id === active
                ? `${RAIL_ENTRY} ${RAIL_TRANSITION} bg-act text-act-foreground`
                : fill === "accent"
                  ? `${RAIL_ENTRY} ${RAIL_TRANSITION} text-foreground hover:bg-accent`
                  : `${RAIL_ENTRY} ${RAIL_TRANSITION} text-foreground hover:bg-muted`
            }
          >
            <Glyph name={item.glyph} size={20} colour="currentColor" />
            <span className="overflow-hidden text-ellipsis">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ------------------------------------------------------ a row that is selected

/**
 * `admin/whatsapp/page.tsx` — the conversation list, inside its `bg-card` shell.
 *
 * **This is the construct the ruling turns on.** The row's hover is `accent`
 * and its selected fill is `muted`: the two greys under question, in one list,
 * one step apart. Move the pointer down the list with a row selected and the
 * proposal is felt directly — under `hover:bg-muted` the row the pointer is on
 * and the row that is chosen paint the same pixels, and the list loses the
 * ability to say which is which.
 */
const CONTACT_ROW =
  "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors";

const CONTACTS: { phone: string; name: string; when: string }[] = [
  { phone: "358401234567", name: "Aino Virtanen", when: "12:04" },
  { phone: "358407654321", name: "Mikael Korhonen", when: "11:20" },
  { phone: "358409876543", name: "Sofia Lindgren", when: "Yesterday" },
  { phone: "358401112223", name: "Elias Nieminen", when: "Monday" },
];

export function ContactList({ fill }: { fill: Fill }) {
  const [selected, setSelected] = useState(CONTACTS[1].phone);
  return (
    <div className="flex flex-col">
      {CONTACTS.map((contact) => {
        const isSelected = contact.phone === selected;
        return (
          <button
            key={contact.phone}
            type="button"
            onClick={() => setSelected(contact.phone)}
            className={
              fill === "accent"
                ? `${CONTACT_ROW} hover:bg-accent hover:text-foreground${isSelected ? " bg-muted" : ""}`
                : `${CONTACT_ROW} hover:bg-muted hover:text-foreground${isSelected ? " bg-muted" : ""}`
            }
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-act/20 text-sm font-medium text-act">
              {contact.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{contact.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {`+${contact.phone}`}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {contact.when}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------- a pill on its own grey

/**
 * `components/chat/ChatReactionRow.tsx` — a reaction row under a chat bubble.
 *
 * The only construct in the app whose rest state is already `muted` and whose
 * hover is `accent`, which makes its hover the one that runs *downward*: a pill
 * under the pointer gets darker than the pill beside it. Under the proposal the
 * hover and the rest state are the same value and the pill stops answering the
 * pointer at all. Its chosen state is the brand pair at a tint, so that half is
 * unaffected either way.
 */
const REACTION_PILL =
  "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs leading-none transition-colors";

const REACTIONS: { code: string; glyph: GlyphName; count: number }[] = [
  { code: "heart", glyph: "heart", count: 3 },
  { code: "check", glyph: "checkMark", count: 1 },
  { code: "sun", glyph: "sun", count: 2 },
];

export function ReactionPills({ fill }: { fill: Fill }) {
  const [mine, setMine] = useState("heart");
  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {REACTIONS.map((tally) => {
        const isMine = tally.code === mine;
        return (
          <button
            key={tally.code}
            type="button"
            aria-pressed={isMine}
            onClick={() => setMine(isMine ? "" : tally.code)}
            className={
              isMine
                ? `${REACTION_PILL} bg-act/15 text-act`
                : fill === "accent"
                  ? `${REACTION_PILL} bg-muted text-muted-foreground hover:bg-accent`
                  : `${REACTION_PILL} bg-muted text-muted-foreground hover:bg-muted`
            }
          >
            <Glyph name={tally.glyph} size={16} colour="currentColor" />
            <span className="tabular-nums">{tally.count}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- a picker tile

/**
 * `components/family/AddGamerDialog.tsx` — the gender row, inside the dialog.
 *
 * The tile that is not chosen paints `bg-background` on top of the dialog's
 * card, so its hover is the one lift in the app that runs page-ground to accent
 * rather than card to accent — the widest of the four steps, and the one place
 * accent is unambiguously visible on a card surface. Its chosen state is the
 * brand pair.
 */
const PICKER_TILE =
  "flex min-h-10 flex-1 items-center justify-center rounded-md border border-border px-2 py-1.5 text-center text-xs font-medium leading-tight transition-colors hyphens-auto break-words sm:px-3 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const PICKER_OPTIONS = ["Girl", "Boy", "Non-binary"];

export function PickerTiles({ fill }: { fill: Fill }) {
  const [chosen, setChosen] = useState("Boy");
  return (
    <div className="flex gap-2">
      {PICKER_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === chosen}
          onClick={() => setChosen(option)}
          className={
            option === chosen
              ? `${PICKER_TILE} bg-act text-act-foreground`
              : fill === "accent"
                ? `${PICKER_TILE} bg-background hover:bg-accent hover:text-foreground`
                : `${PICKER_TILE} bg-background hover:bg-muted hover:text-foreground`
          }
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// -------------------------------------------- accent held, rather than hovered

/**
 * `components/ui/filter-dropdown.tsx` — the open list, on its `bg-card` panel.
 *
 * One of the seven places `bg-accent` is held rather than hovered. The chosen
 * option carries `bg-accent/60` while every option carries `hover:bg-accent`,
 * so the chosen row and the hovered row are already one alpha step apart and
 * nothing else. Under the proposal both move to `muted` together and the pair
 * stays exactly as far apart as it is now — which is the honest reading of what
 * deleting accent costs here: nothing, because accent was never carrying the
 * distinction.
 */
const DROPDOWN_OPTION =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors";

const DROPDOWN_OPTIONS = ["All roles", "Admin", "Customer", "Gamer", "Gedu"];

export function DropdownList({ fill }: { fill: Fill }) {
  const [value, setValue] = useState("Gamer");
  return (
    <ul
      role="listbox"
      aria-label="Role"
      className="rounded-md border border-border bg-card p-1 text-foreground shadow-md"
    >
      {DROPDOWN_OPTIONS.map((option) => {
        const active = option === value;
        return (
          <li key={option}>
            <button
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => setValue(option)}
              className={
                fill === "accent"
                  ? `${DROPDOWN_OPTION} hover:bg-accent hover:text-foreground${active ? " bg-accent/60" : ""}`
                  : `${DROPDOWN_OPTION} hover:bg-muted hover:text-foreground${active ? " bg-muted/60" : ""}`
              }
            >
              <span className="min-w-0 flex-1 truncate">{option}</span>
              {active ? (
                <Glyph name="checkMark" size={16} colour="currentColor" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * `components/chat/ChatComposer.tsx` — the mention list above the composer.
 *
 * The second place accent is held: the entry the keyboard has landed on takes
 * `bg-accent` and every other entry takes `hover:bg-accent`, and the pointer
 * moving over an entry *makes* it the active one. So the two states are the
 * same fill by design here, and this is what accent's job actually is on this
 * construct — one highlight, reachable by two means.
 */
const MENTION_ROW =
  "flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors";

const MENTIONS = ["Aino V.", "Mikael K.", "Sofia L."];

export function MentionList({ fill }: { fill: Fill }) {
  const [index, setIndex] = useState(1);
  return (
    <ul className="overflow-hidden rounded-md border border-border bg-card shadow-lg">
      {MENTIONS.map((name, i) => (
        <li key={name}>
          <button
            type="button"
            onMouseMove={() => setIndex(i)}
            onFocus={() => setIndex(i)}
            className={
              i === index
                ? fill === "accent"
                  ? `${MENTION_ROW} bg-accent text-foreground`
                  : `${MENTION_ROW} bg-muted text-foreground`
                : fill === "accent"
                  ? `${MENTION_ROW} hover:bg-accent`
                  : `${MENTION_ROW} hover:bg-muted`
            }
          >
            {name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * `components/admin/dashboard/schedule-panel.tsx` — the product-type filter row.
 *
 * The third place accent is held, and the nearest thing Sogverse has to a
 * segmented control: there is no tab primitive and no segmented primitive, so a
 * pressed filter chip is the whole of that family. Its pressed fill is `accent`
 * with no border change and no ink change, which means on a card ground the
 * pressed chip is separated from an unpressed one by 1.08:1 and by nothing
 * else — the strongest case on the page that a state accent is the only signal
 * of needs a second signal whichever grey wins.
 */
const TYPE_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors";

const TYPES: { id: string; label: string; glyph: GlyphName; tint: string }[] = [
  {
    id: "club",
    label: "Clubs",
    glyph: "gamepad",
    tint: "text-yty-harmony-soft",
  },
  { id: "camp", label: "Camps", glyph: "tent", tint: "text-yty-valor-soft" },
  {
    id: "event",
    label: "Events",
    glyph: "calendar",
    tint: "text-yty-glow-soft",
  },
  {
    id: "school",
    label: "Schools",
    glyph: "school",
    tint: "text-yty-wit-soft",
  },
];

export function TypeChips({ fill }: { fill: Fill }) {
  const [pressed, setPressed] = useState<string[]>(["camp"]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TYPES.map((type) => {
        const active = pressed.includes(type.id);
        return (
          <button
            key={type.id}
            type="button"
            aria-pressed={active}
            onClick={() =>
              setPressed((current) =>
                current.includes(type.id)
                  ? current.filter((id) => id !== type.id)
                  : [...current, type.id],
              )
            }
            className={
              active
                ? fill === "accent"
                  ? `${TYPE_CHIP} bg-accent text-foreground`
                  : `${TYPE_CHIP} bg-muted text-foreground`
                : `${TYPE_CHIP} text-muted-foreground hover:text-foreground`
            }
          >
            <span className={type.tint}>
              <Glyph name={type.glyph} size={14} colour="currentColor" />
            </span>
            {type.label}
          </button>
        );
      })}
    </div>
  );
}

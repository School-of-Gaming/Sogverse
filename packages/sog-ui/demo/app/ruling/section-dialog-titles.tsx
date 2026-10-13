/**
 * §9 — Dialog and sheet titles.
 *
 * **What is being asked.** Which step a dialog or sheet title takes. DialogTitle
 * and SheetTitle are both an h2 at `text-lg font-semibold leading-none
 * tracking-tight` (18px) — one class string, 32 dialog call sites and 4 sheet
 * ones — and no proposed step is 18px. The level is settled: an overlay starts
 * a new layer, its title is the h2 under the page's h1, and §2's table already
 * lets an h2 take `card-title`. What is open is the size.
 *
 * **The candidates.** `card-title` at 20px (the dialog is a card on its own
 * layer, and its title the same role as a card's), the 22px `app-section`
 * candidate from §8 (the title heads the whole layer, as a section heads a run
 * of a page), and `card-title` at 24px, today's CardTitle default, for the top
 * of the range. The 20px `app-section` candidate is the 20px `card-title`
 * recipe and is not drawn twice.
 *
 * **What is drawn.** Two real confirm dialogs, each a title, a short
 * description and a footer of buttons: the instant voice room's leave dialog as
 * a moderator meets it (three buttons), and the parent's give-up-the-place
 * confirm on a waitlist seat offer (the shared ConfirmDialog, two buttons). They
 * are static mock-ups at the dialog's own width (`max-w-lg`), with the dialog
 * primitive's content, header, description and footer classes and the button
 * primitive's variants copied in; there is no overlay and no scrim, because the
 * title is judged against its own box. Each is drawn today and at the three
 * candidates, two by two, so every drawing keeps the real width.
 */

import { Case, Column, Columns, Exemplar, Question } from "./parts";
import { APP_SECTION, CARD_TITLE_20, STEP } from "./steps";

const TITLE_CANDIDATES = [
  { name: "today", cls: "text-lg font-semibold leading-none tracking-tight" },
  { name: "card-title — 20px", cls: CARD_TITLE_20 },
  { name: "app-section — 22px", cls: APP_SECTION[22] },
  { name: "card-title — 24px", cls: STEP.cardTitle },
] as const;

const BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap";
const BUTTON_GHOST = BUTTON;
const BUTTON_OUTLINE = `${BUTTON} border border-border bg-background shadow-sm`;
const BUTTON_DEFAULT = `${BUTTON} bg-act text-act-foreground shadow`;
const BUTTON_DESTRUCTIVE = `${BUTTON} bg-destructive text-destructive-foreground shadow-sm`;

/** DialogContent, DialogHeader, DialogTitle, DialogDescription and DialogFooter, static. */
function DialogMock({
  titleClass,
  title,
  description,
  buttons,
}: {
  titleClass: string;
  title: string;
  description: string;
  buttons: readonly { label: string; cls: string }[];
}) {
  return (
    <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg">
      <div className="flex flex-col space-y-1.5 text-center sm:text-left">
        <h2 className={titleClass}>{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {buttons.map(({ label, cls }) => (
          <span key={label} className={cls}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function EndCall({ titleClass }: { titleClass: string }) {
  return (
    <DialogMock
      titleClass={titleClass}
      title="Leaving the call?"
      description="You can leave on your own, or end the call for everyone — that disconnects every participant and closes the room."
      buttons={[
        { label: "Stay", cls: BUTTON_GHOST },
        { label: "End for everyone", cls: BUTTON_DESTRUCTIVE },
        { label: "Leave call", cls: BUTTON_DEFAULT },
      ]}
    />
  );
}

function GiveUpPlace({ titleClass }: { titleClass: string }) {
  return (
    <DialogMock
      titleClass={titleClass}
      title="Give up the place?"
      description="Aino will lose their place in line, and we will offer it to the next family."
      buttons={[
        { label: "Cancel", cls: BUTTON_OUTLINE },
        { label: "Yes, I am sure", cls: BUTTON_DESTRUCTIVE },
      ]}
    />
  );
}

export function DialogTitlesSection() {
  return (
    <Question n={9} title="Dialog and sheet titles">
      <Case title="A moderator leaving a call">
        <Exemplar
          file="src/components/voice/instant/EndCallModal.tsx"
          page="Instant voice room"
        >
          <Columns of={2}>
            {TITLE_CANDIDATES.map(({ name, cls }) => (
              <Column key={name} name={name}>
                <EndCall titleClass={cls} />
              </Column>
            ))}
          </Columns>
        </Exemplar>
      </Case>

      <Case title="A parent giving up a place">
        <Exemplar
          file="src/components/family/SeatOfferBlock.tsx"
          page="Parent, waitlist seat offer"
        >
          <Columns of={2}>
            {TITLE_CANDIDATES.map(({ name, cls }) => (
              <Column key={name} name={name}>
                <GiveUpPlace titleClass={cls} />
              </Column>
            ))}
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}

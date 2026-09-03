"use client";

import { useId } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_EMAIL } from "@/lib/constants";

/** Shorter than this and there is nothing for a human to act on. */
export const HELP_MESSAGE_MIN_LENGTH = 10;
/** The cap the API's own schema enforces; the textarea refuses to exceed it. */
export const HELP_MESSAGE_MAX_LENGTH = 2000;

/**
 * Who is writing, which is the only thing that varies about this form.
 *
 * Two values rather than four roles: a parent and a gedu are both adults being
 * written to in the same register, and the child-facing copy is the one genuine
 * fork. Naming it by register rather than by role is what keeps a fourth role
 * from arriving as a fourth variant.
 */
export type HelpFeedbackAudience = "adult" | "gamer";

/**
 * Why a submit did not land. Two cases, because the reader can only do two
 * different things about it: wait, or try again.
 *
 * A code rather than a sentence, so the copy is resolved *here*, against the
 * audience's own namespace. The route answers a 429 with an English sentence
 * meant for a developer; showing it would put untranslated text on a French
 * family's dashboard.
 */
export type HelpFeedbackFailure = "rateLimited" | "failed";

export interface HelpFeedbackCardViewProps {
  audience: HelpFeedbackAudience;
  /**
   * The message being written. Controlled by the caller so the live card can
   * clear it on success and a preview scene can let typing work while the
   * submit reaches nothing.
   */
  message: string;
  onMessageChange: (message: string) => void;
  /** The submit is in flight: the button is disabled and says so. */
  submitting: boolean;
  /** The last submit landed. Cleared the moment a new one starts. */
  succeeded: boolean;
  /** Why the last submit failed, or `null`. */
  error: HelpFeedbackFailure | null;
  onSubmit: () => void;
}

/**
 * Presentational core of the ask-for-help-or-send-feedback form, rendered
 * unchanged in the parent, gamer and gedu Help & feedback sections.
 *
 * **It carries no heading of its own.** Every surface that renders it puts it
 * under a section heading that already says "Help & feedback", and a card title
 * repeating that in the next line is the same sentence twice. The lead
 * paragraph does the work a title would.
 *
 * It owns no fetch, no mutation and no router: the caller hands it the whole
 * state and takes the submit. That is what lets a preview scene render the real
 * form with the submit inert — a scene must never gain a live submit that
 * emails every admin — and it is why the three dashboards are looking at one
 * component rather than at three copies of one.
 *
 * The result appears **below the submit button** once a submit has answered, and
 * no space is held open for it before that. Below is the only place it can go:
 * everything above it — the lead text, the textarea, the button the reader's
 * cursor is still on — survives the change, so a banner inserted over the form
 * would push all of it down. Appended at the end of the card, its arrival moves
 * nothing, and no slot is reserved for it either, since a reserved one would be
 * a permanent hole in a card nobody has used yet.
 *
 * The committing-boolean pattern is deliberately not wanted here. It exists for
 * actions whose success path navigates or swaps the panel out, where the
 * pending flag drops a beat before the page goes away; nothing navigates here,
 * the answer lands in the card the button sits in, and writing a second message
 * is a legitimate thing to want — so the button coming back is the correct end
 * state rather than a race.
 */
export function HelpFeedbackCardView({
  audience,
  message,
  onMessageChange,
  submitting,
  succeeded,
  error,
  onSubmit,
}: HelpFeedbackCardViewProps) {
  const t = useTranslations("helpSection.form");
  const c = useTranslations("common");
  // Generated, never a literal: the style guide renders six of these cards on
  // one page, and a hardcoded id would give six labels and six textareas the
  // same one — so every label would point at the first card's field.
  const fieldId = useId();

  const tooShort = message.length < HELP_MESSAGE_MIN_LENGTH;
  const canSubmit = !tooShort && message.length <= HELP_MESSAGE_MAX_LENGTH;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Icon plus lead text: the form opens the section, so this paragraph
            is the first thing the reader meets and has to say what the section
            is for. */}
        <div className="flex items-start gap-3">
          <MessageSquare
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden
          />
          <div className="space-y-1 text-sm text-muted-foreground">
            {audience === "adult" ? (
              /* The support address lives *in* the adult lead paragraph rather
                 than in a card of its own beside it: one place to write to us
                 and one shape to read, instead of a box that said the same
                 thing in a second grammar. The address is interpolated from the
                 constant and never typed into `messages/` — a literal there is
                 how the legal pages once carried three different addresses
                 across five languages — and it renders as a live mailto,
                 because a dashboard draws no footer and this is the only place
                 on the page it appears. */
              <p>
                {t.rich("adult.description", {
                  email: SUPPORT_EMAIL,
                  link: (chunks) => (
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="text-primary hover:underline"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            ) : (
              <>
                <p>{t("gamer.description")}</p>
                {/* Nothing routes this submission to the child's Gedu, and a
                    gamer account has no mailbox of its own — so the note
                    promises no reply channel and names no address, because
                    either would be an answer the child cannot use. What it
                    does is set the expectation: an answer, if one comes,
                    comes in person at the next session. Its own line rather
                    than appended to the sentence above: it is a different
                    fact, and one the child's parent may be reading over their
                    shoulder. */}
                <p>{t("gamer.replyNote")}</p>
              </>
            )}
          </div>
        </div>

        <Field label={t("messageLabel")} htmlFor={fieldId}>
          <Textarea
            id={fieldId}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            placeholder={t(`${audience}.placeholder`)}
            rows={6}
            maxLength={HELP_MESSAGE_MAX_LENGTH}
            className="resize-y"
          />
          {/* Both counters sit on one row that is always present, so neither
              the remaining-characters hint appearing nor the length counter
              growing moves the button beneath it. The hint's absence renders
              nothing at all: the row is `justify-between` with the length
              counter unconditionally on the right, so the row keeps its height
              without a placeholder space holding the left half open. */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {tooShort && message.length > 0
                ? t("charactersNeeded", {
                    count: HELP_MESSAGE_MIN_LENGTH - message.length,
                  })
                : null}
            </span>
            <span>
              {message.length}/{HELP_MESSAGE_MAX_LENGTH}
            </span>
          </div>
        </Field>

        <Button onClick={onSubmit} disabled={submitting || !canSubmit}>
          {submitting ? c("sending") : t("submit")}
        </Button>

        {/* The answer, last in the card — see the component docblock for why it
            can only go here. */}
        {succeeded && (
          <p className="rounded-md bg-success/10 p-3 text-sm text-success">
            {t(`${audience}.thankYou`)}
          </p>
        )}

        {error !== null && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error === "rateLimited"
              ? t(`${audience}.tooManyRequests`)
              : t(`${audience}.failed`)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ChoiceChip,
  TeamCardAboutSection,
  TeamCardAccountSection,
  TeamCardPhotoSection,
  TeamCardSkillsSection,
  TeamCardTopicsSection,
  contentFromForm,
  contentFromProfile,
  formFromProfile,
  profileWithContent,
  sameContent,
  type TeamCardContent,
  type TeamCardForm,
} from "@/components/team/team-card-form";
import {
  TeamProfileBody,
  type AdminTeamProfile,
  type GeduTeamProfile,
  type TeamProfile,
} from "@/components/team/team-profile-body";

/**
 * Where a Gedu's card is in its review.
 *
 * A Gedu edits a **draft**; an admin approves it and the approved version goes
 * live. Each variant carries the live card exactly when one exists, so a state
 * with a live card and nothing to show for it cannot be written down.
 *
 * - `draft` — never submitted, nothing live.
 * - `inReview` — submitted, not yet decided, nothing live.
 * - `live` — the approved card is up. Edits to the draft stay in the draft
 *   until they are submitted and approved.
 * - `changesInReview` — the approved card is up, and a changed draft is
 *   waiting for review.
 * - `returned` — an admin sent the submission back with a note. A card that
 *   was live before its changes were returned is still live.
 */
export type GeduTeamCardState =
  | { kind: "draft" }
  | { kind: "inReview" }
  | { kind: "live"; live: GeduTeamProfile }
  | { kind: "changesInReview"; live: GeduTeamProfile }
  | {
      kind: "returned";
      live: GeduTeamProfile | null;
      /** The first name of the admin who returned it. */
      returnedBy: string;
      note: string;
    };

/** An office card is published directly, so it is only ever up or down. */
export type AdminTeamCardState = { kind: "published" } | { kind: "hidden" };

/**
 * The writes a Gedu's card page makes. Each is a backend action, so each is
 * the caller's; the scene passes inert ones.
 */
export interface GeduTeamCardActions {
  onChoosePhoto: () => void;
  onSaveDraft: (content: TeamCardContent) => void;
  onSubmit: (content: TeamCardContent) => void;
  onWithdraw: () => void;
  onRemove: () => void;
}

export interface AdminTeamCardActions {
  onChoosePhoto: () => void;
  onSave: (content: TeamCardContent) => void;
  onHide: () => void;
  onShow: () => void;
}

export type TeamCardEditorProps =
  | {
      role: "gedu";
      /** The saved draft — what the form opens on. */
      draft: GeduTeamProfile;
      state: GeduTeamCardState;
      actions: GeduTeamCardActions;
    }
  | {
      role: "admin";
      /** The saved card — for an admin, the published one. */
      card: AdminTeamProfile;
      state: AdminTeamCardState;
      actions: AdminTeamCardActions;
    };

/**
 * The page a person edits their own team card on — office staff and Gedus
 * alike, one body with the differences in its props.
 *
 * **The difference is the workflow.** Admins are trusted, so what they save is
 * what the team page shows, and hiding or showing the card is theirs to do. A
 * Gedu edits a draft that an admin approves; the approved version is what goes
 * live, and later edits wait in the draft until they are approved in turn.
 *
 * **Editing is locked while a submission waits**, and withdrawing it is the
 * way back in. The admin approves one exact card; if the draft could change
 * under them, what went live would be something nobody reviewed.
 *
 * **The consent is part of the submit step, on the page, not in a dialog.** It
 * is asked whenever a submission would put the card on the public page for the
 * first time — nothing is live yet — and not for changes to a card that is
 * already up, which the Gedu can take down at any time from the status panel.
 *
 * Desktop-default, as a Gedu and admin surface is: the form on one side and the
 * live preview on the other, sticky, so what the public will see is in view
 * while typing. Below the wide breakpoint the two stack, form first.
 *
 * The form's state is local UI state. Every write goes out through `actions`,
 * which the route owns.
 */
export function TeamCardEditorBody(props: TeamCardEditorProps) {
  const t = useTranslations("team.edit");
  const saved = props.role === "gedu" ? props.draft : props.card;
  const [form, setForm] = useState<TeamCardForm>(() => formFromProfile(saved));
  const [consented, setConsented] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const content = contentFromForm(form, saved.kind);
  const dirty = !sameContent(content, contentFromProfile(saved));
  const draftProfile = profileWithContent(saved, content);

  const live: TeamProfile | null =
    props.role === "admin"
      ? props.state.kind === "published"
        ? props.card
        : null
      : "live" in props.state
        ? props.state.live
        : null;
  const locked =
    props.role === "gedu" &&
    (props.state.kind === "inReview" || props.state.kind === "changesInReview");

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-24">
      {/* The page's home is settings, beside the account facts the card
          shows but does not edit. */}
      <Link
        href={ROUTES.settings}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="max-w-3xl text-muted-foreground">
          {props.role === "gedu" ? t("introGedu") : t("introAdmin")}
        </p>
      </header>

      {props.role === "gedu" ? (
        <GeduStatusPanel
          state={props.state}
          onWithdraw={props.actions.onWithdraw}
          onRemove={() => setRemoveOpen(true)}
        />
      ) : (
        <AdminStatusPanel
          state={props.state}
          onHide={props.actions.onHide}
          onShow={props.actions.onShow}
        />
      )}

      <div
        className={cn(
          "grid gap-8",
          // An admin page carries the sidebar, so the two columns wait for the
          // width that leaves room for both.
          props.role === "gedu"
            ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start"
            : "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start",
        )}
      >
        <div className="space-y-6">
          {/* A native disabled fieldset locks every control inside it at
              once, which is the whole of what "editing is paused" means. */}
          <fieldset disabled={locked} className="min-w-0 space-y-6">
            <TeamCardPhotoSection
              personId={saved.id}
              photo={form.photo}
              onChoose={props.actions.onChoosePhoto}
              update={setForm}
            />
            <TeamCardAboutSection
              kind={saved.kind}
              form={form}
              spokenLanguages={saved.spokenLanguages}
              update={setForm}
            />
            <TeamCardSkillsSection
              skills={form.skills}
              nextSkillKey={form.nextSkillKey}
              update={setForm}
            />
            <TeamCardTopicsSection topics={form.topics} update={setForm} />
          </fieldset>

          <TeamCardAccountSection profile={saved} />

          {props.role === "gedu" &&
            props.state.kind !== "inReview" &&
            props.state.kind !== "changesInReview" && (
            <GeduSubmitStep
              state={props.state}
              content={content}
              dirty={dirty}
              consented={consented}
              onConsentChange={setConsented}
              actions={props.actions}
            />
            )}
          {props.role === "admin" && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={!dirty}
                onClick={() => setForm(formFromProfile(saved))}
              >
                {t("actions.discard")}
              </Button>
              <Button
                disabled={!dirty}
                onClick={() => props.actions.onSave(content)}
              >
                {props.state.kind === "published"
                  ? t("actions.publish")
                  : t("actions.save")}
              </Button>
            </div>
          )}
        </div>

        <TeamCardPreview
          role={props.role}
          draft={draftProfile}
          live={live}
          dirty={dirty}
          hidden={props.role === "admin" && props.state.kind === "hidden"}
          wide={props.role === "gedu" ? "lg" : "xl"}
        />
      </div>

      {props.role === "gedu" && (
        <ConfirmDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          title={t("removeDialog.title")}
          description={t("removeDialog.description")}
          confirmLabel={t("removeDialog.confirm")}
          onConfirm={props.actions.onRemove}
        />
      )}
    </div>
  );
}

/**
 * The status panel's frame: the state's title and sentence, the admin's note
 * where there is one, and the state's own actions — the ones about the card as
 * a whole rather than about what is typed into it — right-packed beside them.
 */
function StatusPanel({
  variant,
  title,
  body,
  note,
  children,
}: {
  variant: "default" | "info" | "success" | "warning";
  title: string;
  body: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert variant={variant}>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{body}</AlertDescription>
          {note !== undefined && (
            <blockquote className="mt-3 max-w-2xl whitespace-pre-line border-l-2 border-border pl-3 text-foreground">
              {note}
            </blockquote>
          )}
        </div>
        {children !== undefined && (
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            {children}
          </div>
        )}
      </div>
    </Alert>
  );
}

function GeduStatusPanel({
  state,
  onWithdraw,
  onRemove,
}: {
  state: GeduTeamCardState;
  onWithdraw: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("team.edit");
  const removeButton = (
    <Button variant="outline" size="sm" onClick={onRemove}>
      <EyeOff aria-hidden />
      {t("actions.remove")}
    </Button>
  );

  switch (state.kind) {
    case "draft":
      return (
        <StatusPanel
          variant="default"
          title={t("status.draftTitle")}
          body={t("status.draftBody")}
        />
      );
    case "inReview":
      return (
        <StatusPanel
          variant="info"
          title={t("status.inReviewTitle")}
          body={t("status.inReviewBody")}
        >
          <Button variant="outline" size="sm" onClick={onWithdraw}>
            {t("actions.withdraw")}
          </Button>
        </StatusPanel>
      );
    case "live":
      return (
        <StatusPanel
          variant="success"
          title={t("status.liveTitle")}
          body={t("status.liveBody")}
        >
          {removeButton}
        </StatusPanel>
      );
    case "changesInReview":
      return (
        <StatusPanel
          variant="info"
          title={t("status.changesInReviewTitle")}
          body={t("status.changesInReviewBody")}
        >
          {removeButton}
          <Button variant="outline" size="sm" onClick={onWithdraw}>
            {t("actions.withdrawChanges")}
          </Button>
        </StatusPanel>
      );
    case "returned":
      return (
        <StatusPanel
          variant="warning"
          title={t("status.returnedTitle")}
          body={t("status.returnedBody", { name: state.returnedBy })}
          note={state.note}
        >
          {state.live !== null && removeButton}
        </StatusPanel>
      );
  }
}

function AdminStatusPanel({
  state,
  onHide,
  onShow,
}: {
  state: AdminTeamCardState;
  onHide: () => void;
  onShow: () => void;
}) {
  const t = useTranslations("team.edit");
  return state.kind === "published" ? (
    <StatusPanel
      variant="success"
      title={t("status.publishedTitle")}
      body={t("status.publishedBody")}
    >
      <Button variant="outline" size="sm" onClick={onHide}>
        <EyeOff aria-hidden />
        {t("actions.hide")}
      </Button>
    </StatusPanel>
  ) : (
    <StatusPanel
      variant="default"
      title={t("status.hiddenTitle")}
      body={t("status.hiddenBody")}
    >
      <Button size="sm" onClick={onShow}>
        <Eye aria-hidden />
        {t("actions.show")}
      </Button>
    </StatusPanel>
  );
}

/**
 * The foot of a Gedu's form: the consent where one is owed, then Save draft
 * and the submit, affirmative last.
 *
 * Submitting a change to a live card is only possible once the draft differs
 * from what is live — there is nothing to review otherwise — and a first
 * submission only once the consent is ticked.
 */
function GeduSubmitStep({
  state,
  content,
  dirty,
  consented,
  onConsentChange,
  actions,
}: {
  state: Exclude<
    GeduTeamCardState,
    { kind: "inReview" } | { kind: "changesInReview" }
  >;
  content: TeamCardContent;
  dirty: boolean;
  consented: boolean;
  onConsentChange: (next: boolean) => void;
  actions: GeduTeamCardActions;
}) {
  const t = useTranslations("team.edit");
  const live = state.kind === "draft" ? null : state.live;
  const needsConsent = live === null;
  const differsFromLive =
    live === null || !sameContent(content, contentFromProfile(live));
  const submitLabel =
    state.kind === "returned"
      ? t("actions.resubmit")
      : live === null
        ? t("actions.submit")
        : t("actions.submitChanges");

  return (
    <div className="space-y-4">
      {needsConsent && (
        <CheckboxRow
          checked={consented}
          onCheckedChange={onConsentChange}
          label={t("consent")}
        />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          disabled={!dirty}
          onClick={() => actions.onSaveDraft(content)}
        >
          {t("actions.saveDraft")}
        </Button>
        <Button
          disabled={!differsFromLive || (needsConsent && !consented)}
          onClick={() => actions.onSubmit(content)}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * The live preview: the public page's own body, over whatever is in the form.
 *
 * **Which version the public sees is always stated in words**, in the line
 * under the heading, because a preview of a draft that looks exactly like a
 * public page is the easiest thing on this screen to misread. Where a live
 * card exists and the draft differs from it, a toggle beside the heading
 * switches the frame between the two; it sits at the end of the heading row,
 * where the slack is, so its arrival as somebody starts typing moves nothing.
 *
 * The frame is framed content — the page as it will appear — so the body's
 * own cards sit inside it on the page ground, as they will on the team page.
 */
function TeamCardPreview({
  role,
  draft,
  live,
  dirty,
  hidden,
  wide,
}: {
  role: "gedu" | "admin";
  draft: TeamProfile;
  live: TeamProfile | null;
  dirty: boolean;
  hidden: boolean;
  wide: "lg" | "xl";
}) {
  const t = useTranslations("team.edit.preview");
  const [view, setView] = useState<"draft" | "live">("draft");

  const draftDiffers =
    live !== null &&
    !sameContent(contentFromProfile(draft), contentFromProfile(live));
  const canToggle = role === "gedu" && draftDiffers;
  const showing = canToggle && view === "live" ? live : draft;

  const caption =
    role === "admin"
      ? hidden
        ? t("adminHidden")
        : dirty
          ? t("adminUnpublished")
          : t("liveNow")
      : live === null
        ? t("nothingLive")
        : showing === live || !draftDiffers
          ? t("liveNow")
          : t("draftOverLive");

  return (
    <section
      aria-labelledby="team-card-preview-heading"
      className={cn(
        "space-y-3",
        wide === "lg"
          ? "lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:flex lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:flex-col"
          : "xl:sticky xl:top-[calc(var(--header-height)+1.5rem)] xl:flex xl:max-h-[calc(100vh-var(--header-height)-3rem)] xl:flex-col",
      )}
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h2 id="team-card-preview-heading" className="text-lg font-semibold">
          {t("heading")}
        </h2>
        {canToggle && (
          <div
            role="group"
            aria-label={t("versions")}
            className="flex flex-wrap gap-2"
          >
            <ChoiceChip
              pressed={view === "draft"}
              onPress={() => setView("draft")}
            >
              {t("draft")}
            </ChoiceChip>
            <ChoiceChip pressed={view === "live"} onPress={() => setView("live")}>
              {t("live")}
            </ChoiceChip>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{caption}</p>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background",
          wide === "lg"
            ? "lg:min-h-0 lg:overflow-y-auto"
            : "xl:min-h-0 xl:overflow-y-auto",
        )}
      >
        <TeamProfileBody profile={showing} />
      </div>
    </section>
  );
}

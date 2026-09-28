"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  StatusLine,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/utils";
import {
  FormSection,
  TeamCardAboutSection,
  TeamCardPhotoSection,
  TeamCardWritingSection,
  contentFromForm,
  contentFromProfile,
  formFromProfile,
  profileWithContent,
  sameContent,
  teamCardGap,
  type TeamCardContent,
  type TeamCardForm,
  type TeamCardGap,
} from "@/components/team/team-card-form";
import {
  TeamProfileBody,
  type AdminTeamProfile,
  type GeduTeamProfile,
  type TeamProfile,
} from "@/components/team/team-profile-body";

/**
 * Where an admin's decision about a Gedu's card stands. It is independent of
 * the Gedu's own switch and survives it being turned off and on again:
 *
 * - `pending` — no admin has approved the card yet.
 * - `approved` — an admin put it up; while the Gedu's switch is on it is live,
 *   and their later edits go live on save, with no second look.
 * - `withdrawn` — an admin took an approved card down.
 */
export type GeduTeamCardApproval = "pending" | "approved" | "withdrawn";

/**
 * The writes the page makes. Each is a backend action, so each is the
 * caller's; the scenes pass ones that only move local state.
 */
export interface TeamCardActions {
  /** A freshly cropped photo's bytes. The form already shows it. */
  onUploadPhoto: (photo: Blob) => void;
  onSave: (content: TeamCardContent) => void;
  /**
   * The person's own switch — a Gedu's "ready", an admin's "show". Turning it
   * on saves what is in the form with it, so what the person agreed to show
   * is what they were looking at; turning it off saves nothing and takes
   * effect at once.
   */
  onSwitch: (on: boolean, content: TeamCardContent) => void;
}

export type TeamCardEditorProps =
  | {
      role: "gedu";
      /** The saved card — what the form opens on. */
      card: GeduTeamProfile;
      /** The Gedu's own switch: their consent to the card being public. */
      ready: boolean;
      approval: GeduTeamCardApproval;
      actions: TeamCardActions;
    }
  | {
      role: "admin";
      card: AdminTeamProfile;
      /** Office staff are trusted, so their one switch is the whole decision. */
      shown: boolean;
      actions: TeamCardActions;
    };

/** The combined state, as the person is told it. */
type CardStatus = "private" | "waiting" | "live" | "takenOff" | "shown" | "hidden";

function cardStatus(props: TeamCardEditorProps): CardStatus {
  if (props.role === "admin") return props.shown ? "shown" : "hidden";
  if (!props.ready) return "private";
  switch (props.approval) {
    case "pending":
      return "waiting";
    case "approved":
      return "live";
    case "withdrawn":
      return "takenOff";
  }
}

/**
 * The page a person edits their own team card on — office staff and Gedus
 * alike, one body with the differences in its props.
 *
 * **A card is public only while two switches are on**: the person's own, and
 * — for a Gedu — an admin's approval, which is made elsewhere and only read
 * here. Saving never needs anybody. The person's switch is their consent, so
 * it acts at once in both directions, and it can only be turned on once the
 * card is complete; while it is on, the card has to stay complete to save.
 *
 * Desktop-default, as a Gedu and admin surface is: the form on one side and
 * the live preview on the other, sticky, so what the public will see is in
 * view while typing. Below the wide breakpoint the two stack, form first.
 *
 * **The switch sits at the foot of the form, after the fields**, because the
 * line under it changes as the card is completed: at the foot, that change
 * moves nothing but the save row, rather than every field below it.
 *
 * The form's state is local UI state. Every write goes out through `actions`,
 * which the route owns.
 */
export function TeamCardEditorBody(props: TeamCardEditorProps) {
  const t = useTranslations("team.edit");
  const uiLocale = resolveLocale(useLocale());
  const [form, setForm] = useState<TeamCardForm>(() =>
    formFromProfile(props.card, uiLocale),
  );

  const content = contentFromForm(form, props.card.kind);
  const dirty = !sameContent(content, contentFromProfile(props.card));
  const gap = teamCardGap(content);
  const status = cardStatus(props);
  const on = props.role === "gedu" ? props.ready : props.shown;
  const isPublic = status === "live" || status === "shown";

  const trackUrl = useOwnedObjectUrls(form.photo?.src, props.card.photo?.src);

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

      <StatusPanel status={status} />

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
        <div className="min-w-0 space-y-6">
          <TeamCardPhotoSection
            personId={props.card.id}
            photo={form.photo}
            onCropped={(blob, url) => {
              trackUrl(url);
              props.actions.onUploadPhoto(blob);
            }}
            update={setForm}
          />
          <TeamCardAboutSection
            kind={props.card.kind}
            form={form}
            update={setForm}
          />
          <TeamCardWritingSection form={form} update={setForm} />

          <PublicSwitch
            role={props.role}
            on={on}
            gap={gap}
            onChange={(next) => props.actions.onSwitch(next, content)}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => setForm(formFromProfile(props.card, uiLocale))}
            >
              {t("actions.discard")}
            </Button>
            <Button
              disabled={!dirty || (on && gap !== null)}
              onClick={() => props.actions.onSave(content)}
            >
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <TeamCardPreview
          profile={profileWithContent(props.card, content)}
          readerLocale={form.activeLocale}
          caption={
            !isPublic
              ? t("preview.notPublic")
              : dirty
                ? t("preview.unsaved")
                : t("preview.liveNow")
          }
          wide={props.role === "gedu" ? "lg" : "xl"}
        />
      </div>
    </div>
  );
}

/**
 * The object URLs this page made for cropped photos, each revoked once
 * neither the form nor the saved card shows it, and all of them on unmount.
 * Returns the function that hands a new one over.
 */
function useOwnedObjectUrls(
  formSrc: string | undefined,
  savedSrc: string | undefined,
) {
  const owned = useRef(new Set<string>());

  useEffect(() => {
    for (const url of owned.current) {
      if (url === formSrc || url === savedSrc) continue;
      URL.revokeObjectURL(url);
      owned.current.delete(url);
    }
  }, [formSrc, savedSrc]);

  useEffect(() => {
    const urls = owned.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  return (url: string) => {
    owned.current.add(url);
  };
}

const STATUS_VARIANT: Record<
  CardStatus,
  "default" | "info" | "success" | "warning"
> = {
  private: "default",
  waiting: "info",
  live: "success",
  takenOff: "warning",
  shown: "success",
  hidden: "default",
};

/**
 * Where the card stands, in words. The title names the combined state of the
 * two switches, so a Gedu never has to work out from two facts which of four
 * things is true.
 */
function StatusPanel({ status }: { status: CardStatus }) {
  const t = useTranslations("team.edit.status");
  return (
    <Alert variant={STATUS_VARIANT[status]}>
      <div className="min-w-0 space-y-1.5">
        <AlertTitle>{t(`${status}Title`)}</AlertTitle>
        <AlertDescription>{t(`${status}Body`)}</AlertDescription>
      </div>
    </Alert>
  );
}

/**
 * The person's own switch, with the line that says whether the card is
 * complete enough for it. The line is always there — the reason while it is
 * off and cannot be turned on, a confirmation once the card is complete, and
 * a warning while it is on and something has since been emptied — so the
 * switch's row never grows or shrinks as fields are filled in.
 */
function PublicSwitch({
  role,
  on,
  gap,
  onChange,
}: {
  role: "gedu" | "admin";
  on: boolean;
  gap: TeamCardGap;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("team.edit.switch");
  return (
    <FormSection heading={t("heading")}>
      <CheckboxRow
        checked={on}
        disabled={!on && gap !== null}
        onCheckedChange={onChange}
        label={role === "gedu" ? t("readyLabel") : t("showLabel")}
        hint={role === "gedu" ? t("readyHint") : t("showHint")}
      />
      {gap === null ? (
        <StatusLine status="success" muted>
          {t("complete")}
        </StatusLine>
      ) : on ? (
        <StatusLine status="warning">{t("mustStayComplete")}</StatusLine>
      ) : (
        <StatusLine status="info" muted>
          {t(`missing.${gap}`)}
        </StatusLine>
      )}
    </FormSection>
  );
}

/**
 * The live preview: the public page's own body, over whatever is in the form,
 * in the language tab being edited.
 *
 * **Whether the public sees this is always stated in words**, in the line
 * under the heading, because a preview that looks exactly like a public page
 * is the easiest thing on this screen to misread.
 *
 * The frame is framed content — the page as it will appear — so the body's
 * own card sits inside it on the page ground, as it will on the team page.
 */
function TeamCardPreview({
  profile,
  readerLocale,
  caption,
  wide,
}: {
  profile: TeamProfile;
  readerLocale: SupportedLocale;
  caption: string;
  wide: "lg" | "xl";
}) {
  const t = useTranslations("team.edit.preview");
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
      <h2 id="team-card-preview-heading" className="text-lg font-semibold">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{caption}</p>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-background",
          wide === "lg"
            ? "lg:min-h-0 lg:overflow-y-auto"
            : "xl:min-h-0 xl:overflow-y-auto",
        )}
      >
        <TeamProfileBody profile={profile} readerLocale={readerLocale} />
      </div>
    </section>
  );
}

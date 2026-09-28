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
  TeamProfileAboutSection,
  TeamProfilePhotoSection,
  TeamProfileWritingSection,
  contentFromForm,
  contentFromProfile,
  formFromProfile,
  profileWithContent,
  sameContent,
  teamProfileGap,
  type TeamProfileContent,
  type TeamProfileForm,
  type TeamProfileGap,
} from "@/components/team/team-profile-form";
import {
  TeamProfileBody,
  type AdminTeamProfile,
  type GeduTeamProfile,
  type TeamProfile,
} from "@/components/team/team-profile-body";

/**
 * Where an admin's decision about a Gedu's profile stands. It is independent
 * of the Gedu's own checkbox and survives it being turned off and on again:
 *
 * - `pending` — no admin has approved the profile yet.
 * - `approved` — an admin put it up; while the Gedu's checkbox is on it is
 *   public, and their later edits go live on save, with no second look.
 * - `withdrawn` — an admin took an approved profile down.
 */
export type GeduTeamProfileApproval = "pending" | "approved" | "withdrawn";

/**
 * The writes the page makes. Each is a backend action, so each is the
 * caller's; the scenes pass ones that only move local state.
 */
export interface TeamProfileActions {
  /** A freshly cropped photo's bytes. The form already shows it. */
  onUploadPhoto: (photo: Blob) => void;
  /**
   * Save the profile and the person's own checkbox together — a Gedu's
   * "ready", an admin's "show". The checkbox is a field like any other, so
   * ticking or unticking it does nothing until this runs, and what the person
   * agreed to show is exactly what they were looking at when they saved.
   */
  onSave: (content: TeamProfileContent, on: boolean) => void;
}

export type TeamProfileEditorProps =
  | {
      role: "gedu";
      /** The saved profile — what the form opens on. */
      profile: GeduTeamProfile;
      /** The Gedu's saved checkbox: their consent to the profile being public. */
      ready: boolean;
      approval: GeduTeamProfileApproval;
      actions: TeamProfileActions;
    }
  | {
      role: "admin";
      profile: AdminTeamProfile;
      /** Office staff are trusted, so their one checkbox is the whole decision. */
      shown: boolean;
      actions: TeamProfileActions;
    };

/** The combined saved state, as the person is told it. */
type ProfileStatus =
  | "private"
  | "waiting"
  | "live"
  | "takenOff"
  | "shown"
  | "hidden";

function profileStatus(props: TeamProfileEditorProps): ProfileStatus {
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
 * The page a person edits their own public profile on — office staff and
 * Gedus alike, one body with the differences in its props.
 *
 * **A profile is public only while two things are true**: the person's own
 * checkbox is saved on, and — for a Gedu — an admin has approved it, which is
 * decided elsewhere and only read here. The checkbox is an ordinary field that
 * Save commits with everything else: ticking or unticking it dirties the form,
 * and nothing takes effect until Save. It can only be ticked once the profile
 * is complete, and while it is ticked the profile has to stay complete to save.
 *
 * **No introduction.** The page explains itself: the title, the preview
 * beside the form and its caption, and the "Public profile" section, whose
 * checkbox hint is the one place the two-switch model is spelt out.
 *
 * Desktop-default, as a Gedu and admin surface is: the form on one side and
 * the live preview on the other, sticky, so what the public will see is in
 * view while typing. Below the wide breakpoint the two stack, form first.
 *
 * **The "Public profile" section sits at the foot of the form, after the
 * fields**, and holds everything about being public: where the saved profile
 * stands, the checkbox, and whether the profile is complete enough for it. The
 * lines under the checkbox change as the profile is completed and as it is
 * ticked; at the foot, that moves nothing but the save row.
 *
 * The form's state is local UI state. Every write goes out through `actions`,
 * which the route owns.
 */
export function TeamProfileEditorBody(props: TeamProfileEditorProps) {
  const t = useTranslations("team.edit");
  const uiLocale = resolveLocale(useLocale());
  const savedOn = props.role === "gedu" ? props.ready : props.shown;
  const [form, setForm] = useState<TeamProfileForm>(() =>
    formFromProfile(props.profile, uiLocale),
  );
  const [on, setOn] = useState(savedOn);

  const content = contentFromForm(form, props.profile);
  const dirty =
    on !== savedOn || !sameContent(content, contentFromProfile(props.profile));
  const gap = teamProfileGap(content);
  const status = profileStatus(props);
  const isPublic = status === "live" || status === "shown";

  const trackUrl = useOwnedObjectUrls(
    form.photo?.src,
    props.profile.photo?.src,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-24">
      {/* The page's home is settings, beside the account facts the profile
          shows but does not edit. */}
      <Link
        href={ROUTES.settings}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>

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
          <TeamProfilePhotoSection
            photo={form.photo}
            onCropped={(blob, url) => {
              trackUrl(url);
              props.actions.onUploadPhoto(blob);
            }}
            update={setForm}
          />
          <TeamProfileAboutSection
            kind={props.profile.kind}
            form={form}
            update={setForm}
          />
          <TeamProfileWritingSection form={form} update={setForm} />

          <PublicSection
            role={props.role}
            status={status}
            on={on}
            savedOn={savedOn}
            gap={gap}
            onChange={setOn}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => {
                setForm(formFromProfile(props.profile, uiLocale));
                setOn(savedOn);
              }}
            >
              {t("actions.discard")}
            </Button>
            <Button
              disabled={!dirty || (on && gap !== null)}
              onClick={() => props.actions.onSave(content, on)}
            >
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <TeamProfilePreview
          profile={profileWithContent(props.profile, content)}
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
 * neither the form nor the saved profile shows it, and all of them on unmount.
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
  ProfileStatus,
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
 * Everything about the profile being public, in one section.
 *
 * **The status names the saved state**, the combined state of the checkbox as
 * last saved and, for a Gedu, an admin's approval, so a Gedu never has to work
 * out from two facts which of four things is true. It is a state message, so
 * it is the status panel even inside this card.
 *
 * **The checkbox is the form's value**, and the line under it is always there
 * — the reason while it is off and cannot be ticked, a confirmation once the
 * profile is complete, and a warning while it is ticked and something has
 * since been emptied — so the row never grows or shrinks as fields are filled
 * in. While the checkbox differs from what is saved, one more line says the
 * change waits for Save; it appears as the direct result of the click that
 * made it.
 */
function PublicSection({
  role,
  status,
  on,
  savedOn,
  gap,
  onChange,
}: {
  role: "gedu" | "admin";
  status: ProfileStatus;
  on: boolean;
  savedOn: boolean;
  gap: TeamProfileGap;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("team.edit");
  return (
    <FormSection heading={t("switch.heading")}>
      <Alert variant={STATUS_VARIANT[status]}>
        <div className="min-w-0 space-y-1.5">
          <AlertTitle>{t(`status.${status}Title`)}</AlertTitle>
          <AlertDescription>{t(`status.${status}Body`)}</AlertDescription>
        </div>
      </Alert>
      <div className="space-y-3">
        <CheckboxRow
          checked={on}
          disabled={!on && gap !== null}
          onCheckedChange={onChange}
          label={role === "gedu" ? t("switch.readyLabel") : t("switch.showLabel")}
          hint={role === "gedu" ? t("switch.readyHint") : t("switch.showHint")}
        />
        {gap === null ? (
          <StatusLine status="success" muted>
            {t("switch.complete")}
          </StatusLine>
        ) : on ? (
          <StatusLine status="warning">{t("switch.mustStayComplete")}</StatusLine>
        ) : (
          <StatusLine status="info" muted>
            {t(`switch.missing.${gap}`)}
          </StatusLine>
        )}
        {on !== savedOn && (
          <StatusLine status="info" muted>
            {t("switch.takesEffectOnSave")}
          </StatusLine>
        )}
      </div>
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
 * The frame is framed content — the page as it will appear — so the body sits
 * inside it on the page ground, as it will on the public page.
 */
function TeamProfilePreview({
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
      aria-labelledby="team-profile-preview-heading"
      className={cn(
        "space-y-3",
        wide === "lg"
          ? "lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:flex lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:flex-col"
          : "xl:sticky xl:top-[calc(var(--header-height)+1.5rem)] xl:flex xl:max-h-[calc(100vh-var(--header-height)-3rem)] xl:flex-col",
      )}
    >
      <h2 id="team-profile-preview-heading" className="text-lg font-semibold">
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

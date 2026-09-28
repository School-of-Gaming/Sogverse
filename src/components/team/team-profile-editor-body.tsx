"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
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
  teamProfileTooLong,
  type TeamProfileContent,
  type TeamProfileForm,
  type TeamProfileGap,
} from "@/components/team/team-profile-form";
import { TeamProfilePreviewFrame } from "@/components/team/team-profile-preview-frame";
import {
  TeamProfileStatusPanel,
  teamProfileStatus,
  type TeamProfileStatus,
} from "@/components/team/team-profile-status";
import type {
  AdminTeamProfile,
  GeduTeamProfile,
  TeamProfile,
} from "@/services/team-profiles/team-profiles.types";

/**
 * The writes the page makes. Each is a backend action, so each is the
 * caller's; the scenes pass ones that only move local state.
 */
export interface TeamProfileActions {
  /**
   * Save the profile and its checkbox together — a Gedu's "ready", an
   * admin's "show". The checkbox is a field like any other, so ticking or
   * unticking it does nothing until this runs, and what goes public is
   * exactly what the editor was looking at when they saved.
   *
   * `crop` is the bytes behind `content.photo` when this page cropped it, and
   * `null` when the photo is the saved one or there is none: nothing is
   * uploaded until this runs.
   */
  onSave: (content: TeamProfileContent, on: boolean, crop: Blob | null) => void;
}

/** What the route tells the page about a save it is making. */
interface TeamProfileSaveState {
  /** A save is in flight: Save and Discard hold still until it settles. */
  saving?: boolean;
  /** Why the last save failed, in the reader's words, or nothing. */
  saveError?: string | null;
}

export type TeamProfileEditorProps = TeamProfileSaveState & {
  /**
   * An admin is editing someone else's profile from the admin panel — any
   * admin's or Gedu's. The page is the same, checkbox included: it marks the
   * profile ready, it is not the person's consent, and admins manage profiles
   * for busy staff. What changes is who is addressed: the page speaks to the
   * admin about the person and leads back to that person's user page.
   */
  editedByAdmin?: boolean;
  actions: TeamProfileActions;
} & (
    | {
        role: "gedu";
        /** The saved profile — what the form opens on. */
        profile: GeduTeamProfile;
        /** The saved checkbox: the profile is marked ready to be public. */
        ready: boolean;
        /** An admin has made it public, decided on the user page and only read here. */
        approved: boolean;
      }
    | {
        role: "admin";
        profile: AdminTeamProfile;
        /** Office staff are trusted, so their one checkbox is the whole decision. */
        shown: boolean;
      }
  );

/**
 * The page a public profile is edited on — office staff's and Gedus' alike,
 * by the person themselves or by an admin, one body with the differences in
 * its props.
 *
 * **A profile is public only while two things are true**: its checkbox is
 * saved on, and — for a Gedu — an admin has made it public, which is decided
 * elsewhere and only read here. The checkbox is an ordinary field that Save
 * commits with everything else: ticking or unticking it dirties the form, and
 * nothing takes effect until Save. It can only be ticked once the profile is
 * complete, and while it is ticked the profile has to stay complete to save.
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
  const ta = useTranslations("team.admin");
  const uiLocale = resolveLocale(useLocale());
  const byAdmin = props.editedByAdmin === true;
  const saving = props.saving ?? false;
  const savedOn = props.role === "gedu" ? props.ready : props.shown;
  const [form, setForm] = useState<TeamProfileForm>(() =>
    formFromProfile(props.profile, uiLocale),
  );
  const [on, setOn] = useState(savedOn);

  const content = contentFromForm(form, props.profile);
  const dirty =
    on !== savedOn || !sameContent(content, contentFromProfile(props.profile));
  const gap = teamProfileGap(content);
  const tooLong = teamProfileTooLong(content);
  const status = teamProfileStatus(props);
  // An admin page carries the sidebar, so the two columns wait for the width
  // that leaves room for both.
  const wide = props.role === "admin" || byAdmin ? "xl" : "lg";

  const crops = useOwnedCrops(form.photo?.src, props.profile.photo?.src);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-24" data-reserve-scroll-gutter>
      {/* A person's own page's home is settings, beside the account facts
          the profile shows but does not edit; an admin editing someone
          else's came from that person's user page. */}
      <Link
        href={byAdmin ? ROUTES.admin.user(props.profile.id) : ROUTES.settings}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {byAdmin
          ? ta("edit.back", { name: props.profile.firstName })
          : t("back")}
      </Link>

      <h1 className="text-3xl font-bold tracking-tight">
        {byAdmin
          ? ta("edit.pageTitle", { name: props.profile.firstName })
          : t("pageTitle")}
      </h1>

      <div
        className={cn(
          "grid gap-8",
          wide === "lg"
            ? "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start"
            : "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start",
        )}
      >
        <div className="min-w-0 space-y-6">
          <TeamProfilePhotoSection
            photo={form.photo}
            onCropped={crops.add}
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
            byAdmin={byAdmin}
            name={props.profile.firstName}
            status={status}
            on={on}
            gap={gap}
            onChange={setOn}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setForm(formFromProfile(props.profile, uiLocale));
                setOn(savedOn);
              }}
            >
              {t("actions.discard")}
            </Button>
            <Button
              disabled={!dirty || saving || tooLong || (on && gap !== null)}
              onClick={() =>
                props.actions.onSave(content, on, crops.bytesOf(content.photo?.src))
              }
            >
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              {t("actions.save")}
            </Button>
          </div>
          {/* Last in the column, so a failed save adds a line below everything
              the reader was looking at rather than moving any of it. */}
          {props.saveError && (
            <StatusLine status="destructive" role="alert">
              {props.saveError}
            </StatusLine>
          )}
        </div>

        <TeamProfilePreview
          profile={profileWithContent(props.profile, content)}
          readerLocale={form.activeLocale}
          wide={wide}
        />
      </div>
    </div>
  );
}

/**
 * The photos this page cropped: each one's bytes, kept for the save that
 * uploads them, under the object URL made to show it. Each is let go — the
 * bytes dropped and the URL revoked — once neither the form nor the saved
 * profile shows it, and all of them on unmount; so a discarded, replaced or
 * removed crop goes nowhere.
 */
function useOwnedCrops(
  formSrc: string | undefined,
  savedSrc: string | undefined,
) {
  const owned = useRef(new Map<string, Blob>());

  useEffect(() => {
    for (const url of owned.current.keys()) {
      if (url === formSrc || url === savedSrc) continue;
      URL.revokeObjectURL(url);
      owned.current.delete(url);
    }
  }, [formSrc, savedSrc]);

  useEffect(() => {
    const crops = owned.current;
    return () => {
      for (const url of crops.keys()) URL.revokeObjectURL(url);
      crops.clear();
    };
  }, []);

  return {
    /** A new crop's bytes and the object URL made for them. */
    add(blob: Blob, url: string) {
      owned.current.set(url, blob);
    },
    /** The bytes behind a URL this page made, or `null` for any other. */
    bytesOf(url: string | undefined): Blob | null {
      return url === undefined ? null : (owned.current.get(url) ?? null);
    },
  };
}

/**
 * Everything about the profile being public, in one section.
 *
 * **The status names the saved state** (`teamProfileStatus`). It is a state
 * message, so it is the status panel even inside this card.
 *
 * **The checkbox is the form's value**, and the line under it is always there
 * — the reason while it is off and cannot be ticked, a confirmation once the
 * profile is complete, and a warning while it is ticked and something has
 * since been emptied — so the row never grows or shrinks as fields are filled
 * in. An unsaved change to the checkbox says nothing more here: Save
 * enabling is the signal, and a line appearing under the checkbox pushed the
 * form's buttons down under the pointer.
 *
 * **An admin editing someone else's profile meets the same section**, with
 * every word addressed to them about the person rather than to the person.
 */
function PublicSection({
  role,
  byAdmin,
  name,
  status,
  on,
  gap,
  onChange,
}: {
  role: "gedu" | "admin";
  byAdmin: boolean;
  name: string;
  status: TeamProfileStatus;
  on: boolean;
  gap: TeamProfileGap;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("team.edit");
  const ta = useTranslations("team.admin");
  const copy = byAdmin
    ? {
        title: ta(`status.${status}Title`),
        body: ta(`status.${status}Body`, { name }),
        label: role === "gedu" ? ta("edit.readyLabel") : ta("edit.showLabel"),
        hint:
          role === "gedu"
            ? ta("edit.readyHint", { name })
            : ta("edit.showHint", { name }),
        complete: ta("edit.complete"),
        mustStayComplete: ta("edit.mustStayComplete"),
        missing: gap === null ? null : ta(`edit.missing.${gap}`),
      }
    : {
        title: t(`status.${status}Title`),
        body: t(`status.${status}Body`),
        label: role === "gedu" ? t("switch.readyLabel") : t("switch.showLabel"),
        hint: role === "gedu" ? t("switch.readyHint") : t("switch.showHint"),
        complete: t("switch.complete"),
        mustStayComplete: t("switch.mustStayComplete"),
        missing: gap === null ? null : t(`switch.missing.${gap}`),
      };
  return (
    <FormSection heading={t("switch.heading")}>
      <TeamProfileStatusPanel status={status} title={copy.title} body={copy.body} />
      <div className="space-y-3">
        <CheckboxRow
          checked={on}
          disabled={!on && gap !== null}
          onCheckedChange={onChange}
          label={copy.label}
          hint={copy.hint}
        />
        {copy.missing === null ? (
          <StatusLine status="success" muted>
            {copy.complete}
          </StatusLine>
        ) : on ? (
          <StatusLine status="warning">{copy.mustStayComplete}</StatusLine>
        ) : (
          <StatusLine status="info" muted>
            {copy.missing}
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
 * It carries no caption: whether the public sees the profile is the status in
 * the "Public profile" section, and a caption here whose length followed the
 * form's state moved the whole preview every time it changed.
 */
function TeamProfilePreview({
  profile,
  readerLocale,
  wide,
}: {
  profile: TeamProfile;
  readerLocale: SupportedLocale;
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
      <TeamProfilePreviewFrame
        profile={profile}
        readerLocale={readerLocale}
        scrollFrom={wide}
      />
    </section>
  );
}

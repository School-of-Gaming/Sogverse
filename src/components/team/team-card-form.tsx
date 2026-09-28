"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichNoteField } from "@/components/gedu/session-feed/RichNoteField";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { cn, findOption } from "@/lib/utils";
import {
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_WIDTH,
  type TeamProfile,
  type TeamProfilePhoto,
  type TeamProfileTranslation,
} from "@/components/team/team-profile-body";
import {
  TEAM_PHOTO_ACCEPT,
  TeamPhotoCropDialog,
  decodeTeamPhoto,
  type TeamPhotoSource,
} from "@/components/team/team-photo-crop-dialog";

// ---------------------------------------------------------------------------
// The form's state, and the conversions around it
// ---------------------------------------------------------------------------

/** How long the one-line introduction may run. One line on the public page at its widest. */
export const SHORT_DESCRIPTION_MAX_LENGTH = 140;

/** A fun fact is one or two sentences. */
export const FUN_FACT_MAX_LENGTH = 200;

/** A nickname's length, generous for any name a game platform allows. */
const NICKNAME_MAX_LENGTH = 32;

/** An office title, e.g. "Head of Clubs". */
const TITLE_MAX_LENGTH = 60;

/**
 * One locale's text as typed. The product form's `TranslationDraft` shape with
 * this card's fields: two required descriptions and an optional fun fact.
 */
export interface TeamCardTranslationDraft {
  shortDescription: string;
  longDescription: string;
  funFact: string;
}

const EMPTY_TRANSLATION: TeamCardTranslationDraft = {
  shortDescription: "",
  longDescription: "",
  funFact: "",
};

/**
 * What the person is typing, as they type it — untrimmed — so the form never
 * rewrites a field under the cursor. It becomes a card through
 * `contentFromForm`, which is where trimming happens.
 *
 * The translations are the product form's per-locale map, with the open tab
 * beside it, so switching tabs keeps what was typed in each.
 */
export interface TeamCardForm {
  nickname: string;
  /** The office title. Unused for a Gedu, whose title is the role. */
  title: string;
  photo: TeamProfilePhoto | null;
  translations: Partial<Record<SupportedLocale, TeamCardTranslationDraft>>;
  activeLocale: SupportedLocale;
}

/**
 * The part of a card a person writes, normalised: what gets saved and
 * compared. `title` is `null` for a Gedu.
 *
 * A language tab with nothing typed in it is not content — it is a tab the
 * person opened and has not used — so it is dropped here, and a brand-new
 * card's first, empty tab neither dirties the form nor counts as a language.
 */
export interface TeamCardContent {
  nickname: string | null;
  title: string | null;
  photo: TeamProfilePhoto | null;
  translations: readonly TeamProfileTranslation[];
}

export function formFromProfile(
  profile: TeamProfile,
  uiLocale: SupportedLocale,
): TeamCardForm {
  const translations: TeamCardForm["translations"] = {};
  for (const row of profile.translations) {
    translations[row.locale] = {
      shortDescription: row.shortDescription,
      longDescription: row.longDescription,
      funFact: row.funFact ?? "",
    };
  }
  // A card with nothing written opens on one tab, in the reader's own UI
  // locale, exactly as a new product does.
  const first = profile.translations.at(0)?.locale;
  if (first === undefined) translations[uiLocale] = EMPTY_TRANSLATION;
  return {
    nickname: profile.nickname ?? "",
    title: profile.kind === "admin" ? profile.title : "",
    photo: profile.photo,
    translations,
    activeLocale: first ?? uiLocale,
  };
}

export function contentFromForm(
  form: TeamCardForm,
  kind: TeamProfile["kind"],
): TeamCardContent {
  const translations: TeamProfileTranslation[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const draft = form.translations[locale];
    if (draft === undefined) continue;
    const shortDescription = draft.shortDescription.trim();
    const longDescription = draft.longDescription.trim();
    const funFact = draft.funFact.trim();
    if (shortDescription === "" && longDescription === "" && funFact === "") {
      continue;
    }
    translations.push({
      locale,
      shortDescription,
      longDescription,
      funFact: funFact === "" ? null : funFact,
    });
  }
  return {
    nickname: form.nickname.trim() || null,
    title: kind === "admin" ? form.title.trim() : null,
    photo: form.photo,
    translations,
  };
}

export function contentFromProfile(profile: TeamProfile): TeamCardContent {
  // The locale only picks an empty first tab, which is not content.
  return contentFromForm(formFromProfile(profile, "en"), profile.kind);
}

/** Whether two cards say the same thing. */
export function sameContent(a: TeamCardContent, b: TeamCardContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The card as the public page would render it, with this content in it. */
export function profileWithContent<P extends TeamProfile>(
  base: P,
  content: TeamCardContent,
): P {
  return {
    ...base,
    nickname: content.nickname,
    photo: content.photo,
    translations: content.translations,
    ...(base.kind === "admin" && content.title !== null
      ? { title: content.title }
      : {}),
  };
}

/**
 * What stops a card going on the team page: a photo, and at least one language
 * with both descriptions — in every language written, because a reader of any
 * of them would otherwise meet half a card. The fun fact is optional and never
 * counts.
 */
export type TeamCardGap = "photo" | "text" | "both" | null;

export function teamCardGap(content: TeamCardContent): TeamCardGap {
  const missingPhoto = content.photo === null;
  const missingText =
    content.translations.length === 0 ||
    content.translations.some(
      (row) => row.shortDescription === "" || row.longDescription === "",
    );
  if (missingPhoto && missingText) return "both";
  if (missingPhoto) return "photo";
  if (missingText) return "text";
  return null;
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

type FormUpdate = (update: (form: TeamCardForm) => TeamCardForm) => void;

/**
 * One section of the form: a card with a heading. The sections are peers the
 * person works through one at a time, so each is its own card and the column
 * holding them has no edge of its own.
 */
export function FormSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <h2 id={headingId} className="text-lg font-semibold">
            {heading}
          </h2>
          {children}
        </CardContent>
      </section>
    </Card>
  );
}

/**
 * The photo, in the team page's 4:5 frame, with its actions.
 *
 * **Picking a file opens the crop step, and the crop happens here, locally**:
 * the framed area is drawn to a canvas at the stored size and shown in the
 * frame and the preview at once through an object URL. The upload of the
 * cropped bytes is the caller's (`onUpload`), because that is the backend
 * round trip; what the form holds is the local URL either way.
 *
 * **Object URLs are owned in pairs.** The picked file's URL lives exactly as
 * long as the crop dialog and is revoked when it closes; the cropped photo's
 * URLs are handed to `onCropped`, whose owner revokes each one once nothing
 * shows it any more.
 */
export function TeamCardPhotoSection({
  personId,
  photo,
  onCropped,
  update,
}: {
  personId: string;
  photo: TeamProfilePhoto | null;
  /** A new crop's bytes and the object URL made for them. */
  onCropped: (blob: Blob, url: string) => void;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.photo");
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<TeamPhotoSource | null>(null);
  /** The picked file's URL, revoked when the dialog lets go of it. */
  const sourceUrl = useRef<string | null>(null);
  /** Which pick is current, so a slow decode of an abandoned file lands nowhere. */
  const pick = useRef(0);

  function release() {
    if (sourceUrl.current !== null) URL.revokeObjectURL(sourceUrl.current);
    sourceUrl.current = null;
  }

  function close() {
    pick.current += 1;
    release();
    setSource(null);
  }

  async function choose(file: File) {
    release();
    const url = URL.createObjectURL(file);
    sourceUrl.current = url;
    const thisPick = ++pick.current;
    setSource({ kind: "decoding", url });
    const readable = await decodeTeamPhoto(url, file.type);
    if (pick.current !== thisPick) return;
    if (!readable) release();
    setSource(readable ? { kind: "ready", url } : { kind: "unreadable" });
  }

  return (
    <FormSection heading={t("heading")}>
      <div className="flex items-center gap-5">
        <div
          aria-hidden
          className="relative flex aspect-[4/5] w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card"
        >
          {photo ? (
            <Image
              src={photo.src}
              width={photo.width}
              height={photo.height}
              alt=""
              sizes="96px"
              className="h-full w-full object-cover"
            />
          ) : (
            <Identicon id={personId} size={96} className="h-auto w-full" />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <Upload aria-hidden />
              {photo ? t("replace") : t("upload")}
            </Button>
            {photo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update((form) => ({ ...form, photo: null }))}
              >
                <Trash2 aria-hidden />
                {t("remove")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={TEAM_PHOTO_ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared at once, so picking the same file again still fires.
          e.target.value = "";
          if (file !== undefined) void choose(file);
        }}
      />
      <TeamPhotoCropDialog
        source={source}
        onCancel={close}
        onChooseAnother={() => fileInput.current?.click()}
        onConfirm={(blob) => {
          close();
          const url = URL.createObjectURL(blob);
          onCropped(blob, url);
          update((form) => ({
            ...form,
            photo: { src: url, width: TEAM_PHOTO_WIDTH, height: TEAM_PHOTO_HEIGHT },
          }));
        }}
      />
    </FormSection>
  );
}

/**
 * The nickname and, for office staff, the title they write for themselves.
 * Everything else the card shows about the person — their name, a Gedu's
 * title, their spoken languages — comes from the account, and the preview
 * beside the form already shows it.
 */
export function TeamCardAboutSection({
  kind,
  form,
  update,
}: {
  kind: TeamProfile["kind"];
  form: TeamCardForm;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.about");
  const nicknameId = useId();
  const titleId = useId();

  return (
    <FormSection heading={t("heading")}>
      <Field
        label={t("nickname")}
        htmlFor={nicknameId}
        optional
        hint={t("nicknameHint")}
      >
        {({ hintId }) => (
          <Input
            id={nicknameId}
            value={form.nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={t("nicknamePlaceholder")}
            aria-describedby={hintId}
            onChange={(e) => {
              const nickname = e.target.value;
              update((prev) => ({ ...prev, nickname }));
            }}
          />
        )}
      </Field>

      {kind === "admin" && (
        <Field label={t("title")} htmlFor={titleId} hint={t("titleHint")}>
          {({ hintId }) => (
            <Input
              id={titleId}
              value={form.title}
              maxLength={TITLE_MAX_LENGTH}
              aria-describedby={hintId}
              onChange={(e) => {
                const title = e.target.value;
                update((prev) => ({ ...prev, title }));
              }}
            />
          )}
        </Field>
      )}
    </FormSection>
  );
}

/**
 * What the person writes about themselves, per locale.
 *
 * **The language tabs are the product form's, mirrored rather than imported.**
 * The admin product form draws them inline in its identity section rather than
 * as a component, so there is nothing to import without first extracting it
 * from a form this change does not otherwise touch. The interaction is the
 * same: a tab per locale written, a remove control on each while more than one
 * remains, an "add a language" select for the rest, and the rule of at least
 * one — here enforced by the ready switch rather than by the save.
 *
 * **"About me" is the session feed's rich note field**, which is the no-links
 * editor loaded on demand behind a same-sized placeholder: staff-authored copy
 * on a page families read takes the conservative variant. The editor reads its
 * content once, at mount, so the locale is its key and switching tabs remounts
 * it on that locale's draft.
 */
export function TeamCardWritingSection({
  form,
  update,
}: {
  form: TeamCardForm;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.writing");
  const languageName = useLanguageNames();
  const shortId = useId();
  const funFactId = useId();

  const locale = form.activeLocale;
  const addedLocales = SUPPORTED_LOCALES.filter(
    (l) => form.translations[l] !== undefined,
  );
  const addableLocales = SUPPORTED_LOCALES.filter(
    (l) => form.translations[l] === undefined,
  );
  const draft = form.translations[locale] ?? EMPTY_TRANSLATION;

  function setActive(patch: Partial<TeamCardTranslationDraft>) {
    update((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [prev.activeLocale]: {
          ...(prev.translations[prev.activeLocale] ?? EMPTY_TRANSLATION),
          ...patch,
        },
      },
    }));
  }

  function addLocale(next: SupportedLocale) {
    update((prev) => ({
      ...prev,
      translations: { ...prev.translations, [next]: EMPTY_TRANSLATION },
      activeLocale: next,
    }));
  }

  function removeLocale(gone: SupportedLocale) {
    update((prev) => {
      const next = { ...prev.translations };
      delete next[gone];
      const remaining = SUPPORTED_LOCALES.filter((l) => next[l] !== undefined);
      return {
        ...prev,
        translations: next,
        activeLocale:
          prev.activeLocale === gone
            ? (remaining[0] ?? prev.activeLocale)
            : prev.activeLocale,
      };
    });
  }

  return (
    <FormSection heading={t("heading")}>
      <Field label={t("languages")} hint={t("languagesHint")}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {addedLocales.map((l) => {
            const isActive = locale === l;
            const canRemove = addedLocales.length > 1;
            return (
              <span
                key={l}
                className={cn(
                  "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "text-act"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => update((prev) => ({ ...prev, activeLocale: l }))}
                >
                  {LOCALE_CONFIG[l].nativeLabel}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => removeLocale(l)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("removeLocale", {
                      locale: languageName(l, LOCALE_CONFIG[l].label),
                    })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
          {addableLocales.length > 0 && (
            <select
              value=""
              aria-label={t("addLocale")}
              onChange={(e) => {
                const next = findOption(addableLocales, e.target.value);
                if (next) addLocale(next);
              }}
              className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("addLocale")}</option>
              {addableLocales.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, LOCALE_CONFIG[l].label)}
                </option>
              ))}
            </select>
          )}
        </div>
      </Field>

      <Field
        label={t("shortDescription")}
        htmlFor={shortId}
        labelAction={
          // The count sits on the label's row, right-packed, so it never
          // pushes the field: tabular figures keep its own width steady.
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("count", {
              count: draft.shortDescription.length,
              max: SHORT_DESCRIPTION_MAX_LENGTH,
            })}
          </span>
        }
      >
        <Input
          id={shortId}
          value={draft.shortDescription}
          maxLength={SHORT_DESCRIPTION_MAX_LENGTH}
          lang={locale}
          placeholder={t("shortDescriptionPlaceholder")}
          onChange={(e) => setActive({ shortDescription: e.target.value })}
        />
      </Field>

      <RichNoteField
        key={locale}
        label={t("longDescription")}
        hint={t("longDescriptionHint")}
        placeholder={t("longDescriptionPlaceholder")}
        value={draft.longDescription}
        seed={0}
        ready
        onChange={(longDescription) => setActive({ longDescription })}
      />

      <Field
        label={t("funFact")}
        htmlFor={funFactId}
        optional
        labelAction={
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("count", {
              count: draft.funFact.length,
              max: FUN_FACT_MAX_LENGTH,
            })}
          </span>
        }
      >
        <Textarea
          id={funFactId}
          rows={2}
          value={draft.funFact}
          maxLength={FUN_FACT_MAX_LENGTH}
          lang={locale}
          placeholder={t("funFactPlaceholder")}
          className="resize-none"
          onChange={(e) => setActive({ funFact: e.target.value })}
        />
      </Field>
    </FormSection>
  );
}

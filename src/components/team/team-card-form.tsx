"use client";

import { useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { PICKS, type PickId } from "@sog/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ZoneColorPicker } from "@/components/voice/ZoneColorPicker";
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
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import { derivedTeamPick, teamPick } from "@/components/team/team-pick";

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
  /**
   * The swatch shown selected: the person's pick, or the one their id derives
   * while they have not chosen, so the picker always opens on the colour the
   * card is actually drawn in.
   */
  pick: PickId;
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
  /**
   * `null` while the person's colour is the one their id derives — whether
   * they never touched the picker or chose that same swatch — so choosing the
   * colour the card already has is not a change.
   */
  pick: PickId | null;
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
    pick: teamPick(profile),
    photo: profile.photo,
    translations,
    activeLocale: first ?? uiLocale,
  };
}

export function contentFromForm(
  form: TeamCardForm,
  card: Pick<TeamProfile, "id" | "kind">,
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
    title: card.kind === "admin" ? form.title.trim() : null,
    pick: form.pick === derivedTeamPick(card.id) ? null : form.pick,
    photo: form.photo,
    translations,
  };
}

export function contentFromProfile(profile: TeamProfile): TeamCardContent {
  // The locale only picks an empty first tab, which is not content.
  return contentFromForm(formFromProfile(profile, "en"), profile);
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
    pick: content.pick,
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

/**
 * Height of the writing surface, matched by the placeholder that stands in for
 * it while the chunk is in flight: the toolbar (`h-10`) plus the editor body's
 * `min-h-40`, so the box does not change size when the editor arrives.
 */
const RICH_EDITOR_MIN_HEIGHT = "min-h-[12.5rem]";

/**
 * The rich editor, loaded on demand and never rendered on the server: it is
 * the heaviest thing on the page, and only the open language tab mounts one.
 */
const AboutMeEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className={`w-full rounded-md border border-border bg-background ${RICH_EDITOR_MIN_HEIGHT}`}
      />
    ),
  },
);

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
  photo,
  onCropped,
  update,
}: {
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
          className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-card"
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
            <TeamPhotoPlaceholder className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-sm">{t("guidance.intro")}</p>
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
        </div>
      </div>
      <PhotoGuidance />
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

const PHOTO_DOS = ["you", "light", "smile", "gear", "background"] as const;
const PHOTO_DONTS = ["others", "hidden", "group", "avatar", "blurry"] as const;

/**
 * What makes a good team photo, as a do and a don't list.
 *
 * In place of the accepted file types, which the picker already enforces: what
 * the person needs before choosing a file is what kind of picture we want. The
 * two lists are marked by a check and a cross in the success and destructive
 * hues, never by colour alone, and each has small drawn examples at the photo's
 * own 4:5 — the same figure as the empty frame, so the set reads as one. The
 * first "don't" is a safeguarding rule and is worded as one.
 */
function PhotoGuidance() {
  const t = useTranslations("team.edit.photo.guidance");
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <GuidanceList
        heading={t("doHeading")}
        tone="do"
        examples={["you"]}
        items={PHOTO_DOS.map((key) => ({ key, text: t(`do.${key}`) }))}
      />
      <GuidanceList
        heading={t("dontHeading")}
        tone="dont"
        examples={["group", "hidden"]}
        items={PHOTO_DONTS.map((key) => ({ key, text: t(`dont.${key}`) }))}
      />
    </div>
  );
}

function GuidanceList({
  heading,
  tone,
  examples,
  items,
}: {
  heading: string;
  tone: "do" | "dont";
  examples: readonly ("you" | "group" | "hidden")[];
  items: readonly { key: string; text: string }[];
}) {
  const headingId = useId();
  const Glyph = tone === "do" ? Check : X;
  const ink = tone === "do" ? "text-success" : "text-destructive";
  return (
    <section aria-labelledby={headingId}>
      <div className="flex gap-2" aria-hidden>
        {examples.map((kind) => (
          <div
            key={kind}
            className="aspect-[4/5] w-12 overflow-hidden rounded-md border border-border"
          >
            <TeamPhotoPlaceholder kind={kind} className="h-full w-full" />
          </div>
        ))}
      </div>
      <h3
        id={headingId}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold"
      >
        <Glyph className={cn("h-4 w-4", ink)} aria-hidden />
        {heading}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <Glyph className={cn("mt-0.5 h-4 w-4 shrink-0", ink)} aria-hidden />
            <span className="min-w-0">{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The nickname and, for office staff, the title they write for themselves.
 * Everything else the card shows about the person — their name, a Gedu's
 * title, their spoken languages — comes from the account, and the preview
 * beside the form already shows it.
 *
 * **Their colour is chosen here too**, from SOG-UI's sixteen picks, through
 * the same swatch grid a moderator colours a voice zone with. It opens on the
 * colour the card is drawn in, which is the one their id derives until they
 * choose.
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

      <Field label={t("pick")} hint={t("pickHint")}>
        {({ labelId }) => (
          <ZoneColorPicker
            value={`${form.pick}` as const}
            labelledBy={labelId}
            onChange={(key) => {
              const pick = PICKS.find((p) => `${p.id}` === key)?.id;
              if (pick !== undefined) update((prev) => ({ ...prev, pick }));
            }}
          />
        )}
      </Field>
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
 * **"About me" is the shared rich-text editor in its `profile` variant** — no
 * links and no headings, matching the public page's renderer of the same name
 * — loaded on demand behind a same-sized placeholder. The editor reads its
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

      <Field label={t("longDescription")} hint={t("longDescriptionHint")}>
        {({ hintId }) => (
          <AboutMeEditor
            key={locale}
            variant="profile"
            initialValue={draft.longDescription}
            placeholder={t("longDescriptionPlaceholder")}
            ariaLabel={t("longDescription")}
            describedBy={hintId}
            onChange={(longDescription) => setActive({ longDescription })}
          />
        )}
      </Field>

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

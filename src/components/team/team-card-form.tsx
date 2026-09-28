"use client";

import { useId, useRef } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { LanguageFlag } from "@/components/ui/language-flag";
import { Textarea } from "@/components/ui/textarea";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { PRODUCT_TOPICS, PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";
import { cn } from "@/lib/utils";
import type { ProductTopic, SpokenLanguageCode } from "@/types";
import type {
  TeamProfile,
  TeamProfilePhoto,
} from "@/components/team/team-profile-body";

// ---------------------------------------------------------------------------
// The form's state, and the two conversions around it
// ---------------------------------------------------------------------------

/** How long a tagline may run. One line on the public page at its widest. */
export const TAGLINE_MAX_LENGTH = 140;

/**
 * The "What I do" list's recommended range. The upper end is also a hard cap:
 * past eight the card stops being a glance and becomes a CV.
 */
export const SKILLS_MIN_RECOMMENDED = 4;
export const SKILLS_MAX = 8;

/** One phrase short enough to sit on one line of a half-width card. */
export const SKILL_MAX_LENGTH = 40;

/** A gamer tag's length, generous for any tag a platform allows. */
const NICKNAME_MAX_LENGTH = 32;

/** An office title, e.g. "Head of Clubs". */
const TITLE_MAX_LENGTH = 60;

/**
 * One "What I do" row. The key is the row's identity across reorders and
 * edits, which its text cannot be: two rows may say the same thing while one
 * is being typed, and a row's text changes on every keystroke.
 */
interface SkillRow {
  key: number;
  text: string;
}

/**
 * What the person is typing, as they type it — untrimmed, with empty rows
 * allowed — so the form never rewrites a field under the cursor. It becomes a
 * card through `contentFromForm`, which is where trimming and dropping empties
 * happen.
 */
export interface TeamCardForm {
  nickname: string;
  /** The office title. Unused for a Gedu, whose title is the role. */
  title: string;
  photo: TeamProfilePhoto | null;
  tagline: string;
  taglineLanguage: SpokenLanguageCode;
  skills: readonly SkillRow[];
  /** The next row key to hand out. Part of the state so adding stays pure. */
  nextSkillKey: number;
  topics: readonly ProductTopic[];
}

/**
 * The part of a card a person writes, normalised: what gets saved, submitted
 * and compared. `title` is `null` for a Gedu.
 */
export interface TeamCardContent {
  nickname: string | null;
  title: string | null;
  photo: TeamProfilePhoto | null;
  tagline: TeamProfile["tagline"];
  skills: readonly string[];
  topics: readonly ProductTopic[];
}

/**
 * Topics in the vocabulary's own order, whatever order they were ticked in, so
 * two cards naming the same topics are the same card.
 */
function canonicalTopics(topics: readonly ProductTopic[]): ProductTopic[] {
  return PRODUCT_TOPIC_VALUES.filter((topic) => topics.includes(topic));
}

export function formFromProfile(profile: TeamProfile): TeamCardForm {
  return {
    nickname: profile.nickname ?? "",
    title: profile.kind === "admin" ? profile.title : "",
    photo: profile.photo,
    tagline: profile.tagline?.text ?? "",
    taglineLanguage:
      profile.tagline?.spokenLanguage ?? profile.spokenLanguages.at(0) ?? "en",
    skills: profile.skills.map((text, key) => ({ key, text })),
    nextSkillKey: profile.skills.length,
    topics: canonicalTopics(profile.topics),
  };
}

export function contentFromForm(
  form: TeamCardForm,
  kind: TeamProfile["kind"],
): TeamCardContent {
  const tagline = form.tagline.trim();
  return {
    nickname: form.nickname.trim() || null,
    title: kind === "admin" ? form.title.trim() : null,
    photo: form.photo,
    tagline:
      tagline === ""
        ? null
        : { text: tagline, spokenLanguage: form.taglineLanguage },
    skills: form.skills
      .map((skill) => skill.text.trim())
      .filter((text) => text !== ""),
    topics: canonicalTopics(form.topics),
  };
}

export function contentFromProfile(profile: TeamProfile): TeamCardContent {
  return contentFromForm(formFromProfile(profile), profile.kind);
}

/** Whether two cards say the same thing. */
export function sameContent(a: TeamCardContent, b: TeamCardContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The card as the public page would render it, with this content in it. */
export function profileWithContent(
  base: TeamProfile,
  content: TeamCardContent,
): TeamProfile {
  const written = {
    nickname: content.nickname,
    photo: content.photo,
    tagline: content.tagline,
    skills: content.skills,
    topics: content.topics,
  };
  return base.kind === "admin"
    ? { ...base, ...written, title: content.title ?? base.title }
    : { ...base, ...written };
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
function FormSection({
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
 * A pressable chip for a choice among a few: a topic, a language, a version.
 * Boxed, because its edge is the control's affordance; a chosen chip says so
 * with its edge in act and a tick, never with colour alone.
 */
export function ChoiceChip({
  pressed,
  onPress,
  children,
}: {
  pressed: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? "border-act text-foreground"
          : "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      {pressed && <Check className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </button>
  );
}

/**
 * The photo, as the team page will crop it, with its three actions.
 *
 * Choosing a file is a backend round trip (an upload), so `onChoose` is the
 * caller's; removing one is a change to the draft like any other, so it
 * happens here and shows at once in the preview. With no photo the identicon
 * stands in, exactly as on the public page.
 */
export function TeamCardPhotoSection({
  personId,
  photo,
  onChoose,
  update,
}: {
  personId: string;
  photo: TeamProfilePhoto | null;
  onChoose: () => void;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.photo");
  return (
    <FormSection heading={t("heading")}>
      <div className="flex items-center gap-5">
        <div
          aria-hidden
          className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-card"
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
            <Identicon id={personId} size={96} />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onChoose}>
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
    </FormSection>
  );
}

/**
 * Gamer tag, the office title (admins only) and the tagline with the spoken
 * language it is written in.
 *
 * The language choices are the person's own spoken languages from their
 * account — the languages they could plausibly write a line in — plus whatever
 * the saved tagline already says, so a card is never shown a choice it does not
 * currently hold.
 */
export function TeamCardAboutSection({
  kind,
  form,
  spokenLanguages,
  update,
}: {
  kind: TeamProfile["kind"];
  form: TeamCardForm;
  spokenLanguages: readonly SpokenLanguageCode[];
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.about");
  const languageName = useLanguageNames();
  const nicknameId = useId();
  const titleId = useId();
  const taglineId = useId();
  const languages = spokenLanguages.includes(form.taglineLanguage)
    ? spokenLanguages
    : [...spokenLanguages, form.taglineLanguage];

  return (
    <FormSection heading={t("heading")}>
      <Field label={t("nickname")} htmlFor={nicknameId} optional hint={t("nicknameHint")}>
        {({ hintId }) => (
          <Input
            id={nicknameId}
            value={form.nickname}
            maxLength={NICKNAME_MAX_LENGTH}
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

      <Field
        label={t("tagline")}
        htmlFor={taglineId}
        optional
        hint={t("taglineHint")}
        labelAction={
          // The count sits on the label's row, right-packed, so it never
          // pushes the field: tabular figures keep its own width steady as
          // it counts.
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("taglineCount", {
              count: form.tagline.length,
              max: TAGLINE_MAX_LENGTH,
            })}
          </span>
        }
      >
        {({ hintId }) => (
          <Textarea
            id={taglineId}
            rows={3}
            value={form.tagline}
            maxLength={TAGLINE_MAX_LENGTH}
            lang={form.taglineLanguage}
            aria-describedby={hintId}
            className="resize-none"
            onChange={(e) => {
              const tagline = e.target.value;
              update((prev) => ({ ...prev, tagline }));
            }}
          />
        )}
      </Field>

      <Field label={t("taglineLanguage")}>
        {({ labelId }) => (
          <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
            {languages.map((code) => (
              <ChoiceChip
                key={code}
                pressed={form.taglineLanguage === code}
                onPress={() =>
                  update((prev) => ({ ...prev, taglineLanguage: code }))
                }
              >
                <LanguageFlag code={code} showCode={false} />
                {languageName(code)}
              </ChoiceChip>
            ))}
          </div>
        )}
      </Field>
    </FormSection>
  );
}

/**
 * The "What I do" phrases: typed in place, moved up and down, removed, and
 * added up to the cap. A new row takes the focus, so adding a phrase is one
 * click and then typing.
 */
export function TeamCardSkillsSection({
  skills,
  nextSkillKey,
  update,
}: {
  skills: readonly SkillRow[];
  nextSkillKey: number;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.skills");
  /** The row to focus once it mounts — set by Add, spent by the row's ref. */
  const focusOnMount = useRef<number | null>(null);

  const setSkills = (next: (rows: readonly SkillRow[]) => SkillRow[]) =>
    update((form) => ({ ...form, skills: next(form.skills) }));

  const move = (index: number, by: -1 | 1) =>
    setSkills((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });

  return (
    <FormSection heading={t("heading")}>
      <p className="text-sm text-muted-foreground">
        {t("hint", { min: SKILLS_MIN_RECOMMENDED, max: SKILLS_MAX })}
      </p>

      {skills.length > 0 && (
        <ol className="space-y-2">
          {skills.map((skill, index) => {
            const position = index + 1;
            return (
              <li key={skill.key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="w-4 shrink-0 text-right text-sm tabular-nums text-muted-foreground"
                >
                  {position}
                </span>
                <Input
                  ref={(el) => {
                    if (el !== null && focusOnMount.current === skill.key) {
                      focusOnMount.current = null;
                      el.focus();
                    }
                  }}
                  value={skill.text}
                  maxLength={SKILL_MAX_LENGTH}
                  placeholder={t("placeholder")}
                  aria-label={t("phrase", { position })}
                  onChange={(e) => {
                    const text = e.target.value;
                    setSkills((rows) =>
                      rows.map((row) =>
                        row.key === skill.key ? { ...row, text } : row,
                      ),
                    );
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("moveUp", { position })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("moveDown", { position })}
                  disabled={index === skills.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={t("remove", { position })}
                  onClick={() =>
                    setSkills((rows) =>
                      rows.filter((row) => row.key !== skill.key),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      {/* The count is right-packed on the Add button's row, where the slack
          is, so its digits changing never move the button. */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={skills.length >= SKILLS_MAX}
          onClick={() => {
            focusOnMount.current = nextSkillKey;
            update((form) => ({
              ...form,
              skills: [...form.skills, { key: form.nextSkillKey, text: "" }],
              nextSkillKey: form.nextSkillKey + 1,
            }));
          }}
        >
          <Plus aria-hidden />
          {t("add")}
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("count", { count: skills.length, max: SKILLS_MAX })}
        </span>
      </div>
    </FormSection>
  );
}

/** The games and topics, as chips over the product-topic vocabulary. */
export function TeamCardTopicsSection({
  topics,
  update,
}: {
  topics: readonly ProductTopic[];
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.topics");
  const hintId = useId();
  return (
    <FormSection heading={t("heading")}>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t("hint")}
      </p>
      <div role="group" aria-describedby={hintId} className="flex flex-wrap gap-2">
        {PRODUCT_TOPIC_VALUES.map((topic) => {
          const chosen = topics.includes(topic);
          return (
            <ChoiceChip
              key={topic}
              pressed={chosen}
              onPress={() =>
                update((form) => ({
                  ...form,
                  topics: chosen
                    ? form.topics.filter((other) => other !== topic)
                    : [...form.topics, topic],
                }))
              }
            >
              {PRODUCT_TOPICS[topic].label}
            </ChoiceChip>
          );
        })}
      </div>
    </FormSection>
  );
}

/**
 * What the card shows that this page does not edit: the name, a Gedu's title,
 * the spoken languages and a Gedu's areas.
 *
 * The languages and areas already live on the account and have editors in
 * settings; a second editor here would be two places to change one fact, so
 * this states them and points at the one place they are changed. A Gedu's
 * name row says outright that the surname never appears, because that is the
 * question a Gedu reading their own card will have.
 */
export function TeamCardAccountSection({ profile }: { profile: TeamProfile }) {
  const t = useTranslations("team.edit.account");
  const tProfile = useTranslations("team.profile");
  const languageName = useLanguageNames();
  const format = useFormatter();

  return (
    <FormSection heading={t("heading")}>
      <dl className="divide-y divide-border">
        <AccountRow
          label={t("name")}
          hint={profile.kind === "gedu" ? t("nameGeduHint") : undefined}
        >
          {profile.kind === "admin"
            ? `${profile.firstName} ${profile.lastName}`
            : profile.firstName}
        </AccountRow>
        {profile.kind === "gedu" && (
          <AccountRow label={t("title")} hint={t("titleGeduHint")}>
            {tProfile("geduTitle")}
          </AccountRow>
        )}
        <AccountRow label={t("languages")}>
          {profile.spokenLanguages.length === 0 ? (
            <span className="text-muted-foreground">{t("none")}</span>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {profile.spokenLanguages.map((code) => (
                <li key={code} className="inline-flex items-center gap-2">
                  <LanguageFlag code={code} showCode={false} />
                  <span>{languageName(code)}</span>
                </li>
              ))}
            </ul>
          )}
        </AccountRow>
        {profile.kind === "gedu" && (
          <AccountRow label={t("areas")}>
            {profile.areas.length === 0 ? (
              <span className="text-muted-foreground">{t("none")}</span>
            ) : (
              format.list(profile.areas, { type: "conjunction" })
            )}
          </AccountRow>
        )}
      </dl>
      <Link
        href={ROUTES.settings}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings className="h-4 w-4" aria-hidden />
        {t("settingsLink")}
      </Link>
    </FormSection>
  );
}

function AccountRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        {children}
        {hint !== undefined && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </dd>
    </div>
  );
}

import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { openingLocaleTab } from "@/lib/i18n/locale-tabs";
import {
  LANDING_SECTION_TYPES,
  buttonTarget,
  missingInLandingVersion,
  type ButtonTarget,
  type LandingIcon,
  type LandingSection,
  type LandingSectionInput,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  defaultLandingSlug,
  landingSlug,
  type AdminLandingPage,
  type AdminLandingPageListItem,
  type LandingPageDraft,
  type LandingPageInput,
  type LandingVersionInput,
} from "@/services/landing-pages";

/*
 * **The landing page editor's state, and every rule it reads off that state.**
 * Pure, so the editor's behaviour is testable without rendering it.
 *
 * The form mirrors the page's own split: one structure — the ordered sections
 * and their shared fields — and a version per language holding the title,
 * the summary, the slug and the words. A version's words are kept flat, by
 * path within the page (`<section id>.<field>`, `<section id>.items.<item
 * id>.<field>`, `<section id>.alts.<picture id>`), which is the shared
 * required-text rule's path with its `sections.` prefix taken off, so what the
 * rule says is missing names the field that holds it.
 */

// ---------------------------------------------------------------------------
// The structure as edited
// ---------------------------------------------------------------------------

/**
 * One section as the editor holds it: the stored shape, except that a
 * button's target is the address as typed (turned into a target only by the
 * save) and a picture slot may wait for its picture.
 */
export type FormSection =
  | { id: string; type: "hero"; imageId: string | null; button: string | null }
  | {
      id: string;
      type: "text";
      imageId: string | null;
      imageSide: "start" | "end";
    }
  | { id: string; type: "image"; images: { id: string; imageId: string | null }[] }
  | { id: string; type: "points"; items: { id: string; icon: LandingIcon }[] }
  | { id: string; type: "steps"; items: { id: string }[] }
  | { id: string; type: "faq"; items: { id: string }[] }
  | { id: string; type: "cta"; button: string };

export type FormSectionOf<Type extends LandingSectionType> = Extract<
  FormSection,
  { type: Type }
>;

/** The section types an admin may add: every one but the hero, which a page has exactly one of. */
export const ADDABLE_SECTION_TYPES = LANDING_SECTION_TYPES.filter(
  (type): type is Exclude<LandingSectionType, "hero"> => type !== "hero",
);

/** How many items a section type's list holds, as the section schemas bound it. */
export const ITEM_BOUNDS = {
  image: { min: 1, max: 4 },
  points: { min: 2, max: 6 },
  steps: { min: 2, max: 6 },
  faq: { min: 1, max: 20 },
} as const;

/** A new section of a type, with fresh ids. `newId` is injectable for tests. */
export function newSection(
  type: Exclude<LandingSectionType, "hero">,
  newId: () => string = () => crypto.randomUUID(),
): FormSection {
  const id = newId();
  switch (type) {
    case "text":
      return { id, type, imageId: null, imageSide: "end" };
    case "image":
      return { id, type, images: [{ id: newId(), imageId: null }] };
    case "points":
      return {
        id,
        type,
        items: [
          { id: newId(), icon: "sparkles" },
          { id: newId(), icon: "star" },
        ],
      };
    case "steps":
      return { id, type, items: [{ id: newId() }, { id: newId() }] };
    case "faq":
      return { id, type, items: [{ id: newId() }] };
    case "cta":
      return { id, type, button: "" };
  }
}

/** A stored button target as an admin reads and edits it. */
export function buttonHref(target: ButtonTarget): string {
  return target.kind === "internal" ? target.path : target.url;
}

/**
 * An address as typed, as the target a save sends: a web address is another
 * site's, anything else a path on ours. The service canonicalises both — an
 * address on our own host becomes the internal route it names — so what is
 * stored, and shown after the save, may read differently from what was typed.
 */
export function toButtonTarget(href: string): ButtonTarget {
  const trimmed = href.trim();
  return /^https?:\/\//i.test(trimmed)
    ? { kind: "external", url: trimmed }
    : { kind: "internal", path: trimmed };
}

function formSectionFromStored(section: LandingSection): FormSection {
  switch (section.type) {
    case "hero":
      return {
        id: section.id,
        type: section.type,
        imageId: section.imageId ?? null,
        button: section.button === undefined ? null : buttonHref(section.button),
      };
    case "text":
      return {
        id: section.id,
        type: section.type,
        imageId: section.imageId ?? null,
        imageSide: section.imageSide,
      };
    case "image":
      return {
        id: section.id,
        type: section.type,
        images: section.images.map((image) => ({ ...image })),
      };
    case "points":
      return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
    case "steps":
      return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
    case "faq":
      return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
    case "cta":
      return { id: section.id, type: section.type, button: buttonHref(section.button) };
  }
}

/**
 * The structure as a save sends it. Unparsed: the service's contract checks
 * it, and `structureProblems` has already held back what it would refuse.
 */
export function sectionsInput(sections: readonly FormSection[]): LandingSectionInput[] {
  return sections.map((section): LandingSectionInput => {
    switch (section.type) {
      case "hero":
        return {
          id: section.id,
          type: section.type,
          ...(section.imageId === null ? {} : { imageId: section.imageId }),
          ...(section.button === null ? {} : { button: toButtonTarget(section.button) }),
        };
      case "text":
        return {
          id: section.id,
          type: section.type,
          ...(section.imageId === null ? {} : { imageId: section.imageId }),
          imageSide: section.imageSide,
        };
      case "image":
        return {
          id: section.id,
          type: section.type,
          images: section.images.flatMap((image) =>
            image.imageId === null ? [] : [{ id: image.id, imageId: image.imageId }],
          ),
        };
      case "points":
        return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
      case "steps":
        return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
      case "faq":
        return { id: section.id, type: section.type, items: section.items.map((i) => ({ ...i })) };
      case "cta":
        return { id: section.id, type: section.type, button: toButtonTarget(section.button) };
    }
  });
}

/**
 * The structure as the required-text rule reads it. Only presence matters to
 * the rule — whether a button or a picture is there, which items exist — so
 * an address still being typed and a picture slot still empty both count.
 */
function sectionsReading(sections: readonly FormSection[]): LandingSection[] {
  return sections.map((section): LandingSection => {
    switch (section.type) {
      case "hero":
        return {
          id: section.id,
          type: section.type,
          imageId: section.imageId ?? undefined,
          button:
            section.button === null ? undefined : { kind: "internal", path: section.button },
        };
      case "text":
        return {
          id: section.id,
          type: section.type,
          imageId: section.imageId ?? undefined,
          imageSide: section.imageSide,
        };
      case "image":
        return {
          id: section.id,
          type: section.type,
          images: section.images.map((image) => ({ id: image.id, imageId: image.imageId ?? "" })),
        };
      case "points":
        return { id: section.id, type: section.type, items: section.items };
      case "steps":
        return { id: section.id, type: section.type, items: section.items };
      case "faq":
        return { id: section.id, type: section.type, items: section.items };
      case "cta":
        return {
          id: section.id,
          type: section.type,
          button: { kind: "internal", path: section.button },
        };
    }
  });
}

// ---------------------------------------------------------------------------
// The words, per section type
// ---------------------------------------------------------------------------

/** How a text field is typed in: one line, a few plain lines, or rich text. */
export type TextFieldKind = "line" | "lines" | "markdown";

/** The field names the editor labels, one message each. */
export type TextFieldName =
  | "eyebrow"
  | "headline"
  | "subline"
  | "heading"
  | "body"
  | "caption"
  | "intro"
  | "buttonLabel"
  | "imageAlt"
  | "alt"
  | "title"
  | "question"
  | "answer";

/** One text field of one section, in the order the editor asks for it. */
export interface TextFieldSpec {
  /** The field's path within its section — the required-text rule's own. */
  path: string;
  name: TextFieldName;
  kind: TextFieldKind;
  /** Never required, whatever else the section holds. */
  optional: boolean;
  /** The item the field belongs to, numbered from one. */
  item?: { id: string; number: number };
}

const field = (
  name: TextFieldName,
  kind: TextFieldKind,
  optional = false,
): TextFieldSpec => ({ path: name, name, kind, optional });

function itemFields(
  items: readonly { id: string }[],
  fields: readonly [TextFieldName, TextFieldKind][],
): TextFieldSpec[] {
  return items.flatMap((item, index) =>
    fields.map(([name, kind]) => ({
      path: `items.${item.id}.${name}`,
      name,
      kind,
      optional: false,
      item: { id: item.id, number: index + 1 },
    })),
  );
}

/**
 * **Every text field a section has in a language, by type** — exhaustive, so
 * a section type added to the registry fails type-check here until the
 * editor can write it. A field that exists only beside a shared one (a
 * button's label, a picture's alt text) is listed only while that is set.
 * Which listed fields are required is the registry's rule, not this list's.
 */
export const LANDING_TEXT_FIELDS: {
  [Type in LandingSectionType]: (section: FormSectionOf<Type>) => TextFieldSpec[];
} = {
  hero: (section) => [
    field("eyebrow", "line", true),
    field("headline", "line"),
    field("subline", "lines", true),
    ...(section.button === null ? [] : [field("buttonLabel", "line")]),
    ...(section.imageId === null ? [] : [field("imageAlt", "line")]),
  ],
  text: (section) => [
    field("eyebrow", "line", true),
    field("heading", "line"),
    field("body", "markdown"),
    ...(section.imageId === null ? [] : [field("imageAlt", "line")]),
  ],
  image: (section) => [
    field("eyebrow", "line", true),
    field("heading", "line", true),
    field("caption", "lines", true),
    ...section.images.map((image, index) => ({
      path: `alts.${image.id}`,
      name: "alt" as const,
      kind: "line" as const,
      optional: false,
      item: { id: image.id, number: index + 1 },
    })),
  ],
  points: (section) => [
    field("eyebrow", "line", true),
    field("heading", "line"),
    field("intro", "lines", true),
    ...itemFields(section.items, [
      ["title", "line"],
      ["body", "lines"],
    ]),
  ],
  steps: (section) => [
    field("eyebrow", "line", true),
    field("heading", "line"),
    field("intro", "lines", true),
    ...itemFields(section.items, [
      ["title", "line"],
      ["body", "lines"],
    ]),
  ],
  faq: (section) => [
    field("eyebrow", "line", true),
    field("heading", "line"),
    ...itemFields(section.items, [
      ["question", "line"],
      ["answer", "markdown"],
    ]),
  ],
  cta: () => [
    field("eyebrow", "line", true),
    field("heading", "line"),
    field("body", "lines", true),
    field("buttonLabel", "line"),
  ],
};

/** A section's text fields, dispatched through the exhaustive map. */
export function textFieldsOf(section: FormSection): TextFieldSpec[] {
  switch (section.type) {
    case "hero":
      return LANDING_TEXT_FIELDS.hero(section);
    case "text":
      return LANDING_TEXT_FIELDS.text(section);
    case "image":
      return LANDING_TEXT_FIELDS.image(section);
    case "points":
      return LANDING_TEXT_FIELDS.points(section);
    case "steps":
      return LANDING_TEXT_FIELDS.steps(section);
    case "faq":
      return LANDING_TEXT_FIELDS.faq(section);
    case "cta":
      return LANDING_TEXT_FIELDS.cta(section);
  }
}

/** A field's key in a version's flat words. */
export const wordKey = (sectionId: string, path: string) => `${sectionId}.${path}`;

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

/** One language as typed — untrimmed, so nothing moves under the cursor. */
export interface LandingVersionDraft {
  title: string;
  summary: string;
  slug: string;
  /**
   * The slug still follows the title: it was derived from it and not typed
   * over, so a title edit derives it again.
   */
  slugFollowsTitle: boolean;
  /** Every section's words in this language, by `wordKey`. */
  words: Record<string, string>;
}

const EMPTY_VERSION: LandingVersionDraft = {
  title: "",
  summary: "",
  slug: "",
  slugFollowsTitle: true,
  words: {},
};

/** The editor's whole state. */
export interface LandingPageForm {
  sections: FormSection[];
  versions: Partial<Record<SupportedLocale, LandingVersionDraft>>;
  activeLocale: SupportedLocale;
  /**
   * The picture of every catalogue entry the form has met, for painting it:
   * the saved copy's, and each one picked since. The structure holds the ids.
   */
  pictures: Record<string, { label: string; path: string }>;
}

export function versionOf(
  form: Pick<LandingPageForm, "versions">,
  locale: SupportedLocale,
): LandingVersionDraft {
  return form.versions[locale] ?? EMPTY_VERSION;
}

/** The tabs open, in `SUPPORTED_LOCALES` order. */
export function formLocales(form: Pick<LandingPageForm, "versions">): SupportedLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => form.versions[locale] !== undefined);
}

/** A title typed, with the slug following it while it has not been typed over. */
export function withTitle(
  version: LandingVersionDraft,
  title: string,
  slugFixed: boolean,
): LandingVersionDraft {
  return {
    ...version,
    title,
    slug: version.slugFollowsTitle && !slugFixed ? defaultLandingSlug(title) : version.slug,
  };
}

/** A new page: its hero, and one tab in the admin's UI locale. */
export function emptyLandingPageForm(
  uiLocale: SupportedLocale,
  newId: () => string = () => crypto.randomUUID(),
): LandingPageForm {
  return {
    sections: [{ id: newId(), type: "hero", imageId: null, button: null }],
    versions: { [uiLocale]: EMPTY_VERSION },
    activeLocale: uiLocale,
    pictures: {},
  };
}

/** A stored version's words, flat, as the form keeps them. */
function flatWords(sectionTexts: Readonly<Record<string, unknown>>): Record<string, string> {
  const words: Record<string, string> = {};
  for (const [sectionId, entry] of Object.entries(sectionTexts)) {
    if (typeof entry !== "object" || entry === null) continue;
    for (const [name, value] of Object.entries(entry)) {
      if (typeof value === "string") {
        words[wordKey(sectionId, name)] = value;
      } else if (name === "alts" && typeof value === "object" && value !== null) {
        for (const [pictureId, alt] of Object.entries(value)) {
          if (typeof alt === "string") words[wordKey(sectionId, `alts.${pictureId}`)] = alt;
        }
      } else if (name === "items" && typeof value === "object" && value !== null) {
        for (const [itemId, item] of Object.entries(value)) {
          if (typeof item !== "object" || item === null) continue;
          for (const [itemField, text] of Object.entries(item)) {
            if (typeof text === "string") {
              words[wordKey(sectionId, `items.${itemId}.${itemField}`)] = text;
            }
          }
        }
      }
    }
  }
  return words;
}

/**
 * A saved working copy as the editor opens it: on the tab a reader of the
 * admin's UI locale would be shown. A stored slug follows the title only when
 * it is exactly what the title derives, and never once it is fixed.
 */
export function landingPageFormFromDraft(
  draft: LandingPageDraft,
  uiLocale: SupportedLocale,
): LandingPageForm {
  const versions: LandingPageForm["versions"] = {};
  for (const version of draft.versions) {
    versions[version.locale] = {
      title: version.title,
      summary: version.summary,
      slug: version.slug,
      slugFollowsTitle:
        !version.slugFixed &&
        (version.slug === "" || version.slug === defaultLandingSlug(version.title)),
      words: flatWords(version.sectionTexts),
    };
  }
  if (draft.versions.length === 0) versions[uiLocale] = EMPTY_VERSION;
  return {
    sections: draft.sections.map(formSectionFromStored),
    versions,
    activeLocale: openingLocaleTab(
      draft.versions.map((version) => version.locale),
      uiLocale,
    ),
    // A picture picked in the editor brings its label along.
    pictures: Object.fromEntries(
      Object.entries(draft.imagePaths).map(([id, path]) => [
        id,
        { label: draft.imageLabels[id] ?? "", path },
      ]),
    ),
  };
}

/**
 * One version's words as a save stores them: trimmed, the unwritten left out,
 * and only fields the structure has — a removed section's, item's or
 * picture's words, and a button label with no button, are dropped.
 */
function wordsToSave(
  sections: readonly FormSection[],
  words: Readonly<Record<string, string>>,
): Map<string, string> {
  const kept = new Map<string, string>();
  for (const section of sections) {
    for (const spec of textFieldsOf(section)) {
      const key = wordKey(section.id, spec.path);
      const value = (words[key] ?? "").trim();
      if (value !== "") kept.set(key, value);
    }
  }
  return kept;
}

/** Flat words, nested by section as the contract takes them. */
function nestedTexts(
  sections: readonly FormSection[],
  words: ReadonlyMap<string, string>,
): Record<string, Record<string, unknown>> {
  const texts: Record<string, Record<string, unknown>> = {};
  for (const section of sections) {
    const entry: Record<string, unknown> = {};
    for (const spec of textFieldsOf(section)) {
      const value = words.get(wordKey(section.id, spec.path));
      if (value === undefined) continue;
      const parts = spec.path.split(".");
      let node = entry;
      for (const part of parts.slice(0, -1)) {
        const next = node[part];
        const child: Record<string, unknown> =
          typeof next === "object" && next !== null ? { ...next } : {};
        node[part] = child;
        node = child;
      }
      node[parts[parts.length - 1]] = value;
    }
    if (Object.keys(entry).length > 0) texts[section.id] = entry;
  }
  return texts;
}

function isBlankVersion(
  sections: readonly FormSection[],
  version: LandingVersionDraft,
): boolean {
  return (
    version.title.trim() === "" &&
    version.summary.trim() === "" &&
    (version.slugFollowsTitle || version.slug.trim() === "") &&
    wordsToSave(sections, version.words).size === 0
  );
}

/** Nothing written into a new page's form yet: leaving it loses nothing. */
export function isBlankLandingPageForm(form: LandingPageForm): boolean {
  return (
    formLocales(form).every((locale) => isBlankVersion(form.sections, versionOf(form, locale))) &&
    form.sections.length === 1
  );
}

/** The slug a version is saved under: the one typed, else its title's. */
function effectiveSlug(version: LandingVersionDraft): string {
  return version.slug.trim() || defaultLandingSlug(version.title.trim());
}

/** The versions a save sends, trimmed, in locale order; a blank tab is not one. */
function versionsToSave(form: Pick<LandingPageForm, "sections" | "versions">): LandingVersionInput[] {
  return formLocales(form).flatMap((locale) => {
    const version = versionOf(form, locale);
    if (isBlankVersion(form.sections, version)) return [];
    return [
      {
        locale,
        title: version.title.trim(),
        summary: version.summary.trim(),
        slug: version.slug.trim(),
        sectionTexts: nestedTexts(form.sections, wordsToSave(form.sections, version.words)),
      },
    ];
  });
}

/** What a save sends: the whole structure and every written version. */
export function landingPageInputFromForm(form: LandingPageForm): LandingPageInput {
  return { sections: sectionsInput(form.sections), versions: versionsToSave(form) };
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * What a language still needs before publishing takes it, by the registry's
 * rule, as the rule's paths: `title`, `summary`, `slug`, and
 * `sections.<section id>.<field path>`. Empty when complete. Read off the
 * form, so it answers for what a save would store.
 */
export function missingInForm(
  form: Pick<LandingPageForm, "sections" | "versions">,
  locale: SupportedLocale,
): string[] {
  const version = versionOf(form, locale);
  return missingInLandingVersion(sectionsReading(form.sections), {
    title: version.title,
    summary: version.summary,
    slug: effectiveSlug(version),
    sectionTexts: nestedTexts(form.sections, wordsToSave(form.sections, version.words)),
  });
}

/** What one section still needs in a language: its fields' paths within it. */
export function missingInSection(missing: readonly string[], sectionId: string): string[] {
  const prefix = `sections.${sectionId}.`;
  return missing.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
}

export function isCompleteInForm(
  form: Pick<LandingPageForm, "sections" | "versions">,
  locale: SupportedLocale,
): boolean {
  return missingInForm(form, locale).length === 0;
}

/** The languages written but not complete, in locale order. */
export function incompleteLocales(
  form: Pick<LandingPageForm, "sections" | "versions">,
): SupportedLocale[] {
  return formLocales(form).filter(
    (locale) =>
      !isBlankVersion(form.sections, versionOf(form, locale)) && !isCompleteInForm(form, locale),
  );
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** What in the structure a save would be refused for, section by section. */
export type StructureProblem =
  | { kind: "needsPicture"; sectionId: string; number: number }
  | { kind: "needsAddress"; sectionId: string; number: number }
  | { kind: "badAddress"; sectionId: string; number: number };

/** Problems in structure order; `number` is the section's place on the page, from one. */
export function structureProblems(sections: readonly FormSection[]): StructureProblem[] {
  return sections.flatMap((section, index): StructureProblem[] => {
    const number = index + 1;
    const at = { sectionId: section.id, number };
    switch (section.type) {
      case "image":
        return section.images.some((image) => image.imageId === null)
          ? [{ kind: "needsPicture", ...at }]
          : [];
      case "hero":
      case "cta": {
        if (section.button === null) return [];
        if (section.button.trim() === "") return [{ kind: "needsAddress", ...at }];
        return buttonTarget.safeParse(toButtonTarget(section.button)).success
          ? []
          : [{ kind: "badAddress", ...at }];
      }
      default:
        return [];
    }
  });
}

/**
 * Why a save cannot go ahead, before it is tried: nothing written, a language
 * without its title, a slug of the wrong shape, or a structure the contract
 * would refuse. The first found, in that order.
 */
export type LandingSaveBlocker =
  | { kind: "noVersion" }
  | { kind: "untitled"; locale: SupportedLocale }
  | { kind: "badSlug"; locale: SupportedLocale }
  | StructureProblem;

export function landingSaveBlocker(
  form: LandingPageForm,
  fixedSlugs: ReadonlySet<SupportedLocale> = new Set(),
): LandingSaveBlocker | null {
  const versions = versionsToSave(form);
  if (versions.length === 0) return { kind: "noVersion" };
  const untitled = versions.find((version) => version.title === "");
  if (untitled !== undefined) return { kind: "untitled", locale: untitled.locale };
  const badSlug = versions.find(
    (version) =>
      !fixedSlugs.has(version.locale) &&
      version.slug !== undefined &&
      version.slug !== "" &&
      !landingSlug.safeParse(version.slug).success,
  );
  if (badSlug !== undefined) return { kind: "badSlug", locale: badSlug.locale };
  return structureProblems(form.sections)[0] ?? null;
}

/** Whether a slug as typed is one the page can be saved with (blank is: it derives one). */
export function isUsableSlug(slug: string): boolean {
  const trimmed = slug.trim();
  return trimmed === "" || landingSlug.safeParse(trimmed).success;
}

/** Plain structural equality over JSON-shaped values, ignoring key order. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
  }
  const aEntries = Object.entries(a).filter(([, value]) => value !== undefined);
  const bRecord: Record<string, unknown> = Object.fromEntries(
    Object.entries(b).filter(([, value]) => value !== undefined),
  );
  return (
    aEntries.length === Object.keys(bRecord).length &&
    aEntries.every(([key, value]) => key in bRecord && sameValue(value, bRecord[key]))
  );
}

/**
 * Whether the form holds exactly what is saved, compared as a save would
 * store it. `editorMarkdown` maps a rich text value the editor was seeded with
 * to the editor's own serialisation of it: an untouched rich text field can
 * come back spelled in the editor's dialect, and is still the saved one.
 */
export function sameAsSaved(
  form: LandingPageForm,
  draft: LandingPageDraft,
  editorMarkdown: ReadonlyMap<string, string> = new Map(),
): boolean {
  if (!sameValue(sectionsInput(form.sections), draft.sections)) return false;
  const versions = formLocales(form).filter(
    (locale) => !isBlankVersion(form.sections, versionOf(form, locale)),
  );
  if (versions.length !== draft.versions.length) return false;
  return versions.every((locale, index) => {
    const saved = draft.versions[index];
    const version = versionOf(form, locale);
    if (
      saved.locale !== locale ||
      version.title.trim() !== saved.title.trim() ||
      version.summary.trim() !== saved.summary.trim() ||
      version.slug.trim() !== saved.slug
    ) {
      return false;
    }
    const typed = wordsToSave(form.sections, version.words);
    const stored = wordsToSave(form.sections, flatWords(saved.sectionTexts));
    if (typed.size !== stored.size) return false;
    return [...stored].every(([key, value]) => {
      const now = typed.get(key);
      return now === value || now === editorMarkdown.get(value)?.trim();
    });
  });
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * Where a page stands with readers, as one word: `draft` (not on the site),
 * `live` (on the site exactly as saved), `changed` (on the site, with saved
 * changes readers do not see yet).
 */
export type LandingPageStatus = "draft" | "live" | "changed";

export function landingPageStatus(
  page: Pick<AdminLandingPageListItem, "isPublished" | "hasUnpublishedChanges">,
): LandingPageStatus {
  if (!page.isPublished) return "draft";
  return page.hasUnpublishedChanges ? "changed" : "live";
}

/**
 * What the Publish control does with the form as it stands. Publishing copies
 * the **saved** working copy, so it acts only on a form with nothing unsaved.
 *
 * - `upToDate` — live, with nothing new saved or typed.
 * - `ready` — saved, with a complete language, and differing from what is live.
 * - `unsaved` — the form holds changes a save has not stored yet.
 * - `incomplete` — no language is complete, so a publish would be refused.
 */
export type LandingPublishState =
  | { kind: "upToDate" }
  | { kind: "ready" }
  | { kind: "unsaved" }
  | { kind: "incomplete" };

export function landingPublishState({
  form,
  dirty,
  isPublished,
  hasUnpublishedChanges,
}: {
  form: LandingPageForm;
  dirty: boolean;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}): LandingPublishState {
  if (isPublished && !hasUnpublishedChanges && !dirty) return { kind: "upToDate" };
  const anyComplete = formLocales(form).some(
    (locale) =>
      !isBlankVersion(form.sections, versionOf(form, locale)) && isCompleteInForm(form, locale),
  );
  if (!anyComplete) return { kind: "incomplete" };
  if (dirty) return { kind: "unsaved" };
  return { kind: "ready" };
}

/**
 * The live languages a publish would take off the site: live now, and in the
 * form either removed or no longer complete — which is what adding a section
 * to a live page does to every live language until its words are written.
 */
export function liveLocalesTakenDown(
  form: Pick<LandingPageForm, "sections" | "versions">,
  page: Pick<AdminLandingPage, "publication">,
): SupportedLocale[] {
  if (page.publication === null) return [];
  const live = new Set(page.publication.versions.map((version) => version.locale));
  return SUPPORTED_LOCALES.filter(
    (locale) =>
      live.has(locale) &&
      (form.versions[locale] === undefined || !isCompleteInForm(form, locale)),
  );
}

/** The languages whose slug can no longer change: live once, by the read. */
export function fixedSlugLocales(page: AdminLandingPage | null): ReadonlySet<SupportedLocale> {
  if (page === null) return new Set();
  return new Set([
    ...page.draft.versions.filter((version) => version.slugFixed).map((version) => version.locale),
    ...(page.publication?.versions.map((version) => version.locale) ?? []),
  ]);
}

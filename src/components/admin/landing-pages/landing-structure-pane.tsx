"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Calendar,
  CircleCheck,
  CircleDashed,
  Clock,
  Gamepad2,
  Globe,
  GraduationCap,
  Handshake,
  Heart,
  Laptop,
  Leaf,
  Lightbulb,
  MapPin,
  MessageCircle,
  Palette,
  Plus,
  Puzzle,
  Rocket,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ImagePicker } from "@/components/admin/products/image-picker";
import { LOCALE_CONFIG, type SupportedLocale } from "@/lib/constants/locales";
import {
  LANDING_ICONS,
  LANDING_IMAGE_SIDES,
  type LandingIcon,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import { cn, findOption } from "@/lib/utils";
import {
  ADDABLE_SECTION_TYPES,
  ITEM_BOUNDS,
  formLocales,
  missingInForm,
  missingInSection,
  newSection,
  structureProblems,
  versionOf,
  wordKey,
  type FormSection,
  type FormSectionOf,
  type LandingPageForm,
} from "./landing-page-form";

/**
 * The lucide glyph of every icon a point may carry — exhaustive, so an icon
 * added to the registry's list fails type-check here until it can be shown.
 */
export const LANDING_ICON_GLYPHS: Record<LandingIcon, LucideIcon> = {
  sparkles: Sparkles,
  star: Star,
  heart: Heart,
  "shield-check": ShieldCheck,
  users: Users,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  "map-pin": MapPin,
  calendar: Calendar,
  clock: Clock,
  trophy: Trophy,
  rocket: Rocket,
  lightbulb: Lightbulb,
  "message-circle": MessageCircle,
  smile: Smile,
  puzzle: Puzzle,
  globe: Globe,
  laptop: Laptop,
  "circle-check": CircleCheck,
  palette: Palette,
  handshake: Handshake,
  target: Target,
  leaf: Leaf,
};

const SELECT =
  "h-10 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

type SetForm = React.Dispatch<React.SetStateAction<LandingPageForm>>;

/** What every shared-field editor is handed. */
interface SharedEditorProps<Type extends LandingSectionType> {
  section: FormSectionOf<Type>;
  form: LandingPageForm;
  /** Replace this section with its next state. */
  update: (next: FormSectionOf<Type>) => void;
  /** Remember a picked picture, so it can be painted. */
  rememberPicture: (id: string, picture: { label: string; path: string }) => void;
}

/**
 * **The page's structure**: its sections in order, each with the fields every
 * language shares — pictures, buttons, icons, the items and their order — and
 * the controls that add, move and remove them. The hero is the page's first
 * section and its only one of the kind, so it neither moves nor goes.
 *
 * Each section says, per language written, whether that language has every
 * word it needs — the same rule publishing reads — so a section just added
 * shows at once which languages it has left incomplete.
 *
 * Removing a section asks first, because its words go with it in every
 * language. Removing an item (a point, a step, a question, a picture) does
 * not: it is one row, in plain view, and its words go only from it.
 */
export function LandingStructurePane({
  form,
  setForm,
}: {
  form: LandingPageForm;
  setForm: SetForm;
}) {
  const t = useTranslations("admin.landingPages");
  const [removing, setRemoving] = useState<string | null>(null);
  const problems = structureProblems(form.sections);

  const replace = (next: FormSection) =>
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === next.id ? next : section)),
    }));

  const rememberPicture = (id: string, picture: { label: string; path: string }) =>
    setForm((prev) => ({ ...prev, pictures: { ...prev.pictures, [id]: picture } }));

  const move = (from: number, to: number) =>
    setForm((prev) => ({ ...prev, sections: moved(prev.sections, from, to) }));

  function add(type: (typeof ADDABLE_SECTION_TYPES)[number]) {
    setForm((prev) => ({ ...prev, sections: [...prev.sections, newSection(type)] }));
  }

  function remove(id: string) {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.filter((section) => section.id !== id),
    }));
  }

  const locales = formLocales(form);
  const missingByLocale = new Map(locales.map((locale) => [locale, missingInForm(form, locale)]));

  return (
    <section aria-labelledby="landing-structure-heading" className="space-y-4">
      <div>
        <h2 id="landing-structure-heading" className="text-lg font-semibold">
          {t("structure.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("structure.subtitle")}</p>
      </div>

      <ol className="divide-y divide-border">
        {form.sections.map((section, index) => {
          const isHero = section.type === "hero";
          const sectionName = t("structure.sectionName", {
            number: index + 1,
            type: t(`sectionTypes.${section.type}`),
          });
          const problem = problems.find((p) => p.sectionId === section.id);
          return (
            <li
              key={section.id}
              aria-label={sectionName}
              className="space-y-4 py-5 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium">{sectionName}</h3>
                  <SectionLanguages
                    locales={locales}
                    complete={(locale) =>
                      missingInSection(missingByLocale.get(locale) ?? [], section.id).length === 0
                    }
                  />
                </div>
                {!isHero && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("structure.moveUp", { section: sectionName })}
                      // The hero holds the first place, so nothing moves above it.
                      disabled={index <= 1}
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("structure.moveDown", { section: sectionName })}
                      disabled={index === form.sections.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("structure.remove", { section: sectionName })}
                      onClick={() => setRemoving(section.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <SharedFields
                section={section}
                form={form}
                update={replace}
                rememberPicture={rememberPicture}
              />

              {problem && (
                <p className="text-sm text-muted-foreground">
                  {t(`structure.problems.${problem.kind}`)}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex justify-start border-t border-border pt-4">
        <select
          value=""
          aria-label={t("structure.add")}
          onChange={(event) => {
            const type = findOption(ADDABLE_SECTION_TYPES, event.target.value);
            if (type) add(type);
          }}
          className={SELECT}
        >
          <option value="">{t("structure.add")}</option>
          {ADDABLE_SECTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`sectionTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("structure.removeConfirm.title")}
        description={t("structure.removeConfirm.description")}
        confirmLabel={t("structure.removeConfirm.confirm")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="destructive"
        onConfirm={() => {
          if (removing !== null) remove(removing);
          setRemoving(null);
        }}
      />
    </section>
  );
}

/** Per language written, whether this section has every word it needs there. */
function SectionLanguages({
  locales,
  complete,
}: {
  locales: readonly SupportedLocale[];
  complete: (locale: SupportedLocale) => boolean;
}) {
  const t = useTranslations("admin.landingPages");
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {locales.map((locale) => {
        const done = complete(locale);
        const Mark = done ? CircleCheck : CircleDashed;
        return (
          <li key={locale} className={cn("inline-flex items-center gap-1", done && "text-success")}>
            <span className="uppercase">{locale}</span>
            <Mark className="h-3 w-3" aria-hidden />
            <span className="sr-only">
              {LOCALE_CONFIG[locale].nativeLabel}:{" "}
              {done ? t("versionComplete") : t("versionIncomplete")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One section's shared fields, dispatched to its type's editor. */
function SharedFields({
  section,
  form,
  update,
  rememberPicture,
}: {
  section: FormSection;
  form: LandingPageForm;
  update: (next: FormSection) => void;
  rememberPicture: (id: string, picture: { label: string; path: string }) => void;
}) {
  const common = { form, update, rememberPicture };
  switch (section.type) {
    case "hero":
      return <SHARED_EDITORS.hero section={section} {...common} />;
    case "text":
      return <SHARED_EDITORS.text section={section} {...common} />;
    case "image":
      return <SHARED_EDITORS.image section={section} {...common} />;
    case "points":
      return <SHARED_EDITORS.points section={section} {...common} />;
    case "steps":
      return <SHARED_EDITORS.steps section={section} {...common} />;
    case "faq":
      return <SHARED_EDITORS.faq section={section} {...common} />;
    case "cta":
      return <SHARED_EDITORS.cta section={section} {...common} />;
  }
}

/**
 * **The editor of each section type's shared fields** — exhaustive, so a type
 * added to the registry fails type-check here until it can be edited.
 */
const SHARED_EDITORS: {
  [Type in LandingSectionType]: (props: SharedEditorProps<Type>) => React.ReactNode;
} = {
  hero: function HeroShared({ section, form, update, rememberPicture }) {
    const t = useTranslations("admin.landingPages");
    return (
      <div className="space-y-4">
        <SectionPicture
          label={t("shared.picture")}
          hint={t("hints.heroPicture")}
          imageId={section.imageId}
          form={form}
          onChange={(imageId, picture) => {
            if (imageId !== null && picture !== null) rememberPicture(imageId, picture);
            update({ ...section, imageId });
          }}
        />
        {section.button === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update({ ...section, button: "" })}
          >
            <Plus className="h-4 w-4" />
            {t("shared.addButton")}
          </Button>
        ) : (
          <ButtonAddress
            id={`landing-${section.id}-button`}
            value={section.button}
            onChange={(button) => update({ ...section, button })}
            onRemove={() => update({ ...section, button: null })}
          />
        )}
      </div>
    );
  },
  text: function TextShared({ section, form, update, rememberPicture }) {
    const t = useTranslations("admin.landingPages");
    return (
      <div className="space-y-4">
        <SectionPicture
          label={t("shared.picture")}
          hint={t("hints.textPicture")}
          imageId={section.imageId}
          form={form}
          onChange={(imageId, picture) => {
            if (imageId !== null && picture !== null) rememberPicture(imageId, picture);
            update({ ...section, imageId });
          }}
        />
        <Field label={t("shared.imageSide")} htmlFor={`landing-${section.id}-side`}>
          <select
            id={`landing-${section.id}-side`}
            value={section.imageSide}
            onChange={(event) => {
              const side = findOption(LANDING_IMAGE_SIDES, event.target.value);
              if (side) update({ ...section, imageSide: side });
            }}
            className={cn(SELECT, "w-full")}
          >
            {LANDING_IMAGE_SIDES.map((side) => (
              <option key={side} value={side}>
                {t(`shared.imageSides.${side}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    );
  },
  image: function ImageShared({ section, form, update, rememberPicture }) {
    const t = useTranslations("admin.landingPages");
    return (
      <ItemList
        items={section.images}
        bounds={ITEM_BOUNDS.image}
        itemName={(number) => t("items.image", { number })}
        addLabel={t("items.addImage")}
        onChange={(images) => update({ ...section, images })}
        newItem={() => ({ id: crypto.randomUUID(), imageId: null })}
        renderItem={(image, index) => (
          <SectionPicture
            label={t("items.image", { number: index + 1 })}
            hint={t("hints.imagePicture")}
            required
            imageId={image.imageId}
            form={form}
            onChange={(imageId, picture) => {
              if (imageId !== null && picture !== null) rememberPicture(imageId, picture);
              update({
                ...section,
                images: section.images.map((other) =>
                  other.id === image.id ? { ...other, imageId } : other,
                ),
              });
            }}
          />
        )}
      />
    );
  },
  points: function PointsShared({ section, form, update }) {
    const t = useTranslations("admin.landingPages");
    return (
      <ItemList
        items={section.items}
        bounds={ITEM_BOUNDS.points}
        itemName={(number) => t("items.points", { number })}
        itemTitle={(item) => itemTitle(form, section.id, item.id, "title")}
        addLabel={t("items.addPoint")}
        onChange={(items) => update({ ...section, items })}
        newItem={(): { id: string; icon: LandingIcon } => ({
          id: crypto.randomUUID(),
          icon: "sparkles",
        })}
        renderItem={(item, index) => {
          const Glyph = LANDING_ICON_GLYPHS[item.icon];
          const id = `landing-${item.id}-icon`;
          return (
            <Field label={t("shared.icon", { number: index + 1 })} htmlFor={id}>
              <div className="flex items-center gap-2">
                <Glyph className="h-5 w-5 shrink-0 text-act" aria-hidden />
                <select
                  id={id}
                  value={item.icon}
                  onChange={(event) => {
                    const icon = findOption(LANDING_ICONS, event.target.value);
                    if (icon) {
                      update({
                        ...section,
                        items: section.items.map((other) =>
                          other.id === item.id ? { ...other, icon } : other,
                        ),
                      });
                    }
                  }}
                  className={cn(SELECT, "w-full")}
                >
                  {LANDING_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {t(`icons.${icon}`)}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          );
        }}
      />
    );
  },
  steps: function StepsShared({ section, form, update }) {
    const t = useTranslations("admin.landingPages");
    return (
      <ItemList
        items={section.items}
        bounds={ITEM_BOUNDS.steps}
        itemName={(number) => t("items.steps", { number })}
        itemTitle={(item) => itemTitle(form, section.id, item.id, "title")}
        addLabel={t("items.addStep")}
        onChange={(items) => update({ ...section, items })}
        newItem={() => ({ id: crypto.randomUUID() })}
      />
    );
  },
  faq: function FaqShared({ section, form, update }) {
    const t = useTranslations("admin.landingPages");
    return (
      <ItemList
        items={section.items}
        bounds={ITEM_BOUNDS.faq}
        itemName={(number) => t("items.faq", { number })}
        itemTitle={(item) => itemTitle(form, section.id, item.id, "question")}
        addLabel={t("items.addQuestion")}
        onChange={(items) => update({ ...section, items })}
        newItem={() => ({ id: crypto.randomUUID() })}
      />
    );
  },
  cta: function CtaShared({ section, update }) {
    return (
      <ButtonAddress
        id={`landing-${section.id}-button`}
        value={section.button}
        onChange={(button) => update({ ...section, button })}
      />
    );
  },
};

/** An item's title in the language being written, to tell rows apart. */
function itemTitle(
  form: LandingPageForm,
  sectionId: string,
  itemId: string,
  field: "title" | "question",
): string {
  return (
    versionOf(form, form.activeLocale).words[wordKey(sectionId, `items.${itemId}.${field}`)] ?? ""
  ).trim();
}

/** A picture of a section, picked from the landing picture catalogue. */
function SectionPicture({
  label,
  hint,
  required = false,
  imageId,
  form,
  onChange,
}: {
  label: string;
  hint: string;
  required?: boolean;
  imageId: string | null;
  form: LandingPageForm;
  onChange: (imageId: string | null, picture: { label: string; path: string } | null) => void;
}) {
  return (
    <ImagePicker
      purpose="landing_image"
      label={label}
      hint={hint}
      optional={!required}
      imageId={imageId}
      current={imageId === null ? null : (form.pictures[imageId] ?? null)}
      onChange={onChange}
    />
  );
}

/**
 * Where a button leads, as typed: a path on this site or another site's full
 * address. What is stored can read differently after a save — an address on
 * this site in any language is stored as the page it leads to.
 */
function ButtonAddress({
  id,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("admin.landingPages");
  return (
    <Field
      label={t("shared.buttonAddress")}
      htmlFor={id}
      hint={t("hints.buttonAddress")}
      labelAction={
        onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <X className="h-4 w-4" />
            {t("shared.removeButton")}
          </Button>
        )
      }
    >
      {({ hintId }) => (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
        />
      )}
    </Field>
  );
}

/**
 * A section's items — its points, steps, questions or pictures — in order,
 * each with the controls that move and remove it, and a way to add one. The
 * bounds are the section schema's: the last item allowed cannot be removed
 * and no item is added past the most.
 */
function ItemList<Item extends { id: string }>({
  items,
  bounds,
  itemName,
  itemTitle: titleOf,
  addLabel,
  onChange,
  newItem,
  renderItem,
}: {
  items: readonly Item[];
  bounds: { min: number; max: number };
  itemName: (number: number) => string;
  itemTitle?: (item: Item) => string;
  addLabel: string;
  onChange: (items: Item[]) => void;
  newItem: () => Item;
  renderItem?: (item: Item, index: number) => React.ReactNode;
}) {
  const t = useTranslations("admin.landingPages");
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border border-y border-border">
        {items.map((item, index) => {
          const name = itemName(index + 1);
          const title = titleOf?.(item) ?? "";
          return (
            <li key={item.id} className="space-y-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm">
                  <span className="font-medium">{name}</span>
                  {title !== "" && <span className="ml-2 text-muted-foreground">{title}</span>}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("items.moveUp", { item: name })}
                    disabled={index === 0}
                    onClick={() => onChange(moved(items, index, index - 1))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("items.moveDown", { item: name })}
                    disabled={index === items.length - 1}
                    onClick={() => onChange(moved(items, index, index + 1))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("items.remove", { item: name })}
                    disabled={items.length <= bounds.min}
                    onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {renderItem?.(item, index)}
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={items.length >= bounds.max}
        onClick={() => onChange([...items, newItem()])}
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

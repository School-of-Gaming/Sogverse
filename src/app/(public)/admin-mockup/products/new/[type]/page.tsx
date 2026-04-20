"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Clock,
  ExternalLink,
  Gift,
  Info,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { GeduPickerSheet } from "../_components/gedu-picker-sheet";
import { ImagePickerMock } from "../_components/image-picker-mock";
import { LocationPicker } from "../_components/location-picker";
import {
  GEDUS,
  HOLIDAY_CALENDARS,
  SPOKEN_LANGUAGES,
  TAGS,
  TIMEZONES,
  TOPICS,
  WEEKDAYS,
  getProductType,
  type ProductType,
} from "../_mock/data";

type SlotDraft = {
  weekday: number;
  startTime: string;
  durationMinutes: number;
};

type PaidMode = "free" | "paid";

export default function AdminAddProductMockPage() {
  const { type } = useParams<{ type: string }>();
  const productType = getProductType(type);
  if (!productType) notFound();

  // Basic identity
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topicId, setTopicId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [padletUrl, setPadletUrl] = useState("");

  // Audience
  const [minAge, setMinAge] = useState("7");
  const [maxAge, setMaxAge] = useState("12");
  const [languageCode, setLanguageCode] = useState("fi");

  // Image (mockup only — nothing persisted)
  const [image, setImage] = useState<File | null>(null);

  // Location
  const [isRemote, setIsRemote] = useState(true);
  const [siteId, setSiteId] = useState<string>("");

  // Admin-created topics and tags — mockup-only, merged with base lists.
  const [customTopics, setCustomTopics] = useState<typeof TOPICS>([]);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicKind, setNewTopicKind] = useState<"game" | "subject">("game");

  const [customTags, setCustomTags] = useState<typeof TAGS>([]);
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  // Team
  const [primaryGeduId, setPrimaryGeduId] = useState("");
  const [assistantGeduIds, setAssistantGeduIds] = useState<string[]>([]);
  const [primarySheetOpen, setPrimarySheetOpen] = useState(false);
  const [assistantSheetOpen, setAssistantSheetOpen] = useState(false);
  const primaryGedu = GEDUS.find((g) => g.id === primaryGeduId);
  const assistantGedus = assistantGeduIds
    .map((id) => GEDUS.find((g) => g.id === id))
    .filter((g): g is (typeof GEDUS)[number] => Boolean(g));

  // Capacity
  const [seatCount, setSeatCount] = useState(() => defaultSeats(productType.slug));
  const [uncapped, setUncapped] = useState(false); // only meaningful when seatCountOptional
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);

  // Schedule
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState("Europe/Helsinki");
  const [slots, setSlots] = useState<SlotDraft[]>(() => defaultSlots(productType.slug));
  const [holidayCalIds, setHolidayCalIds] = useState<string[]>(() => defaultHolidayCals(productType.slug));

  // Billing
  const [paidMode, setPaidMode] = useState<PaidMode>(() => defaultPaidMode(productType.slug));
  const [priceTokens, setPriceTokens] = useState("");
  const [refundDays, setRefundDays] = useState("7");

  // Registration timing
  const [registrationOpensAt, setRegistrationOpensAt] = useState("");

  // Visibility
  const [isVisible, setIsVisible] = useState(true);

  // Submit (mock)
  const [submitted, setSubmitted] = useState(false);

  // ---- derived ----
  const effectiveBillingMode = useMemo(() => {
    if (productType.billingMode === "choose_free_or_paid") {
      return paidMode === "free" ? "free" : "paid_upfront";
    }
    return productType.billingMode;
  }, [productType, paidMode]);

  const isPaid = effectiveBillingMode === "paid_per_session" || effectiveBillingMode === "paid_upfront";
  const showRefund = productType.hasRefundWindow && isPaid;
  const canUncap = productType.seatCountOptional && effectiveBillingMode === "free";
  const seatInputDisabled = canUncap && uncapped;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <MockupRibbon />

      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin-mockup/products/new"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Pick a different product type
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              New {productType.shortName.toLowerCase()}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {productType.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{productType.tagline}</p>
          </div>
          <TypeSummaryCard type={productType.slug} />
        </div>

        {submitted ? (
          <SuccessPanel
            productType={productType.slug}
            name={name}
            onReset={() => setSubmitted(false)}
          />
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <FormSection
              title="Identity"
              description="What to call this and what it's about."
            >
              <Field label="Name" htmlFor="name" required>
                <Input
                  id="name"
                  placeholder={namePlaceholder(productType.slug)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>

              <Field label="Description" htmlFor="description" required>
                <textarea
                  id="description"
                  placeholder={descriptionPlaceholder(productType.slug)}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  required
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Field>

              <ImagePickerMock value={image} onChange={setImage} />

              <Field
                label="Topic"
                htmlFor="topic"
                required
                hint="The primary subject — one per product. What the sessions are actually about."
              >
                {showNewTopic ? (
                  <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
                    <Input
                      placeholder="New topic name (e.g. Among Us, Digital wellness)"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Group this under:</span>
                      <button
                        type="button"
                        onClick={() => setNewTopicKind("game")}
                        className={cn(
                          "rounded-md border px-3 py-1 text-xs transition-colors",
                          newTopicKind === "game"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input text-muted-foreground hover:border-foreground hover:text-foreground",
                        )}
                      >
                        Game
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTopicKind("subject")}
                        className={cn(
                          "rounded-md border px-3 py-1 text-xs transition-colors",
                          newTopicKind === "subject"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input text-muted-foreground hover:border-foreground hover:text-foreground",
                        )}
                      >
                        Subject
                      </button>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNewTopicName("");
                          setShowNewTopic(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!newTopicName.trim()}
                        onClick={() => {
                          const name = newTopicName.trim();
                          const id = `t-custom-${Date.now()}`;
                          setCustomTopics((prev) => [
                            ...prev,
                            { id, name, kind: newTopicKind },
                          ]);
                          setTopicId(id);
                          setNewTopicName("");
                          setNewTopicKind("game");
                          setShowNewTopic(false);
                        }}
                      >
                        Add topic
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      id="topic"
                      value={topicId}
                      onChange={(e) => setTopicId(e.target.value)}
                      required
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select a topic…</option>
                      <optgroup label="Games">
                        {[...TOPICS, ...customTopics]
                          .filter((t) => t.kind === "game")
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </optgroup>
                      <optgroup label="Subjects">
                        {[...TOPICS, ...customTopics]
                          .filter((t) => t.kind === "subject")
                          .map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                      </optgroup>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewTopic(true)}
                      title="Add new topic"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Field>

              <Field
                label="Tags"
                hint="Zero or more. Drives parent-facing filters and internal search."
              >
                <div className="flex flex-wrap items-center gap-2">
                  {[...TAGS, ...customTags].map((tag) => {
                    const selected = tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setTagIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== tag.id)
                              : [...prev, tag.id],
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input text-muted-foreground hover:border-foreground hover:text-foreground",
                        )}
                        title={tag.description}
                      >
                        {selected && <Check className="mr-1 inline h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })}

                  {showNewTag ? (
                    <span className="inline-flex items-center gap-1">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        autoFocus
                        className="h-7 w-40 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!newTagName.trim()) return;
                            const id = `tag-custom-${Date.now()}`;
                            setCustomTags((prev) => [
                              ...prev,
                              { id, name: newTagName.trim(), description: "" },
                            ]);
                            setTagIds((prev) => [...prev, id]);
                            setNewTagName("");
                            setShowNewTag(false);
                          }
                          if (e.key === "Escape") {
                            setNewTagName("");
                            setShowNewTag(false);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!newTagName.trim()}
                        onClick={() => {
                          const id = `tag-custom-${Date.now()}`;
                          setCustomTags((prev) => [
                            ...prev,
                            { id, name: newTagName.trim(), description: "" },
                          ]);
                          setTagIds((prev) => [...prev, id]);
                          setNewTagName("");
                          setShowNewTag(false);
                        }}
                      >
                        Add
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTagName("");
                          setShowNewTag(false);
                        }}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Cancel"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewTag(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Add new tag
                    </button>
                  )}
                </div>
              </Field>

              <Field
                label="Padlet URL"
                htmlFor="padlet"
                hint="Optional. Shared with enrolled families after signup."
              >
                <Input
                  id="padlet"
                  type="url"
                  placeholder="https://padlet.com/..."
                  value={padletUrl}
                  onChange={(e) => setPadletUrl(e.target.value)}
                />
              </Field>
            </FormSection>

            <FormSection
              title="Audience"
              description="Who this is intended for."
            >
              <div className="grid grid-cols-2 gap-4">
                <Field label="Min age" htmlFor="minAge" required>
                  <Input
                    id="minAge"
                    type="number"
                    min="0"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Max age" htmlFor="maxAge" required>
                  <Input
                    id="maxAge"
                    type="number"
                    min="0"
                    value={maxAge}
                    onChange={(e) => setMaxAge(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field label="Delivered in" hint="The primary language used during sessions.">
                <div className="flex flex-wrap gap-2">
                  {SPOKEN_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setLanguageCode(lang.code)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition-colors",
                        languageCode === lang.code
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input text-muted-foreground hover:border-foreground hover:text-foreground",
                      )}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              </Field>
            </FormSection>

            <FormSection
              title="Where"
              description={whereDescription(productType.slug)}
            >
              <div className="inline-flex rounded-md border border-input p-1">
                <button
                  type="button"
                  onClick={() => setIsRemote(true)}
                  className={cn(
                    "rounded px-4 py-1.5 text-sm transition-colors",
                    isRemote
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => setIsRemote(false)}
                  className={cn(
                    "rounded px-4 py-1.5 text-sm transition-colors",
                    !isRemote
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  In person
                </button>
              </div>

              <div className="mt-3 space-y-4">
                <Field
                  label={isRemote ? "Jurisdictional home" : "Site"}
                  required
                  hint={
                    isRemote
                      ? "Who this product belongs to in the location tree. An online Helsinki-municipality club picks Helsinki. An online nationally-available event picks Finland. There's no physical venue — just a browse home for parents."
                      : "Where sessions physically happen."
                  }
                >
                  <LocationPicker
                    value={siteId || null}
                    onChange={(id) => setSiteId(id ?? "")}
                    pickable={isRemote ? "jurisdiction" : "site"}
                  />
                </Field>

                {isRemote && (
                  <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>A voice room will be provisioned for this product automatically.</span>
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection
              title="When"
              description={scheduleDescription(productType.slug)}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={startDateLabel(productType.slug)} htmlFor="startDate" required>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </Field>
                {productType.slug === "event" ? (
                  <div className="flex items-end text-xs text-muted-foreground">
                    <Info className="mr-1.5 inline h-3.5 w-3.5" />
                    Events happen on a single date.
                  </div>
                ) : (
                  <Field
                    label={endDateLabel(productType.slug)}
                    htmlFor="endDate"
                    hint={
                      productType.slug === "consumer-club"
                        ? "Leave blank for an ongoing club with no end date."
                        : undefined
                    }
                    required={productType.slug !== "consumer-club"}
                  >
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required={productType.slug !== "consumer-club"}
                    />
                  </Field>
                )}
              </div>

              <Field label="Timezone" htmlFor="timezone" required>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.id} value={tz.id}>{tz.label}</option>
                  ))}
                </select>
              </Field>

              <div className="space-y-2">
                <Label>{slotsLabel(productType.slug)}</Label>
                <ScheduleSlotsEditor
                  productType={productType.slug}
                  slots={slots}
                  onChange={setSlots}
                />
              </div>

              {productType.slug !== "event" && (
                <Field
                  label="Holiday calendars"
                  hint="Dates on any subscribed calendar are skipped. Update the calendar once and every subscribed product updates too."
                >
                  <div className="space-y-2">
                    {HOLIDAY_CALENDARS.map((cal) => {
                      const selected = holidayCalIds.includes(cal.id);
                      return (
                        <label
                          key={cal.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                            selected
                              ? "border-primary bg-primary/5"
                              : "border-input hover:border-foreground/30",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4"
                            checked={selected}
                            onChange={() =>
                              setHolidayCalIds((prev) =>
                                selected
                                  ? prev.filter((id) => id !== cal.id)
                                  : [...prev, cal.id],
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{cal.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {cal.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              )}
            </FormSection>

            <FormSection
              title="Team"
              description="One primary Gedu leads the product. Assistants can share the voice room and help out."
            >
              <Field label="Primary Gedu" required>
                {primaryGedu ? (
                  <GeduChip
                    gedu={primaryGedu}
                    onChange={() => setPrimarySheetOpen(true)}
                    onRemove={() => {
                      setPrimaryGeduId("");
                    }}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPrimarySheetOpen(true)}
                    className="w-full justify-start gap-2 font-normal"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span className="text-muted-foreground">Pick a Gedu…</span>
                  </Button>
                )}
              </Field>

              <Field
                label="Assistant Gedus"
                hint="Optional. Can join the voice room and help run the session."
              >
                <div className="space-y-2">
                  {assistantGedus.map((g) => (
                    <GeduChip
                      key={g.id}
                      gedu={g}
                      onRemove={() =>
                        setAssistantGeduIds((prev) =>
                          prev.filter((id) => id !== g.id),
                        )
                      }
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAssistantSheetOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Add assistant Gedu
                  </Button>
                </div>
              </Field>

              <GeduPickerSheet
                open={primarySheetOpen}
                onOpenChange={setPrimarySheetOpen}
                title="Primary Gedu"
                description="The main host for this product. Shown to parents in search results."
                highlightId={primaryGeduId || undefined}
                excludeIds={assistantGeduIds}
                onSelect={(id) => {
                  setPrimaryGeduId(id);
                  // If the newly-picked primary was in assistants, drop it there.
                  setAssistantGeduIds((prev) => prev.filter((x) => x !== id));
                }}
              />

              <GeduPickerSheet
                open={assistantSheetOpen}
                onOpenChange={setAssistantSheetOpen}
                title="Add assistant Gedu"
                description="Assistants share the voice room and can help run the session."
                excludeIds={[
                  ...(primaryGeduId ? [primaryGeduId] : []),
                  ...assistantGeduIds,
                ]}
                onSelect={(id) => {
                  setAssistantGeduIds((prev) =>
                    prev.includes(id) ? prev : [...prev, id],
                  );
                }}
              />
            </FormSection>

            <FormSection
              title="Capacity & billing"
              description={capacityBillingDescription(productType.slug)}
            >
              {productType.billingMode === "choose_free_or_paid" && (
                <Field label="Billing" hint="Free events can be uncapped. Paid events always have a seat count.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                        paidMode === "free"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-foreground/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="paidMode"
                        checked={paidMode === "free"}
                        onChange={() => setPaidMode("free")}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Gift className="h-4 w-4 text-primary" />
                          Free
                        </div>
                        <div className="text-xs text-muted-foreground">
                          No charge. Anyone can join with one click.
                        </div>
                      </div>
                    </label>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                        paidMode === "paid"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-foreground/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="paidMode"
                        checked={paidMode === "paid"}
                        onChange={() => setPaidMode("paid")}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CircleDollarSign className="h-4 w-4 text-primary" />
                          Paid · Sorg tokens
                        </div>
                        <div className="text-xs text-muted-foreground">
                          One-time charge at signup.
                        </div>
                      </div>
                    </label>
                  </div>
                </Field>
              )}

              {productType.billingMode === "external_contract" && (
                <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Billed via municipal contract</div>
                    <div className="text-xs text-muted-foreground">
                      No Sorg tokens involved. Invoicing is handled off-platform.
                      On-platform municipality billing is planned for a later phase.
                    </div>
                  </div>
                </div>
              )}

              {isPaid && (
                <Field
                  label={
                    effectiveBillingMode === "paid_per_session"
                      ? "Price per session (Sorg tokens)"
                      : "Total price (Sorg tokens)"
                  }
                  htmlFor="price"
                  required
                  hint={
                    effectiveBillingMode === "paid_per_session"
                      ? "Charged each session the child attends (weekly cron)."
                      : "Charged once at signup."
                  }
                >
                  <Input
                    id="price"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 1"
                    value={priceTokens}
                    onChange={(e) => setPriceTokens(e.target.value)}
                    required
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Seat count"
                  htmlFor="seatCount"
                  required={!productType.seatCountOptional || !canUncap || !uncapped}
                  hint={
                    canUncap
                      ? "Free events can be left uncapped (e.g. a webinar, a public walk)."
                      : "When full, new signups go to the waitlist."
                  }
                >
                  <Input
                    id="seatCount"
                    type="number"
                    min="1"
                    value={seatInputDisabled ? "" : seatCount}
                    onChange={(e) => setSeatCount(e.target.value)}
                    disabled={seatInputDisabled}
                    placeholder={seatInputDisabled ? "Uncapped" : undefined}
                    required={!seatInputDisabled}
                  />
                </Field>

                {canUncap && (
                  <div className="flex items-end pb-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={uncapped}
                        onChange={(e) => setUncapped(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>Uncapped (no seat limit)</span>
                    </label>
                  </div>
                )}
              </div>

              {!seatInputDisabled && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={waitlistEnabled}
                    onChange={(e) => setWaitlistEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>Enable waitlist when seats are full</span>
                </label>
              )}

              {showRefund && (
                <Field
                  label="Refund cutoff (days before start)"
                  htmlFor="refundDays"
                  hint="Parents can self-refund up to this many days before the first session. After that, admin action is required."
                >
                  <Input
                    id="refundDays"
                    type="number"
                    min="0"
                    value={refundDays}
                    onChange={(e) => setRefundDays(e.target.value)}
                    className="max-w-[160px]"
                  />
                </Field>
              )}
            </FormSection>

            {productType.hasRegistrationOpensAt !== "never" && (
              <FormSection
                title="Registration timing"
                description={
                  productType.hasRegistrationOpensAt === "required"
                    ? "When the seat-grab opens. Parents browsing before this time see a countdown."
                    : "Optional. If set, parents see a countdown; otherwise signup opens immediately."
                }
              >
                <Field
                  label="Registration opens at"
                  htmlFor="opensAt"
                  required={productType.hasRegistrationOpensAt === "required"}
                  hint="Local time in the timezone above."
                >
                  <Input
                    id="opensAt"
                    type="datetime-local"
                    value={registrationOpensAt}
                    onChange={(e) => setRegistrationOpensAt(e.target.value)}
                    required={productType.hasRegistrationOpensAt === "required"}
                  />
                </Field>
              </FormSection>
            )}

            <FormSection
              title="Visibility"
              description="Control whether parents can see this while you're still setting it up."
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={(e) => setIsVisible(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">Visible to parents</div>
                  <div className="text-xs text-muted-foreground">
                    Uncheck to keep the product hidden while you prepare it. Flip it
                    on when you&apos;re ready for parents to see it.
                  </div>
                </div>
              </label>
            </FormSection>

            <div className="flex items-center justify-between gap-4 border-t pt-6">
              <Link
                href="/admin-mockup/products/new"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Link>
              <Button type="submit" size="lg">
                Create {productType.shortName.toLowerCase()}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ----- helpers -----

function defaultSeats(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "10";
    case "municipality-club":
      return "12";
    case "summer-camp":
      return "16";
    case "event":
      return "30";
  }
}

function defaultSlots(type: ProductType): SlotDraft[] {
  if (type === "summer-camp") {
    return [
      { weekday: 0, startTime: "10:00", durationMinutes: 180 },
      { weekday: 2, startTime: "10:00", durationMinutes: 180 },
      { weekday: 4, startTime: "10:00", durationMinutes: 180 },
    ];
  }
  if (type === "event") {
    return [{ weekday: 0, startTime: "18:00", durationMinutes: 90 }];
  }
  return [{ weekday: 1, startTime: "16:00", durationMinutes: 90 }];
}

function defaultHolidayCals(type: ProductType): string[] {
  if (type === "municipality-club" || type === "summer-camp") {
    return ["cal-fi-national"];
  }
  return [];
}

function defaultPaidMode(type: ProductType): PaidMode {
  return type === "event" ? "free" : "paid";
}

function namePlaceholder(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "e.g. Minecraft Redstone kerho";
    case "municipality-club":
      return "e.g. Tapiola Minecraft Club · Spring 2026";
    case "summer-camp":
      return "e.g. Roblox Builders Summer Camp · Week 26";
    case "event":
      return "e.g. Pokémon GO community walk · Helsinki";
  }
}

function descriptionPlaceholder(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "What happens each week, who it's for, what they'll learn.";
    case "municipality-club":
      return "Hosted at which school, run during which term, delivered in which language.";
    case "summer-camp":
      return "Days, total hours, theme of the week.";
    case "event":
      return "One-line pitch for the event — what, where, for whom.";
  }
}

function whereDescription(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "Online or in person. For online clubs, pick a jurisdictional home (municipality, region, or country).";
    case "municipality-club":
      return "Owned by a specific municipality that pays off-platform. Online clubs pick the municipality directly; in-person clubs pick a site within the municipality.";
    case "summer-camp":
      return "Online or in person. Online camps pick a jurisdictional home; in-person camps pick a site.";
    case "event":
      return "Online or in person. Events can happen at libraries, malls, offices, schools — anywhere a site is registered.";
  }
}

function scheduleDescription(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "One day per week, one time. Leave the end date blank for an ongoing club.";
    case "municipality-club":
      return "One day per week, one time. Runs during the season window.";
    case "summer-camp":
      return "Multiple days per week, each with its own start time and duration.";
    case "event":
      return "A single date and start time. No recurrence.";
  }
}

function startDateLabel(type: ProductType): string {
  return type === "event" ? "Event date" : "Start date";
}

function endDateLabel(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "End date (optional)";
    case "municipality-club":
      return "Season end date";
    case "summer-camp":
      return "Camp end date";
    case "event":
      return "End date";
  }
}

function slotsLabel(type: ProductType): string {
  if (type === "summer-camp") return "Days & times";
  if (type === "event") return "Time";
  return "Day & time";
}

function capacityBillingDescription(type: ProductType): string {
  switch (type) {
    case "consumer-club":
      return "Parents pay in Sorg tokens each session their child attends. Weekly cron handles the charges.";
    case "municipality-club":
      return "Municipality pays off-platform. Parents register their child for free up to the seat limit.";
    case "summer-camp":
      return "Parents pay the total price in Sorg tokens once, at signup. Refundable up to a cutoff.";
    case "event":
      return "Events can be free (optionally uncapped) or paid up-front.";
  }
}

// ----- sub-components -----

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ScheduleSlotsEditor({
  productType,
  slots,
  onChange,
}: {
  productType: ProductType;
  slots: SlotDraft[];
  onChange: (s: SlotDraft[]) => void;
}) {
  const multiDay = productType === "summer-camp";
  const singleSlot = productType === "event" || !multiDay;

  const updateSlot = (index: number, patch: Partial<SlotDraft>) => {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const removeSlot = (index: number) => {
    onChange(slots.filter((_, i) => i !== index));
  };
  const addSlot = () => {
    const usedWeekdays = new Set(slots.map((s) => s.weekday));
    const nextWeekday = WEEKDAYS.find((d) => !usedWeekdays.has(d.value))?.value ?? 0;
    onChange([...slots, { weekday: nextWeekday, startTime: "10:00", durationMinutes: 90 }]);
  };

  return (
    <div className="space-y-3">
      {slots.map((slot, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 rounded-md border border-input bg-muted/20 p-3"
        >
          <div className="col-span-12 sm:col-span-5">
            {productType === "event" ? (
              <div className="flex h-10 items-center px-2 text-sm text-muted-foreground">
                Same as event date
              </div>
            ) : (
              <select
                value={slot.weekday}
                onChange={(e) => updateSlot(i, { weekday: Number(e.target.value) })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.full}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Input
              type="time"
              value={slot.startTime}
              onChange={(e) => updateSlot(i, { startTime: e.target.value })}
            />
          </div>
          <div className="col-span-5 sm:col-span-3">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="1"
                value={slot.durationMinutes}
                onChange={(e) => updateSlot(i, { durationMinutes: Number(e.target.value) })}
                className="h-10"
              />
              <span className="shrink-0 text-xs text-muted-foreground">min</span>
            </div>
          </div>
          <div className="col-span-1 flex items-center justify-end">
            {multiDay && slots.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSlot(i)}
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {multiDay && slots.length < 7 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSlot}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add another day
        </Button>
      )}
      {singleSlot && (
        <p className="text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3" />
          One session {productType === "event" ? "on the event date" : "per week"}.
        </p>
      )}
    </div>
  );
}

function TypeSummaryCard({ type }: { type: ProductType }) {
  const verbs: Record<ProductType, string> = {
    "consumer-club": "Enroll",
    "municipality-club": "Register",
    "summer-camp": "Sign up",
    event: "Join",
  };
  return (
    <div className="hidden shrink-0 sm:block">
      <Badge variant="outline" className="text-xs">
        Parents will see &quot;{verbs[type]}&quot;
      </Badge>
    </div>
  );
}

function SuccessPanel({
  productType,
  name,
  onReset,
}: {
  productType: ProductType;
  name: string;
  onReset: () => void;
}) {
  return (
    <Card className="mt-8 border-primary/50 bg-primary/5">
      <CardContent className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">Mock submission received</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was actually saved — this is a UX mockup. In the real admin
          flow, <span className="font-medium text-foreground">{name || "your new product"}</span> would now
          appear in the product list.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={onReset} size="sm">
            Start over
          </Button>
          <Link href="/admin-mockup/products/new" className="text-sm text-muted-foreground hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              Try a different type
              <ExternalLink className="h-3 w-3" />
            </span>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          <X className="mr-1 inline h-3 w-3" />
          Product type: <code className="rounded bg-muted px-1">{productType}</code>
        </p>
      </CardContent>
    </Card>
  );
}

function MockupRibbon() {
  return (
    <div className="mx-auto mb-6 max-w-md rounded-md border border-dashed border-primary/50 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
      Mockup · all data is fake · for product-team review
    </div>
  );
}

function GeduChip({
  gedu,
  onChange,
  onRemove,
}: {
  gedu: (typeof GEDUS)[number];
  onChange?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-input bg-card p-3">
      <Avatar className="h-9 w-9 shrink-0">
        <Identicon id={gedu.id} size={36} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{gedu.name}</div>
        <div className="truncate text-xs text-muted-foreground">{gedu.email}</div>
      </div>
      <div className="flex shrink-0 gap-1">
        {onChange && (
          <Button type="button" variant="ghost" size="sm" onClick={onChange}>
            Change
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="Remove"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

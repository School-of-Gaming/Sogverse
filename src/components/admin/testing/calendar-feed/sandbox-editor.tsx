"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Constants } from "@/types";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import {
  SANDBOX_LIMITS,
  SANDBOX_PARTICIPATION_STATUSES,
  SANDBOX_TIMEZONES,
  sandboxDefinitionSchema,
  type SandboxDefinition,
  type SandboxParticipation,
  type SandboxProduct,
  type SandboxSlot,
} from "@/lib/calendar-feed/sandbox";
import {
  useResetCalendarFeedSandbox,
  useSaveCalendarFeedSandbox,
} from "@/services/calendar-feed";
import { SectionHeading, selectClass } from "./shared";

/**
 * The fake family, edited in place.
 *
 * Everything here is a draft held locally and written whole on Save: the feed
 * serves the *stored* document, so a half-typed product name must not reach a
 * calendar client mid-edit. That is also why Save is the only thing that
 * matters on this panel — a vendor polls minutes to hours after it, and the
 * note above the editor says so, because otherwise a save that appears to do
 * nothing reads as a bug.
 *
 * Adding or removing a gamer, a product, a slot or a seat reflows the panel,
 * and that is allowed: each is the direct result of the admin's own click on
 * the control that did it.
 */

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Which action is in flight, held from the click until the write settles. */
type Committing = "save" | "reset" | null;

interface SandboxEditorProps {
  /** The stored document, as the server last answered with it. */
  saved: SandboxDefinition;
  /** When it was last saved, already formatted for display. */
  savedAtLabel: string;
}

export function SandboxEditor({ saved, savedAtLabel }: SandboxEditorProps) {
  const t = useTranslations("admin.testing.calendarFeed");
  const w = useTranslations("admin.products.weekdays");
  const productTypeNoun = useTranslations("productType");

  // Seeded once from the server's answer and owned locally thereafter. The
  // snapshot beside it is what "unsaved" is measured against, and both move
  // together on every successful write — so the query refetching underneath
  // this component can never make a saved draft look dirty.
  const [draft, setDraft] = useState<SandboxDefinition>(saved);
  const [snapshot, setSnapshot] = useState<SandboxDefinition>(saved);
  const [committing, setCommitting] = useState<Committing>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const save = useSaveCalendarFeedSandbox();
  const reset = useResetCalendarFeedSandbox();

  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);
  const busy = committing !== null;

  // The same schema the route parses the body with, run against the draft so
  // Save is dark on a document the server would refuse — an emptied name, a
  // duration cleared to zero, a date typed halfway. Keyed on the draft object,
  // which is replaced wholesale by every patch, so a re-render that changes
  // nothing re-parses nothing.
  const valid = useMemo(
    () => sandboxDefinitionSchema.safeParse(draft).success,
    [draft],
  );
  const errorMessage = save.error?.message ?? reset.error?.message ?? null;

  function adopt(definition: SandboxDefinition) {
    setDraft(definition);
    setSnapshot(definition);
    // Cleared in the same commit as the two above, so the buttons never render
    // an enabled frame between the write landing and the draft matching it.
    setCommitting(null);
  }

  function handleSave() {
    setCommitting("save");
    save.mutate(draft, {
      onSuccess: (data) => adopt(data.definition),
      // The admin stays on this panel and has to be able to try again.
      onError: () => setCommitting(null),
    });
  }

  function handleReset() {
    setCommitting("reset");
    reset.mutate(undefined, {
      onSuccess: (data) => adopt(data.definition),
      onError: () => setCommitting(null),
    });
  }

  function patch(change: Partial<SandboxDefinition>) {
    setDraft((previous) => ({ ...previous, ...change }));
  }

  function patchProduct(id: string, change: Partial<SandboxProduct>) {
    patch({
      products: draft.products.map((product) =>
        product.id === id ? { ...product, ...change } : product,
      ),
    });
  }

  function patchParticipation(
    id: string,
    change: Partial<SandboxParticipation>,
  ) {
    patch({
      participations: draft.participations.map((participation) =>
        participation.id === id
          ? { ...participation, ...change }
          : participation,
      ),
    });
  }

  return (
    <div className="space-y-4">
      <SectionHeading>{t("sandboxHeading")}</SectionHeading>
      <p className="text-sm text-muted-foreground">
        {t("sandboxNote", { savedAt: savedAtLabel })}
      </p>

      {/* --- The parent --- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label={t("parentNameLabel")} htmlFor="sandbox-parent-name">
          <Input
            id="sandbox-parent-name"
            value={draft.parent.firstName}
            maxLength={SANDBOX_LIMITS.nameLength}
            onChange={(event) =>
              patch({
                parent: { ...draft.parent, firstName: event.target.value },
              })
            }
          />
        </Field>
        <Field label={t("parentLocaleLabel")} htmlFor="sandbox-parent-locale">
          <select
            id="sandbox-parent-locale"
            className={selectClass}
            value={draft.parent.locale}
            onChange={(event) =>
              patch({
                parent: {
                  ...draft.parent,
                  locale: asLocale(event.target.value, draft.parent.locale),
                },
              })
            }
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* --- Gamers --- */}
      <div className="space-y-2">
        <SectionHeading>{t("gamersHeading")}</SectionHeading>
        {draft.gamers.map((gamer) => (
          <div key={gamer.id} className="flex items-end gap-2">
            <div className="max-w-xs flex-1">
              <Field label={t("gamerNameLabel")} htmlFor={`gamer-${gamer.id}`}>
                <Input
                  id={`gamer-${gamer.id}`}
                  value={gamer.firstName}
                  maxLength={SANDBOX_LIMITS.nameLength}
                  onChange={(event) =>
                    patch({
                      gamers: draft.gamers.map((candidate) =>
                        candidate.id === gamer.id
                          ? { ...candidate, firstName: event.target.value }
                          : candidate,
                      ),
                    })
                  }
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              aria-label={t("removeGamer")}
              onClick={() =>
                patch({
                  gamers: draft.gamers.filter(
                    (candidate) => candidate.id !== gamer.id,
                  ),
                  // A seat whose gamer is gone would name nobody, so it goes
                  // with them rather than being left to be filtered silently.
                  participations: draft.participations.filter(
                    (participation) => participation.gamerId !== gamer.id,
                  ),
                })
              }
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.gamers.length >= SANDBOX_LIMITS.gamers}
          onClick={() =>
            patch({
              gamers: [
                ...draft.gamers,
                { id: crypto.randomUUID(), firstName: t("newGamerName") },
              ],
            })
          }
        >
          <Plus aria-hidden />
          {t("addGamer")}
        </Button>
      </div>

      {/* --- Products --- */}
      <div className="space-y-3">
        <SectionHeading>{t("productsHeading")}</SectionHeading>
        {draft.products.map((product) => (
          <div
            key={product.id}
            className="space-y-4 rounded-md border border-border p-4"
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field
                label={t("productNameLabel")}
                htmlFor={`product-name-${product.id}`}
              >
                <Input
                  id={`product-name-${product.id}`}
                  value={product.name}
                  maxLength={SANDBOX_LIMITS.nameLength}
                  onChange={(event) =>
                    patchProduct(product.id, { name: event.target.value })
                  }
                />
              </Field>

              <Field
                label={t("productTypeLabel")}
                htmlFor={`product-type-${product.id}`}
              >
                <select
                  id={`product-type-${product.id}`}
                  className={selectClass}
                  value={product.productType}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      productType: asProductType(
                        event.target.value,
                        product.productType,
                      ),
                    })
                  }
                >
                  {Constants.public.Enums.product_type.map((value) => (
                    <option key={value} value={value}>
                      {productTypeNoun(value)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={t("productTimezoneLabel")}
                htmlFor={`product-tz-${product.id}`}
              >
                <select
                  id={`product-tz-${product.id}`}
                  className={selectClass}
                  value={product.timezone}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      timezone: asTimezone(
                        event.target.value,
                        product.timezone,
                      ),
                    })
                  }
                >
                  {SANDBOX_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={t("productStartLabel")}
                htmlFor={`product-start-${product.id}`}
                optional
              >
                <Input
                  id={`product-start-${product.id}`}
                  type="date"
                  value={product.startDate ?? ""}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      startDate: emptyToNull(event.target.value),
                    })
                  }
                />
              </Field>

              <Field
                label={t("productEndLabel")}
                htmlFor={`product-end-${product.id}`}
                optional
              >
                <Input
                  id={`product-end-${product.id}`}
                  type="date"
                  value={product.endDate ?? ""}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      endDate: emptyToNull(event.target.value),
                    })
                  }
                />
              </Field>

              <Field
                label={t("productLanguageLabel")}
                htmlFor={`product-lang-${product.id}`}
              >
                <select
                  id={`product-lang-${product.id}`}
                  className={selectClass}
                  value={product.spokenLanguage}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      spokenLanguage: asSpokenLanguage(
                        event.target.value,
                        product.spokenLanguage,
                      ),
                    })
                  }
                >
                  {Constants.public.Enums.spoken_language.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={t("productLocationLabel")}
                htmlFor={`product-place-${product.id}`}
                optional
              >
                <Input
                  id={`product-place-${product.id}`}
                  value={product.locationName ?? ""}
                  maxLength={SANDBOX_LIMITS.nameLength}
                  onChange={(event) =>
                    patchProduct(product.id, {
                      locationName: emptyToNull(event.target.value),
                    })
                  }
                />
              </Field>

              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={product.isRemote}
                  onChange={(event) =>
                    patchProduct(product.id, { isRemote: event.target.checked })
                  }
                />
                {t("productRemoteLabel")}
              </label>
            </div>

            {/* --- Slots --- */}
            <div className="space-y-2">
              <SectionHeading>{t("slotsHeading")}</SectionHeading>
              {product.slots.map((slot, index) => (
                <div
                  key={`${product.id}-slot-${index}`}
                  className="flex flex-wrap items-end gap-2"
                >
                  <select
                    aria-label={t("slotWeekdayLabel")}
                    className={cn(selectClass, "w-auto")}
                    value={slot.weekday}
                    onChange={(event) =>
                      patchSlot(product, index, {
                        weekday: Number(event.target.value),
                      })
                    }
                  >
                    {WEEKDAY_KEYS.map((key, weekday) => (
                      <option key={key} value={weekday}>
                        {w(`${key}Long`)}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label={t("slotStartLabel")}
                    type="time"
                    className="w-auto"
                    value={slot.startTime}
                    onChange={(event) =>
                      patchSlot(product, index, {
                        startTime: event.target.value,
                      })
                    }
                  />
                  <Input
                    aria-label={t("slotDurationLabel")}
                    type="number"
                    className="w-28"
                    min={15}
                    max={600}
                    step={15}
                    value={slot.durationMinutes}
                    onChange={(event) =>
                      patchSlot(product, index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={t("removeSlot")}
                    onClick={() =>
                      patchProduct(product.id, {
                        slots: product.slots.filter(
                          (_, candidate) => candidate !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={
                  product.slots.length >= SANDBOX_LIMITS.slotsPerProduct
                }
                onClick={() =>
                  patchProduct(product.id, {
                    slots: [
                      ...product.slots,
                      { weekday: 0, startTime: "16:00", durationMinutes: 90 },
                    ],
                  })
                }
              >
                <Plus aria-hidden />
                {t("addSlot")}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                patch({
                  products: draft.products.filter(
                    (candidate) => candidate.id !== product.id,
                  ),
                  participations: draft.participations.filter(
                    (participation) => participation.productId !== product.id,
                  ),
                })
              }
            >
              <Trash2 aria-hidden />
              {t("removeProduct")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={draft.products.length >= SANDBOX_LIMITS.products}
          onClick={() =>
            patch({
              products: [
                ...draft.products,
                {
                  id: crypto.randomUUID(),
                  name: t("newProductName"),
                  productType: "consumer_club",
                  timezone: "Europe/Helsinki",
                  startDate: null,
                  endDate: null,
                  isRemote: true,
                  locationName: null,
                  spokenLanguage: "en",
                  slots: [
                    { weekday: 0, startTime: "16:00", durationMinutes: 90 },
                  ],
                },
              ],
            })
          }
        >
          <Plus aria-hidden />
          {t("addProduct")}
        </Button>
      </div>

      {/* --- Seats --- */}
      <div className="space-y-2">
        <SectionHeading>{t("seatsHeading")}</SectionHeading>
        {draft.participations.map((participation) => (
          <div
            key={participation.id}
            className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
          >
            <select
              aria-label={t("seatGamerLabel")}
              className={cn(selectClass, "w-auto")}
              value={participation.gamerId}
              onChange={(event) =>
                patchParticipation(participation.id, {
                  gamerId: event.target.value,
                })
              }
            >
              {draft.gamers.map((gamer) => (
                <option key={gamer.id} value={gamer.id}>
                  {gamer.firstName}
                </option>
              ))}
            </select>
            <select
              aria-label={t("seatProductLabel")}
              className={cn(selectClass, "w-auto")}
              value={participation.productId}
              onChange={(event) =>
                patchParticipation(participation.id, {
                  productId: event.target.value,
                })
              }
            >
              {draft.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("seatStatusLabel")}
              className={cn(selectClass, "w-auto")}
              value={participation.status}
              onChange={(event) =>
                patchParticipation(participation.id, {
                  status: asStatus(event.target.value, participation.status),
                })
              }
            >
              {SANDBOX_PARTICIPATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`seatStatus.${status}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={participation.placed}
                onChange={(event) =>
                  patchParticipation(participation.id, {
                    placed: event.target.checked,
                  })
                }
              />
              {t("seatPlacedLabel")}
            </label>
            <Input
              aria-label={t("seatCancelsAtLabel")}
              type="datetime-local"
              className="w-auto"
              value={toLocalInput(participation.cancelsAt)}
              onChange={(event) =>
                patchParticipation(participation.id, {
                  cancelsAt: fromLocalInput(event.target.value),
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              aria-label={t("removeSeat")}
              onClick={() =>
                patch({
                  participations: draft.participations.filter(
                    (candidate) => candidate.id !== participation.id,
                  ),
                })
              }
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={
            draft.participations.length >= SANDBOX_LIMITS.participations ||
            draft.gamers.length === 0 ||
            draft.products.length === 0
          }
          onClick={() => {
            // Safe without a presence check because the button above is
            // disabled while either list is empty — and indexed access is typed
            // as always-present here, so a guard would read as a test the
            // compiler has already refused to make.
            const gamer = draft.gamers[0];
            const product = draft.products[0];
            patch({
              participations: [
                ...draft.participations,
                {
                  id: crypto.randomUUID(),
                  gamerId: gamer.id,
                  productId: product.id,
                  status: "active",
                  placed: true,
                  cancelsAt: null,
                },
              ],
            });
          }}
        >
          <Plus aria-hidden />
          {t("addSeat")}
        </Button>
      </div>

      {errorMessage !== null && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Reset is the negative half — it throws the edits away — so it is first
          in the DOM and the affirmative Save is last. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirmingReset(true)}
        >
          {t("resetSandbox")}
        </Button>
        <Button
          type="button"
          disabled={busy || !dirty || !valid}
          onClick={handleSave}
        >
          {committing === "save" ? t("savingSandbox") : t("saveSandbox")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title={t("resetConfirmTitle")}
        description={t("resetConfirmBody")}
        confirmLabel={t("resetSandbox")}
        onConfirm={handleReset}
      />
    </div>
  );

  function patchSlot(
    product: SandboxProduct,
    index: number,
    change: Partial<SandboxSlot>,
  ) {
    patchProduct(product.id, {
      slots: product.slots.map((slot, candidate) =>
        candidate === index ? { ...slot, ...change } : slot,
      ),
    });
  }
}

/** `""` from a cleared input means "no value", not an empty string. */
function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

/**
 * A stored instant as a `datetime-local` input's value — the admin's own wall
 * clock, which is the only clock face they can reason about.
 */
function toLocalInput(iso: string | null): string {
  if (iso === null) return "";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-` +
    `${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}`
  );
}

/** The inverse: a local wall clock back to the absolute instant it names. */
function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

// Narrowing helpers. A `<select>` hands back a plain string, and every one of
// these value sets is a union the document is typed on — so each falls back to
// the value already held rather than widening the draft to a string.

function asLocale(
  value: string,
  fallback: SandboxDefinition["parent"]["locale"],
): SandboxDefinition["parent"]["locale"] {
  return SUPPORTED_LOCALES.find((locale) => locale === value) ?? fallback;
}

function asProductType(
  value: string,
  fallback: SandboxProduct["productType"],
): SandboxProduct["productType"] {
  return (
    Constants.public.Enums.product_type.find((type) => type === value) ??
    fallback
  );
}

function asSpokenLanguage(
  value: string,
  fallback: SandboxProduct["spokenLanguage"],
): SandboxProduct["spokenLanguage"] {
  return (
    Constants.public.Enums.spoken_language.find((code) => code === value) ??
    fallback
  );
}

function asTimezone(
  value: string,
  fallback: SandboxProduct["timezone"],
): SandboxProduct["timezone"] {
  return SANDBOX_TIMEZONES.find((zone) => zone === value) ?? fallback;
}

function asStatus(
  value: string,
  fallback: SandboxParticipation["status"],
): SandboxParticipation["status"] {
  return (
    SANDBOX_PARTICIPATION_STATUSES.find((status) => status === value) ??
    fallback
  );
}

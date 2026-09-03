"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CalendarFeedLookupResponse } from "@/services/calendar-feed";

/**
 * The other source: a real customer, resolved by email or user id.
 *
 * A real family's feed is what the exploration is ultimately about — a sandbox
 * proves the mechanics, and only a real household proves that the mechanics
 * describe the household correctly.
 */

interface RealAccountLookupProps {
  value: string;
  onChange: (value: string) => void;
  onLookUp: () => void;
  lookingUp: boolean;
  errorMessage: string | null;
  resolved: CalendarFeedLookupResponse | null;
}

export function RealAccountLookup({
  value,
  onChange,
  onLookUp,
  lookingUp,
  errorMessage,
  resolved,
}: RealAccountLookupProps) {
  const t = useTranslations("admin.testing.calendarFeed");
  const productTypeNoun = useTranslations("productType");

  return (
    <div className="space-y-4">
      <Field label={t("customerLabel")} htmlFor="calendar-feed-customer">
        {/* Plain `flex-col`, not the button row's `flex-col-reverse`: this is a
            field and its action rather than two buttons answering one question,
            and reversing it would stack the button above the input it acts on. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="calendar-feed-customer"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("customerPlaceholder")}
          />
          <Button
            type="button"
            disabled={lookingUp || value.trim() === ""}
            onClick={onLookUp}
          >
            {lookingUp ? t("lookingUp") : t("lookUp")}
          </Button>
        </div>
      </Field>

      {errorMessage !== null && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {resolved && (
        <div className="rounded-md border border-border p-4">
          <p className="text-sm font-medium">{resolved.customerName}</p>
          {resolved.participations.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("noParticipations")}
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {resolved.participations.map((participation) => (
                <li key={participation.id}>
                  {t("seatLine", {
                    gamer: participation.participantFirstName,
                    product: participation.productName,
                    type: productTypeNoun(participation.productType),
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

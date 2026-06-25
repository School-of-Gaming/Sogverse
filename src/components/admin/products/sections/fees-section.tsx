"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { findOption } from "@/lib/utils";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants";
import { FormSection } from "../form-primitives";
import {
  ASSISTANT_GEDU_FEE_STATUS_VALUES,
  MUNICIPALITY_FEE_STATUS_VALUES,
  PRIMARY_GEDU_FEE_STATUS_VALUES,
  type FeeDraft,
  type FormState,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface FeesSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

// Every status value used across the three fees. Each fee allows only a subset
// (see the *_FEE_STATUS_VALUES tuples); labels live under
// admin.products.fees.status.*.
type FeeStatus = "unknown" | "none" | "volunteer" | "fee";

/**
 * One fee = a status select plus a EUR amount input that appears only when the
 * admin picks "fee". The select is what makes the state explicit: "unknown"
 * (or "none") writes null, "volunteer" writes 0, "fee" writes the typed amount.
 * An empty amount box never means "unknown", and a typed 0 never means a fee.
 */
function FeeRow<S extends FeeStatus>({
  id,
  label,
  hint,
  statuses,
  statusLabel,
  amountLabel,
  draft,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  statuses: readonly S[];
  // Concrete-keyed label map, built by the parent — passing it in (rather than
  // calling t(`status.${s}`) here) keeps next-intl's typed message keys happy,
  // since a generic key defeats its literal-key inference.
  statusLabel: Record<FeeStatus, string>;
  amountLabel: string;
  draft: FeeDraft<S>;
  onChange: (next: FeeDraft<S>) => void;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="space-y-2">
        <select
          id={id}
          value={draft.status}
          onChange={(e) => {
            const status = findOption(statuses, e.target.value);
            if (status) onChange({ ...draft, status });
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
        {draft.status === "fee" && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCY_CONFIG[DEFAULT_CURRENCY].symbol}
            </span>
            <Input
              id={`${id}-amount`}
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(e) => onChange({ ...draft, amount: e.target.value })}
              required
              className="pl-7"
              aria-label={amountLabel}
            />
          </div>
        )}
      </div>
    </Field>
  );
}

/**
 * Per-session operating fees: what we pay each game educator and (for
 * municipality clubs) what the municipality pays us. These are internal
 * figures — distinct from the price parents pay in the Billing section above.
 */
export function FeesSection({ state, setState, config }: FeesSectionProps) {
  const t = useTranslations("admin.products");
  const tf = useTranslations("admin.products.fees");
  const isMuni = config.productType === "municipality_club";

  // Concrete-keyed labels (see FeeRow) shared by all three fee rows.
  const statusLabel: Record<FeeStatus, string> = {
    unknown: tf("status.unknown"),
    none: tf("status.none"),
    volunteer: tf("status.volunteer"),
    fee: tf("status.fee"),
  };
  const amountLabel = tf("amountLabel");

  return (
    <FormSection
      title={t("fees.sectionTitle")}
      description={t("fees.sectionDescription")}
    >
      <FeeRow
        id="fee-primary-gedu"
        label={t("fees.primaryGeduLabel")}
        hint={t("fees.primaryGeduHint")}
        statuses={PRIMARY_GEDU_FEE_STATUS_VALUES}
        statusLabel={statusLabel}
        amountLabel={amountLabel}
        draft={state.primaryGeduFee}
        onChange={(primaryGeduFee) => setState({ ...state, primaryGeduFee })}
      />
      <FeeRow
        id="fee-assistant-gedu"
        label={t("fees.assistantGeduLabel")}
        hint={t("fees.assistantGeduHint")}
        statuses={ASSISTANT_GEDU_FEE_STATUS_VALUES}
        statusLabel={statusLabel}
        amountLabel={amountLabel}
        draft={state.assistantGeduFee}
        onChange={(assistantGeduFee) => setState({ ...state, assistantGeduFee })}
      />
      {isMuni && (
        <FeeRow
          id="fee-municipality"
          label={t("fees.municipalityLabel")}
          hint={t("fees.municipalityHint")}
          statuses={MUNICIPALITY_FEE_STATUS_VALUES}
          statusLabel={statusLabel}
          amountLabel={amountLabel}
          draft={state.municipalityFee}
          onChange={(municipalityFee) => setState({ ...state, municipalityFee })}
        />
      )}
    </FormSection>
  );
}

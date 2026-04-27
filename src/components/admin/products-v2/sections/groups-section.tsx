"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormSection, InfoCallout } from "../form-primitives";
import { GeduPickerSheetV2 } from "../gedu-picker-sheet-v2";
import { GroupCard } from "../group-card";
import type { FormState } from "../product-v2-form-state";

interface GroupsSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function GroupsSection({ state, setState }: GroupsSectionProps) {
  const t = useTranslations("admin.productsV2");

  const activeGroup = state.activeGroupSheetId
    ? (state.groups.find((g) => g.id === state.activeGroupSheetId) ?? null)
    : null;

  return (
    <FormSection
      title={t("sections.groups")}
      description={t("sections.groupsDescription")}
    >
      <InfoCallout text={t("hints.groupsHint")} />
      <InfoCallout text={t("hints.groupsNotWired")} variant="warn" />

      {state.groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-input px-4 py-6 text-center">
          <p className="text-sm font-medium">{t("groups.noGroupsYet")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("groups.noGroupsDetail")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {state.groups.map((group, i) => (
            <GroupCard
              key={group.id}
              group={group}
              index={i}
              onNameChange={(name) =>
                setState({
                  ...state,
                  groups: state.groups.map((g) =>
                    g.id === group.id ? { ...g, name } : g
                  ),
                })
              }
              onRemoveGedu={(geduId) =>
                setState({
                  ...state,
                  groups: state.groups.map((g) =>
                    g.id === group.id
                      ? {
                          ...g,
                          geduIds: g.geduIds.filter((id) => id !== geduId),
                        }
                      : g
                  ),
                })
              }
              onAddGedu={() =>
                setState({ ...state, activeGroupSheetId: group.id })
              }
              onRemove={() =>
                setState({
                  ...state,
                  groups: state.groups.filter((g) => g.id !== group.id),
                })
              }
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const letter = String.fromCharCode(65 + state.groups.length);
          setState({
            ...state,
            groups: [
              ...state.groups,
              {
                id: `g-${Date.now()}-${state.groups.length}`,
                name: t("groups.defaultName", { letter }),
                geduIds: [],
              },
            ],
          });
        }}
        className="gap-1.5"
      >
        <Plus className="h-4 w-4" />
        {t("groups.addGroup")}
      </Button>

      {/* Only mount the picker while it's open. Sheet uses createPortal
          against document.body, which crashes during SSR — and conditional
          mounting matches the convention in src/components/admin/group-card.tsx
          (line 272) for the same reason. */}
      {activeGroup && (
        <GeduPickerSheetV2
          open
          onOpenChange={(open) => {
            if (!open) setState({ ...state, activeGroupSheetId: null });
          }}
          title={t("groups.addGeduTo", { name: activeGroup.name })}
          description={t("groups.addGeduDescription")}
          excludeIds={activeGroup.geduIds}
          onSelect={(geduId) => {
            setState({
              ...state,
              groups: state.groups.map((g) =>
                g.id === activeGroup.id
                  ? { ...g, geduIds: [...g.geduIds, geduId] }
                  : g
              ),
            });
          }}
        />
      )}
    </FormSection>
  );
}

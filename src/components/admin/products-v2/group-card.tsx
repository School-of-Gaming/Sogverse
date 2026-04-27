"use client";

import { useTranslations } from "next-intl";
import { Trash2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUsersByRole } from "@/services/users";
import type { Profile } from "@/types";

export interface GroupDraft {
  id: string;
  name: string;
  geduIds: string[];
}

interface GroupCardProps {
  group: GroupDraft;
  index: number;
  onNameChange: (name: string) => void;
  onAddGedu: () => void;
  onRemoveGedu: (geduId: string) => void;
  onRemove: () => void;
}

export function GroupCard({
  group,
  index,
  onNameChange,
  onAddGedu,
  onRemoveGedu,
  onRemove,
}: GroupCardProps) {
  const t = useTranslations("admin.productsV2.groups");
  const { data: gedus } = useUsersByRole("gedu");

  const assigned = group.geduIds
    .map((id) => gedus?.find((g) => g.id === id))
    .filter((g): g is Profile => Boolean(g));

  return (
    <div className="rounded-md border border-input bg-card p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label
            htmlFor={`group-${group.id}-name`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            {t("groupNumber", { n: index + 1 })}
          </Label>
          <Input
            id={`group-${group.id}-name`}
            value={group.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("groupNamePlaceholder")}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={t("removeGroup")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("assignedGedus")}
        </Label>
        {assigned.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noGedusYet")}</p>
        ) : (
          <div className="space-y-2">
            {assigned.map((gedu) => (
              <GeduChip
                key={gedu.id}
                gedu={gedu}
                onRemove={() => onRemoveGedu(gedu.id)}
              />
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddGedu}
          className="gap-1.5"
        >
          <UserPlus className="h-4 w-4" />
          {t("assignGedu")}
        </Button>
      </div>
    </div>
  );
}

interface GeduChipProps {
  gedu: Profile;
  onRemove: () => void;
}

function GeduChip({ gedu, onRemove }: GeduChipProps) {
  const t = useTranslations("admin.productsV2.groups");
  return (
    <div className="flex items-center gap-3 rounded-md border border-input bg-card p-3">
      <Avatar className="h-9 w-9 shrink-0">
        <Identicon id={gedu.id} size={36} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{gedu.display_name}</div>
        {gedu.email && (
          <div className="truncate text-xs text-muted-foreground">
            {gedu.email}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={t("removeGedu")}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

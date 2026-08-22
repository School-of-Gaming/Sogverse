/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a control label on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { accessoriesForSlot, accessoryFits } from "../accessories";
import { CONCEPT_IDS, type ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { DETAIL_LABELS, DETAIL_LEVELS, detailForSize, type DetailLevel } from "../detail";
import { OUTFIT_SLOTS, SLOT_LABELS, type Outfit, type OutfitSlot } from "../outfit";
import { PALETTE_PRESETS } from "../palette";
import { Mascot } from "../mascot";
import {
  EXPRESSION_LABELS,
  MASCOT_EXPRESSIONS,
  MASCOT_POSES,
  MASCOT_PROPS,
  MASCOT_ROLES,
  POSE_LABELS,
  PROP_LABELS,
  ROLE_LABELS,
  type ExpressionId,
  type MascotRole,
  type PoseId,
  type PropId,
} from "../vocabulary";
import { ChipRow, type Choice } from "./controls";

/** "Auto" is a real value in the UI and `undefined` in the props contract. */
const AUTO = "auto";
const NONE = "none";

const CONCEPT_CHOICES: Choice<ConceptId>[] = CONCEPT_IDS.map((id) => ({
  id,
  label: getConcept(id).species,
}));

const POSE_CHOICES: Choice<PoseId>[] = MASCOT_POSES.map((id) => ({ id, label: POSE_LABELS[id] }));
const EXPRESSION_CHOICES: Choice<ExpressionId>[] = MASCOT_EXPRESSIONS.map((id) => ({
  id,
  label: EXPRESSION_LABELS[id],
}));
const ROLE_CHOICES: Choice<MascotRole>[] = MASCOT_ROLES.map((id) => ({ id, label: ROLE_LABELS[id] }));
const PROP_CHOICES: Choice<PropId | typeof AUTO>[] = [
  { id: AUTO, label: "Auto" },
  ...MASCOT_PROPS.map((id) => ({ id, label: PROP_LABELS[id] })),
];
const DETAIL_CHOICES: Choice<DetailLevel | typeof AUTO>[] = [
  { id: AUTO, label: "Auto (from size)" },
  ...DETAIL_LEVELS.map((id) => ({ id, label: DETAIL_LABELS[id] })),
];
const PALETTE_CHOICES: Choice<string>[] = PALETTE_PRESETS.map((p) => ({ id: p.id, label: p.label }));
const CROP_CHOICES: Choice<"full" | "bust" | "head">[] = [
  { id: "full", label: "Full body" },
  { id: "bust", label: "Bust" },
  { id: "head", label: "Head" },
];
const TOGGLE_CHOICES: Choice<"on" | "off">[] = [
  { id: "on", label: "On" },
  { id: "off", label: "Off" },
];

export function Playground(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const [variant, setVariant] = useState<string>("lilac");
  const [palette, setPalette] = useState<string>("native");
  const [pose, setPose] = useState<PoseId>("controller");
  const [expression, setExpression] = useState<ExpressionId>("excited");
  const [role, setRole] = useState<MascotRole>("gamer");
  const [prop, setProp] = useState<PropId | typeof AUTO>(AUTO);
  const [outfit, setOutfit] = useState<Outfit>({});
  const [size, setSize] = useState(240);
  const [detail, setDetail] = useState<DetailLevel | typeof AUTO>(AUTO);
  const [crop, setCrop] = useState<"full" | "bust" | "head">("full");
  const [animated, setAnimated] = useState(true);
  const [silhouette, setSilhouette] = useState(false);
  // Rather than a timer, the copied flag remembers *what* was copied. Any
  // change to the character makes the stored key stale, so the button reverts
  // on its own the moment what is on screen is no longer what is on the
  // clipboard — which is the only moment the message stops being true.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const stage = useRef<HTMLDivElement>(null);
  const def = getConcept(concept);

  // The variant chips belong to the selected concept, so a concept change can
  // leave the stored id orphaned. Resolving here rather than resetting on
  // change means switching to a species and back keeps your colourway.
  const activeVariant = def.variants.find((v) => v.id === variant)?.id ?? def.variants[0].id;
  const paletteColors = PALETTE_PRESETS.find((p) => p.id === palette)?.colors ?? {};
  const effectiveDetail = detail === AUTO ? detailForSize(size) : detail;

  function setSlot(slot: OutfitSlot, id: string): void {
    setOutfit((current) => ({ ...current, [slot]: id === NONE ? undefined : id }));
  }

  const configKey = JSON.stringify([
    concept,
    activeVariant,
    palette,
    pose,
    expression,
    role,
    prop,
    outfit,
    size,
    detail,
    crop,
    animated,
    silhouette,
  ]);
  const copied = copiedKey === configKey;

  function copySvg(): void {
    const svg = stage.current?.querySelector("svg");
    if (svg === null || svg === undefined) return;
    void navigator.clipboard
      .writeText(`<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`)
      .then(() => {
        setCopiedKey(configKey);
      })
      .catch(() => {
        setCopiedKey(null);
      });
  }

  return (
    <Card>
      <CardContent className="grid gap-8 p-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
        {/* The stage is a fixed box so that changing any control repaints the
            character without moving a single thing around it. */}
        <div className="space-y-3">
          <div
            ref={stage}
            className="flex h-[24rem] w-full items-center justify-center rounded-xl border border-border bg-background"
          >
            <Mascot
              concept={concept}
              variant={activeVariant}
              colors={paletteColors}
              pose={pose}
              expression={expression}
              role={role}
              outfit={outfit}
              prop={prop === AUTO ? undefined : prop}
              size={size}
              detail={detail === AUTO ? undefined : detail}
              crop={crop}
              animated={animated}
              silhouette={silhouette}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={16}
              max={340}
              step={4}
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
              }}
              aria-label="Rendered size in pixels"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {size}px · {DETAIL_LABELS[effectiveDetail].toLowerCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={copySvg}
              className="min-w-[10rem]"
            >
              {copied ? "Copied to clipboard" : "Copy SVG markup"}
            </Button>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Exactly what is on screen, as a standalone file. Animation travels with it.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <ChipRow label="Species" options={CONCEPT_CHOICES} value={concept} onChange={setConcept} />
          <ChipRow
            label="Colourway"
            options={def.variants.map((v) => ({ id: v.id, label: v.label }))}
            value={activeVariant}
            onChange={setVariant}
          />
          <ChipRow label="Palette" options={PALETTE_CHOICES} value={palette} onChange={setPalette} />
          <ChipRow label="Pose" options={POSE_CHOICES} value={pose} onChange={setPose} />
          <ChipRow
            label="Face"
            options={EXPRESSION_CHOICES}
            value={expression}
            onChange={setExpression}
          />
          <ChipRow label="Role" options={ROLE_CHOICES} value={role} onChange={setRole} />
          <ChipRow label="Holding" options={PROP_CHOICES} value={prop} onChange={setProp} />

          <div className="my-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Outfit slots — layered over the identity core, never replacing it
            </p>
            <div className="space-y-3">
              {OUTFIT_SLOTS.map((slot) => (
                <ChipRow
                  key={slot}
                  label={SLOT_LABELS[slot]}
                  options={[
                    { id: NONE, label: "None" },
                    ...accessoriesForSlot(slot).map((item) => ({
                      id: item.id,
                      label: accessoryFits(item, concept) ? item.label : `${item.label} (n/a)`,
                    })),
                  ]}
                  value={outfit[slot] ?? NONE}
                  onChange={(id) => {
                    setSlot(slot, id);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <ChipRow label="Detail" options={DETAIL_CHOICES} value={detail} onChange={setDetail} />
            <ChipRow label="Crop" options={CROP_CHOICES} value={crop} onChange={setCrop} />
            <ChipRow
              label="Motion"
              options={TOGGLE_CHOICES}
              value={animated ? "on" : "off"}
              onChange={(next) => {
                setAnimated(next === "on");
              }}
            />
            <ChipRow
              label="Flatten"
              options={TOGGLE_CHOICES}
              value={silhouette ? "on" : "off"}
              onChange={(next) => {
                setSilhouette(next === "on");
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

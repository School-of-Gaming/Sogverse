"use client";

import {
  ArrowDown,
  ArrowUp,
  Heading as HeadingIcon,
  Pilcrow,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ProductLongDescription,
  ProductLongDescriptionBlock,
} from "@/types";

// Editor for a product's optional structured long description: a flat, ordered
// list of heading / paragraph blocks rendered top-to-bottom on the shop detail
// page. Plain text only — no inline marks (see migration 00091). Each block is
// one text field; headings get a single-line input, paragraphs a textarea.
// Reorder with the up/down arrows, drop with the trash button. An empty list is
// the "no long description" state (submits as SQL NULL).

interface LongDescriptionBlocksEditorProps {
  value: ProductLongDescription;
  onChange: (next: ProductLongDescription) => void;
  disabled?: boolean;
}

export function LongDescriptionBlocksEditor({
  value,
  onChange,
  disabled,
}: LongDescriptionBlocksEditorProps) {
  const t = useTranslations("admin.products.longDescription");

  function updateBlock(idx: number, text: string) {
    onChange(value.map((b, i) => (i === idx ? { ...b, text } : b)));
  }

  function removeBlock(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function addBlock(type: ProductLongDescriptionBlock["type"]) {
    onChange([...value, { type, text: "" }]);
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed border-input bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        value.map((block, i) => {
          const isHeading = block.type === "heading";
          return (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-md border border-input bg-muted/20 p-3"
            >
              {/* Type marker — icon + label so the block kind is scannable
                  without reading the field. */}
              <span className="flex h-10 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {isHeading ? (
                  <HeadingIcon className="h-4 w-4" />
                ) : (
                  <Pilcrow className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {isHeading ? t("headingLabel") : t("paragraphLabel")}
                </span>
              </span>

              {isHeading ? (
                <Input
                  aria-label={t("headingLabel")}
                  value={block.text}
                  placeholder={t("headingPlaceholder")}
                  onChange={(e) => updateBlock(i, e.target.value)}
                  disabled={disabled}
                  className="h-10 font-medium"
                />
              ) : (
                <textarea
                  aria-label={t("paragraphLabel")}
                  value={block.text}
                  placeholder={t("paragraphPlaceholder")}
                  onChange={(e) => updateBlock(i, e.target.value)}
                  disabled={disabled}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}

              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveBlock(i, -1)}
                  disabled={disabled || i === 0}
                  aria-label={t("moveUp")}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveBlock(i, 1)}
                  disabled={disabled || i === value.length - 1}
                  aria-label={t("moveDown")}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBlock(i)}
                  disabled={disabled}
                  aria-label={t("remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock("heading")}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t("addHeading")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock("paragraph")}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t("addParagraph")}
        </Button>
      </div>
    </div>
  );
}

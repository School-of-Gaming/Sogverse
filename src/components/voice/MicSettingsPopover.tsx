"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MicLevelIndicator } from "./MicLevelIndicator";

/**
 * Mic device picker + troubleshooting, behind a chevron next to the mic button.
 * Lets the user switch input device, see a "blocked" hint, and watch a live
 * level bar to confirm the right mic is being captured. Lightweight popover
 * (no primitive in the kit): a panel opened upward with click-outside-to-close.
 */
export function MicSettingsPopover() {
  const { audioInputs, currentAudioInputId, setAudioInput, micPermission } = useVoiceRoom();
  const t = useTranslations("voice");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setOpen((v) => !v)}
        title={t("micSettings")}
        aria-label={t("micSettings")}
        aria-expanded={open}
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-medium">{t("microphone")}</p>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("micInput")}</span>
            <select
              value={currentAudioInputId ?? ""}
              onChange={(e) => void setAudioInput(e.target.value)}
              disabled={audioInputs.length === 0}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {audioInputs.length === 0 ? (
                <option value="">{t("noMics")}</option>
              ) : (
                audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("unnamedMic")}
                  </option>
                ))
              )}
            </select>
          </label>

          {micPermission === "denied" && (
            <p className="mt-2 text-xs text-destructive">{t("micBlockedHint")}</p>
          )}

          <div className="mt-3 space-y-1.5">
            <span className="text-xs text-muted-foreground">{t("micTestHint")}</span>
            <MicLevelIndicator />
          </div>
        </div>
      )}
    </div>
  );
}

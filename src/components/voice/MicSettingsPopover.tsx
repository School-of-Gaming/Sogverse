"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { MediaErrorNotice } from "./MediaErrorNotice";
import type { AudioInputDevice } from "./hooks/use-mic-devices";
import type { MediaErrorCategory } from "@/lib/voice/media-error";

interface MicSettingsPopoverProps {
  audioInputs: AudioInputDevice[];
  currentAudioInputId: string | null;
  onSelectInput: (deviceId: string) => void;
  mediaError: MediaErrorCategory | null;
  /**
   * The live level meter rendered under "speak to test". Passed in so the
   * popover stays decoupled from where the audio comes from — the in-call dock
   * supplies a context-backed `<MicLevelIndicator />`, the lobby supplies one
   * driven by its raw preview stream.
   */
  levelIndicator: ReactNode;
}

/**
 * Mic device picker + troubleshooting, behind a chevron next to the mic button.
 * Lets the user switch input device, see the real acquisition error, and watch
 * a live level bar to confirm the right mic is being captured. Lightweight
 * popover (no primitive in the kit): a panel opened upward with
 * click-outside-to-close.
 *
 * Presentational — its data + actions are injected, which is what lets the same
 * picker serve the in-call control dock (Daily-backed) and the instant-room
 * lobby (raw-stream-backed) with one visual grammar.
 */
export function MicSettingsPopover({
  audioInputs,
  currentAudioInputId,
  onSelectInput,
  mediaError,
  levelIndicator,
}: MicSettingsPopoverProps) {
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
        type="button"
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
      {/* A device error (denied/in-use/missing) is otherwise invisible behind
          the popover — surface a badge on the trigger so the user knows to open
          it. Mirrors the moderator-lock badge on the toggle buttons. */}
      {mediaError && !open && (
        <AlertTriangle className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 text-destructive" />
      )}

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-medium">{t("microphone")}</p>

          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("micInput")}</span>
            <select
              value={currentAudioInputId ?? ""}
              onChange={(e) => onSelectInput(e.target.value)}
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

          {mediaError && <MediaErrorNotice category={mediaError} className="mt-2" />}

          <div className="mt-3 space-y-1.5">
            <span className="text-xs text-muted-foreground">{t("micTestHint")}</span>
            {levelIndicator}
          </div>
        </div>
      )}
    </div>
  );
}

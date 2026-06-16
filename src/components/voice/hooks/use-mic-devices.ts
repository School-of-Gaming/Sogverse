import { useCallback, useEffect, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/** Mic access state for the troubleshooting hint. We avoid the Permissions API
 *  (its `PermissionName` lib type omits "microphone") and infer from device
 *  labels instead: browsers only expose labels once mic access is granted. */
export type MicPermission = "granted" | "denied" | "unknown";

interface UseMicDevicesParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  joined: boolean;
}

/**
 * Mic input devices + current selection + a coarse permission signal, backing
 * the mic-settings popover. Reads through the Daily call object so it reflects
 * the track Daily is actually capturing.
 */
export function useMicDevices({ callObjectRef, joined }: UseMicDevicesParams) {
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [currentAudioInputId, setCurrentAudioInputId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const co = callObjectRef.current;
    if (!co) return;
    try {
      const { devices } = await co.enumerateDevices();
      setAudioInputs(
        devices
          .filter((d) => d.kind === "audioinput" && d.deviceId !== "")
          .map((d) => ({ deviceId: d.deviceId, label: d.label })),
      );
      const inputs = await co.getInputDevices();
      const mic = inputs.mic;
      setCurrentAudioInputId("deviceId" in mic ? mic.deviceId : null);
    } catch {
      // Enumeration can fail transiently (permission revoked mid-call); leave
      // the last-known list rather than blanking the picker.
    }
  }, [callObjectRef]);

  // Refresh on join and whenever the OS device set changes (plug/unplug). The
  // device set doesn't change across a room switch, so we don't clear on the
  // brief !joined window — the stale list is harmless and avoids a flash.
  useEffect(() => {
    if (!joined) return;
    void refresh();
    const handler = () => void refresh();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [joined, refresh]);

  const setAudioInput = useCallback(
    async (deviceId: string) => {
      const co = callObjectRef.current;
      if (!co) return;
      await co.setInputDevicesAsync({ audioDeviceId: deviceId });
      setCurrentAudioInputId(deviceId);
    },
    [callObjectRef],
  );

  // Labels are only populated once mic access is granted; an empty list while
  // joined means no usable mic (blocked or absent).
  const micPermission: MicPermission = !joined
    ? "unknown"
    : audioInputs.length === 0
      ? "denied"
      : audioInputs.some((d) => d.label !== "")
        ? "granted"
        : "unknown";

  return { audioInputs, currentAudioInputId, setAudioInput, micPermission };
}

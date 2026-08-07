"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { useLocalStreamGlow } from "@/components/voice/hooks/use-local-stream-glow";
import { MicToggleButton, CameraToggleButton } from "@/components/voice/MediaToggleButtons";
import { MicSettingsPopover } from "@/components/voice/MicSettingsPopover";
import { MicLevelIndicator } from "@/components/voice/MicLevelIndicator";
import { RoomLinkChip } from "./RoomLinkChip";
import type { AudioInputDevice } from "@/components/voice/hooks/use-mic-devices";
import { classifyMediaError, type MediaErrorCategory } from "@/lib/voice/media-error";

/**
 * Who the server says is looking at this page — `profiles.id` and the first
 * name the room will show — or `null` for a signed-out visitor.
 *
 * Computed in the `/voice/[code]` server component from the same session the
 * token route reads, and threaded down. Deliberately *not* derived from the
 * client's `useAuth()`: the browser client's session singleton is seeded from
 * cookies at construction and can be stale, and a lobby disagreeing with the
 * token route about who you are is exactly the drift this avoids.
 */
export interface InstantRoomViewer {
  /** `profiles.id` — the same id the token bakes in, so the lobby's preview
   *  identicon is the avatar the room will actually render. */
  id: string;
  firstName: string;
}

interface InstantVoiceLobbyProps {
  /** Validated, uppercase 4-character room code — rendered as the copyable
   *  room link so whoever gets here first can invite the rest before joining. */
  code: string;
  /**
   * Called with the lobby-supplied display name (empty whenever the viewer is
   * signed in — the server uses their profile name) and the user's
   * preview-screen mic/camera choices, which the call object honors at join
   * time.
   */
  onJoin: (
    displayName: string,
    media: { micOn: boolean; cameraOn: boolean; audioDeviceId: string | null },
  ) => void;
  /** The signed-in viewer's identity, or `null` when signed out. The *only*
   *  thing it decides here is the name input; permissions are the token
   *  route's business and a signed-in non-moderator still joins as a guest. */
  viewer: InstantRoomViewer | null;
  joining: boolean;
  /** Most recent error from a failed join attempt; rendered above the join button. */
  error: string | null;
}

/**
 * Pre-join screen for instant voice rooms. Everyone sees it — it is the
 * device-prep screen, not a guest formality — and it shows a live preview of
 * the avatar exactly as it will appear in the voice room: speaking glow,
 * camera-in-circle, mic indicator.
 *
 * The one thing that varies is the name input, and it turns on sign-in, not on
 * moderator status: anyone signed in joins as themselves under their profile
 * name, so only a signed-out visitor is asked what to call them.
 *
 * For a signed-in viewer the preview identicon is their profile id, which is
 * exactly the avatar the call will render. For a signed-out one it is a
 * throwaway client-side UUID and the call gets a *different* server-issued one
 * (the token route's Vector D mitigation), so the pattern won't match.
 * Acceptable: identicons are abstract and don't function as identity.
 */
export function InstantVoiceLobby({ code, onJoin, viewer, joining, error }: InstantVoiceLobbyProps) {
  const t = useTranslations("voice.instant.lobby");

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The current preview stream, mirrored for unmount cleanup. `stream` state
  // alone isn't enough: switching input device swaps the stream object, and the
  // cleanup closure would otherwise stop a stale one and leak the live tracks.
  const streamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [mediaError, setMediaError] = useState<MediaErrorCategory | null>(null);
  const [audioInputs, setAudioInputs] = useState<AudioInputDevice[]>([]);
  const [currentAudioInputId, setCurrentAudioInputId] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Preview-only identicon for signed-out visitors. Generated client-side
  // after mount so SSR doesn't produce a different UUID than the client
  // (hydration mismatch). The server issues a separate UUID for the actual
  // call — we don't try to keep these in sync; see the file-level note above.
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the render-after-mount is the point: a fresh client-only UUID after hydration avoids the SSR/client mismatch we'd get from generating it during render.
    setPreviewId(crypto.randomUUID());
  }, []);

  // A signed-in viewer's profile id is what the token bakes in, so the preview
  // is the real avatar. Signed-out visitors get the throwaway one.
  const lobbyIdenticonId = viewer ? viewer.id : previewId;

  // Acquire mic + (optional) camera on mount and route the stream into the
  // preview <video>. Toggling cam/mic just enables/disables the existing
  // tracks instead of re-prompting for permission.
  useEffect(() => {
    let cancelled = false;

    // Device labels only populate once access is granted, so enumerate *after*
    // the initial getUserMedia, and again on plug/unplug.
    const refreshInputs = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setAudioInputs(
          devices
            .filter((d) => d.kind === "audioinput" && d.deviceId !== "")
            .map((d) => ({ deviceId: d.deviceId, label: d.label })),
        );
      } catch {
        // Keep the last-known list on a transient enumeration failure.
      }
    };

    async function acquire() {
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          next.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = next;
        // Camera starts OFF in the preview; the lobby's `cameraOn` toggle
        // is forwarded to the call object at join time, so whatever the
        // user chose here is what they enter the room with.
        next.getVideoTracks().forEach((tr) => (tr.enabled = false));
        if (videoRef.current) {
          videoRef.current.srcObject = next;
        }
        setStream(next);
        setCurrentAudioInputId(
          next.getAudioTracks()[0]?.getSettings().deviceId ?? null,
        );
        void refreshInputs();
      } catch (err) {
        if (cancelled) return;
        // User denied permission, no devices, in use, or HTTP origin. We let
        // them continue to join — they can grant later, and Daily will work
        // without media. The native error is browser-specific and English-only,
        // so we classify it and surface a localized, category-specific message.
        setMediaError(classifyMediaError(err));
      }
    }

    void acquire();
    const onDeviceChange = () => void refreshInputs();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // Speaking glow on the avatar frame (white halo + brighter border that
  // pulses with mic level). Visually identical to the in-call avatar.
  useLocalStreamGlow(frameRef, stream, micOn);

  const toggleCamera = () => {
    if (!stream) return;
    const next = !cameraOn;
    stream.getVideoTracks().forEach((tr) => (tr.enabled = next));
    setCameraOn(next);
  };

  const toggleMic = () => {
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((tr) => (tr.enabled = next));
    setMicOn(next);
  };

  // Switch the preview to a different mic. Re-acquire *only* audio so the
  // camera isn't re-opened, swap the audio track into a fresh stream object
  // (the new ref re-runs the glow/level analysers against the new track), and
  // carry the choice into the call via `currentAudioInputId` → onJoin.
  const selectAudioInput = async (deviceId: string) => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });
      const newAudio = audioStream.getAudioTracks()[0];
      newAudio.enabled = micOn;
      const keptVideo = stream?.getVideoTracks() ?? [];
      stream?.getAudioTracks().forEach((tr) => tr.stop());
      const combined = new MediaStream([...keptVideo, newAudio]);
      streamRef.current = combined;
      if (videoRef.current) videoRef.current.srcObject = combined;
      setStream(combined);
      setCurrentAudioInputId(newAudio.getSettings().deviceId ?? deviceId);
      setMediaError(null);
    } catch (err) {
      setMediaError(classifyMediaError(err));
    }
  };

  const trimmedName = name.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN &&
    trimmedName.length <= DISPLAY_NAME_MAX;
  const canJoin = viewer !== null || nameValid;

  // Display name shown under the avatar — mirrors what the in-call avatar
  // will render (profile first name when signed in, the typed name otherwise).
  const previewName = viewer ? viewer.firstName : trimmedName;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canJoin || joining) return;
    // A signed-in viewer sends no name at all: the server takes it from their
    // profile and ignores anything we'd put here.
    onJoin(viewer ? "" : trimmedName, {
      micOn,
      cameraOn,
      audioDeviceId: currentAudioInputId,
    });
  };

  return (
    <div className="container mx-auto max-w-3xl p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
          {/* The room link, right where someone waiting in the lobby wants it:
              the first person to arrive is usually the one inviting the rest. */}
          <div className="pt-2">
            <RoomLinkChip code={code} />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar preview — sized and styled to mirror the in-call avatar */}
            <div className="flex flex-col items-center gap-3">
              <div
                ref={frameRef}
                className="relative h-48 w-48 overflow-hidden rounded-2xl border-2 border-border bg-muted ring-1 ring-primary/30 transition-shadow"
              >
                {/* Always-mounted video; hidden when camera is off so toggling
                    on doesn't have to re-attach `srcObject`. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover",
                    !cameraOn && "hidden",
                  )}
                />
                {!cameraOn && lobbyIdenticonId && (
                  <Identicon id={lobbyIdenticonId} size={192} />
                )}
                {/* Mic indicator overlay — same idea as VoiceAvatar */}
                <div className="absolute bottom-2 right-2 rounded-full bg-background/70 p-1.5">
                  {micOn ? (
                    <Mic className="h-4 w-4 text-success" />
                  ) : (
                    <MicOff className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
              {/* Reserve label height to keep the layout stable as the user types. */}
              <p className="min-h-[1.5rem] text-center text-base font-medium">
                {previewName}
              </p>
            </div>

            {/* Mic + device picker + camera — the same controls as the in-call
                dock (shared `MediaToggleButtons` + `MicSettingsPopover`), so the
                lobby and the room read as one UI. The picker's chevron carries
                the device selector, the real acquisition error (behind a badge),
                and a live level meter off the preview stream. Disabled until the
                preview stream is acquired. */}
            <div className="flex items-center justify-center gap-2">
              <MicToggleButton on={micOn} onToggle={toggleMic} disabled={!stream} />
              <MicSettingsPopover
                audioInputs={audioInputs}
                currentAudioInputId={currentAudioInputId}
                onSelectInput={selectAudioInput}
                mediaError={mediaError}
                levelIndicator={<MicLevelIndicator stream={stream} active={micOn} />}
              />
              <CameraToggleButton on={cameraOn} onToggle={toggleCamera} disabled={!stream} />
            </div>

            {/* Name input — signed-out visitors only */}
            {viewer === null && (
              <div className="space-y-2">
                <label htmlFor="display-name" className="text-sm font-medium">
                  {t("nameLabel")}
                </label>
                <Input
                  id="display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={DISPLAY_NAME_MAX}
                  required
                  autoFocus
                  placeholder={t("namePlaceholder")}
                  className="shadow-sm transition-colors"
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!canJoin || joining}
                size="lg"
                className="gap-2"
              >
                {joining && <Loader2 className="h-4 w-4 animate-spin" />}
                {joining ? t("joining") : t("join")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

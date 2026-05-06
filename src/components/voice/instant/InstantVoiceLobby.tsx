"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { useLocalStreamGlow } from "@/components/voice/hooks/use-local-stream-glow";

interface InstantVoiceLobbyProps {
  /**
   * Called with the lobby-supplied display name (empty for mods who use
   * their profile) and the user's preview-screen mic/camera choices,
   * which the call object honors at join time.
   */
  onJoin: (
    displayName: string,
    media: { micOn: boolean; cameraOn: boolean },
  ) => void;
  joining: boolean;
  /** Most recent error from a failed join attempt; rendered above the join button. */
  error: string | null;
}

/**
 * Pre-join screen for instant voice rooms. Shows a live preview of the
 * avatar exactly as it will appear in the spatial canvas — speaking
 * glow, camera-in-circle, mic indicator — and (for guests) collects a
 * display name.
 *
 * Authenticated admins/gedus skip the name input — the server uses their
 * profile display name. Everyone else, including authenticated parents
 * and gamers, is treated as a guest and must provide a name.
 *
 * The lobby's identicon is a *preview* generated from a fresh client-side
 * UUID. The actual call uses a server-issued UUID (see token route's
 * Vector D mitigation), so the in-call avatar pattern won't be identical.
 * Acceptable: identicons are abstract and don't function as identity.
 */
export function InstantVoiceLobby({ onJoin, joining, error }: InstantVoiceLobbyProps) {
  const t = useTranslations("voice.instant.lobby");
  const { profile } = useAuth();
  const isMod = profile?.role === "admin" || profile?.role === "gedu";

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [name, setName] = useState("");

  // Preview-only identicon. Generated client-side after mount so SSR doesn't
  // produce a different UUID than the client (hydration mismatch). The server
  // issues a separate UUID for the actual call — we don't try to keep these
  // in sync; see the file-level note above.
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the render-after-mount is the point: a fresh client-only UUID after hydration avoids the SSR/client mismatch we'd get from generating it during render.
    setPreviewId(crypto.randomUUID());
  }, []);

  // For mods, show their profile identicon — that matches the avatar
  // they'll have in-call. Everyone else (guests, including auth'd
  // parents/gamers) sees the preview identicon.
  const lobbyIdenticonId = profile && isMod ? profile.id : previewId;

  // Acquire mic + (optional) camera on mount and route the stream into the
  // preview <video>. Toggling cam/mic just enables/disables the existing
  // tracks instead of re-prompting for permission.
  useEffect(() => {
    let cancelled = false;
    let acquired: MediaStream | null = null;

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
        acquired = next;
        // Camera starts OFF in the preview; the lobby's `cameraOn` toggle
        // is forwarded to the call object at join time, so whatever the
        // user chose here is what they enter the room with.
        next.getVideoTracks().forEach((tr) => (tr.enabled = false));
        if (videoRef.current) {
          videoRef.current.srcObject = next;
        }
        setStream(next);
      } catch {
        if (cancelled) return;
        // User denied permission, no devices, or HTTP origin. We let them
        // continue to join — they can grant later, and Daily will work
        // without media. The native error is browser-specific and English-only,
        // so we surface a localized message instead.
        setPermissionError(true);
      }
    }

    void acquire();

    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((tr) => tr.stop());
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

  const trimmedName = name.trim();
  const nameValid =
    trimmedName.length >= DISPLAY_NAME_MIN &&
    trimmedName.length <= DISPLAY_NAME_MAX;
  const canJoin = isMod || nameValid;

  // Display name shown under the avatar — mirrors what the in-call avatar
  // will render (mods use profile.display_name, guests use the typed name).
  const previewName =
    profile && isMod ? profile.display_name : trimmedName;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canJoin || joining) return;
    onJoin(isMod ? "" : trimmedName, { micOn, cameraOn });
  };

  return (
    <div className="container mx-auto max-w-3xl p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
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

            {/* Cam/mic toggles. Fixed min-width on each button so the layout
                doesn't shift when the label flips between on/off — the
                value is sized to fit the longer label across every locale. */}
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant={micOn ? "secondary" : "destructive"}
                size="sm"
                onClick={toggleMic}
                className="min-w-[10rem] justify-center gap-2"
                aria-label={micOn ? t("muteMic") : t("unmuteMic")}
              >
                {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {micOn ? t("micOn") : t("micOff")}
              </Button>
              <Button
                type="button"
                variant={cameraOn ? "secondary" : "outline"}
                size="sm"
                onClick={toggleCamera}
                className="min-w-[10rem] justify-center gap-2"
                aria-label={cameraOn ? t("hideCamera") : t("showCamera")}
              >
                {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                {cameraOn ? t("cameraOn") : t("cameraOff")}
              </Button>
            </div>

            {permissionError && (
              <p className="text-center text-sm text-muted-foreground">
                {t("permissionDenied")}
              </p>
            )}

            {/* Name input — guests only */}
            {!isMod && (
              <div className="space-y-2">
                <label htmlFor="display-name" className="text-sm font-medium">
                  {t("nameLabel")}
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={DISPLAY_NAME_MAX}
                  required
                  autoFocus
                  placeholder={t("namePlaceholder")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers";
import { cn } from "@/lib/utils";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

interface InstantVoiceLobbyProps {
  /** Called with the lobby-supplied display name (empty for mods who use their profile). */
  onJoin: (displayName: string) => void;
  joining: boolean;
  /** Most recent error from a failed join attempt; rendered above the join button. */
  error: string | null;
}

/**
 * Pre-join screen for instant voice rooms. Asks for camera/mic permission,
 * shows a live preview, and (for guests) collects a display name.
 *
 * Authenticated admins/gedus skip the name input — the server uses their
 * profile display name. Everyone else, including authenticated parents and
 * gamers, is treated as a guest and must provide a name.
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

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Preview-only identicon. Regenerates on mount; the server issues a separate
  // UUID for the actual call. We don't try to keep them in sync — see the
  // file-level note above.
  const [previewId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : "preview",
  );

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
        // Camera is OFF by default on entry to match the in-call default
        // (Daily creates the call object with `startVideoOff: true`).
        next.getVideoTracks().forEach((tr) => (tr.enabled = false));
        if (videoRef.current) {
          videoRef.current.srcObject = next;
        }
        setStream(next);
      } catch (err) {
        if (cancelled) return;
        // User denied permission, no devices, or HTTP origin. We let them
        // continue to join — they can grant later, and Daily will work
        // without media.
        const msg = err instanceof Error ? err.message : String(err);
        setPermissionError(msg);
      }
    }

    void acquire();

    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canJoin || joining) return;
    onJoin(isMod ? "" : trimmedName);
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
            {/* Preview */}
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn("h-full w-full object-cover", !cameraOn && "hidden")}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Avatar className="h-24 w-24">
                    <Identicon id={lobbyIdenticonId} size={96} />
                  </Avatar>
                  <p className="text-sm text-muted-foreground">
                    {t("cameraOff")}
                  </p>
                </div>
              )}

              {/* Mic level indicator overlay */}
              {micOn && stream && <LobbyMicLevel stream={stream} />}
            </div>

            {/* Cam/mic toggles */}
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant={micOn ? "secondary" : "destructive"}
                size="sm"
                onClick={toggleMic}
                className="gap-2"
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
                className="gap-2"
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
                <p className="text-xs text-muted-foreground">
                  {t("nameHelp", { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX })}
                </p>
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

/**
 * Bar that visualizes the lobby user's mic level. Reads directly from the
 * `getUserMedia` stream — separate from the in-call `MicLevelIndicator`
 * which reads from the Daily call object that doesn't exist here yet.
 */
function LobbyMicLevel({ stream }: { stream: MediaStream }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    const track = tracks[0];
    const bar = barRef.current;
    if (!bar) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128;
        sum += norm * norm;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 3);
      bar.style.width = `${level * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className="absolute bottom-3 left-3 right-3 h-1 overflow-hidden rounded-full bg-background/40">
      <div
        ref={barRef}
        className="h-full rounded-full bg-success transition-[width] duration-75"
        style={{ width: "0%" }}
      />
    </div>
  );
}

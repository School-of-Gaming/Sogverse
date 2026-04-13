import { type Ref } from "react";
import { Mic, MicOff, Video, VideoOff, Crown, Lock, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { cn } from "@/lib/utils";

export interface ParticipantRowData {
  userId: string;
  userName: string;
  audioOn: boolean;
  videoOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
}

export interface ParticipantRowProps {
  participant: ParticipantRowData;
  volume: number;
  lockState: { audio: boolean; video: boolean };
  /** Whether the viewer is a moderator (reserves column space on all rows). */
  isModView: boolean;
  avatarRef?: Ref<HTMLDivElement>;
  onVolumeChange?: (volume: number) => void;
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
}

export function ParticipantRow({
  participant: p,
  volume,
  lockState,
  isModView,
  avatarRef,
  onVolumeChange,
  onMute,
  onLock,
}: ParticipantRowProps) {
  const t = useTranslations('voice');
  const showModButtons = isModView && !p.isLocal && !p.isOwner;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 transition-colors",
        p.isLocal && "bg-accent/50",
      )}
    >
      {/* Avatar */}
      <div ref={avatarRef} className="shrink-0 rounded-md">
        <Avatar className="h-8 w-8">
          <Identicon id={p.userId} size={32} />
        </Avatar>
      </div>

      {/* Name + badges — flex-[3] gives ~60% of flexible space */}
      <div className="flex min-w-0 flex-[3] items-center gap-2">
        <span className="truncate text-sm font-medium">
          {p.userName}
          {p.isLocal && (
            <span className="ml-1 text-xs text-muted-foreground">{t('you')}</span>
          )}
        </span>
        {p.isOwner && (
          <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
            <Crown className="h-3 w-3" />
            {t('host')}
          </Badge>
        )}
      </div>

      {/* Moderator controls — invisible placeholder keeps alignment on non-target rows */}
      {isModView && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            !showModButtons && "invisible",
          )}
          aria-hidden={!showModButtons || undefined}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onMute?.("audio")}
            disabled={!p.audioOn}
            title={t('muteMicrophone')}
          >
            <MicOff className="h-3 w-3" />
            {t('mute')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onMute?.("video")}
            disabled={!p.videoOn}
            title={t('disableCamera')}
          >
            <VideoOff className="h-3 w-3" />
            {t('camOff')}
          </Button>
          <Button
            variant={lockState.audio ? "destructive" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onLock?.("audio", !lockState.audio)}
            title={lockState.audio ? t('unlockMicrophone') : t('lockMicrophone')}
          >
            <Lock className="h-3 w-3" />
            {/* Grid-stack: invisible longest label reserves stable width */}
            <span className="inline-grid [&>*]:col-start-1 [&>*]:row-start-1">
              <span className="invisible">{t('unlockMic')}</span>
              <span>{lockState.audio ? t('unlockMic') : t('lockMic')}</span>
            </span>
          </Button>
          <Button
            variant={lockState.video ? "destructive" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onLock?.("video", !lockState.video)}
            title={lockState.video ? t('unlockCamera') : t('lockCamera')}
          >
            <Lock className="h-3 w-3" />
            <span className="inline-grid [&>*]:col-start-1 [&>*]:row-start-1">
              <span className="invisible">{t('unlockCam')}</span>
              <span>{lockState.video ? t('unlockCam') : t('lockCam')}</span>
            </span>
          </Button>
        </div>
      )}

      {/* Volume slider — always rendered (flex-[2]) for stable layout, empty for local */}
      <div className="flex min-w-0 flex-[2] items-center gap-1.5">
        {!p.isLocal && (
          <>
            <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={VOICE_CONFIG.MIN_VOLUME * 100}
              max={VOICE_CONFIG.MAX_VOLUME * 100}
              value={Math.round(volume * 100)}
              onChange={(e) => onVolumeChange?.(Number(e.target.value) / 100)}
              className="h-1.5 min-w-0 flex-1 accent-primary"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
              {Math.round(volume * 100)}%
            </span>
          </>
        )}
      </div>

      {/* Status indicators — always show both icons for stable layout */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative">
          {p.videoOn ? (
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <VideoOff
              className={cn(
                "h-3.5 w-3.5",
                lockState.video ? "text-destructive" : "text-muted-foreground",
              )}
            />
          )}
          {lockState.video && (
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          )}
        </div>
        <div className="relative">
          {p.audioOn ? (
            <Mic className="h-3.5 w-3.5 text-success" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-destructive" />
          )}
          {lockState.audio && (
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          )}
        </div>
      </div>
    </div>
  );
}

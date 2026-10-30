"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ScreenShareOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";
import { fitTileGrid, TILE_GAP_PX } from "./fit-tile-grid";
import { StageTile } from "./StageTile";
import { useTileFlip } from "./use-tile-flip";
import { useRenderVideo } from "./VideoSurface";

/** What a share's box costs a phone's stage: its own 16:9 height, then the gap. */
const SHARE_ASPECT = 16 / 9;

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The share, drawn whole in whatever box the stage gives it. */
function StageShare({
  sharer,
  className,
}: {
  sharer: VoiceParticipant;
  className?: string;
}) {
  const t = useTranslations("voice");
  const { isScreenSharing, stopScreenShare } = useVoiceRoom();
  const renderVideo = useRenderVideo();
  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {renderVideo(sharer, "screen")}
      <div className="absolute left-2 top-2">
        <Badge variant="outline" className="glass">
          {t("sharerScreen", { name: sharer.userName })}
        </Badge>
      </div>
      {isScreenSharing && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <Button
            variant="destructive"
            size="sm"
            onClick={stopScreenShare}
            className="gap-1.5"
          >
            <ScreenShareOff className="h-4 w-4" />
            {t("stopSharing")}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The stage: the people in your zone, as big as the space allows, and the share
 * above them when someone in view is sharing.
 *
 * The tiles keep one parent through every arrangement, grid or strip, so a share
 * starting glides the same elements to their new places and their video keeps
 * playing. The available space is worked out from the stage rather than measured
 * off the tile area, because the tile area's own size lags a frame behind a share
 * starting or stopping and would size every tile against the old layout.
 */
export function TileStage({
  members,
  sharer,
  shareLayout,
  tileAspect,
  minTileWidth,
}: {
  members: VoiceParticipant[];
  sharer: VoiceParticipant | null;
  /**
   * Where the tiles go while a share is up. `strip` is a single row under it, for
   * a wide screen; `below` keeps the grid in the space a 16:9 share leaves, for a
   * tall one.
   */
  shareLayout: "strip" | "below";
  tileAspect: number;
  minTileWidth: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);

  const isStrip = sharer !== null && shareLayout === "strip";
  const grid =
    stage === null || isStrip
      ? null
      : fitTileGrid({
          count: members.length,
          width: stage.width,
          height:
            sharer === null
              ? stage.height
              : stage.height - stage.width / SHARE_ASPECT - TILE_GAP_PX,
          aspect: tileAspect,
          minTileWidth,
        });

  useTileFlip(
    tilesRef,
    `${isStrip ? "strip" : "grid"}|${sharer !== null}|${members
      .map((p) => p.sessionId)
      .join(",")}`,
  );

  return (
    <div ref={stageRef} className="flex h-full min-h-0 w-full flex-col gap-2">
      {sharer !== null && (
        <StageShare
          sharer={sharer}
          className={shareLayout === "strip" ? "flex-1" : "aspect-video shrink-0"}
        />
      )}
      <div
        className={cn(
          "flex min-h-0 w-full",
          isStrip ? "h-28 shrink-0 overflow-x-auto" : "flex-1 overflow-y-auto",
        )}
      >
        {/* Auto margins centre it, and unlike centring on the flex parent they
            leave the start of an overflowing run reachable. */}
        <div
          ref={tilesRef}
          style={grid === null ? undefined : { width: grid.columns * grid.tileWidth + (grid.columns - 1) * TILE_GAP_PX }}
          className={cn(
            "relative m-auto flex gap-2",
            isStrip ? "h-full" : "flex-wrap justify-center",
            grid?.scrolls && "mt-0",
          )}
        >
          {(isStrip || grid !== null) &&
            members.map((p) => (
              <StageTile
                key={p.sessionId}
                participant={p}
                className={isStrip ? "aspect-video h-full" : undefined}
                style={
                  grid === null
                    ? undefined
                    : { width: grid.tileWidth, height: grid.tileHeight }
                }
              />
            ))}
        </div>
      </div>
    </div>
  );
}

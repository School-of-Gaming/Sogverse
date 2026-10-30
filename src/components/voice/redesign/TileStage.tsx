"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ScreenShareOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";
import { fitTileGrid, TILE_GAP_PX, type TileAspectRange } from "./fit-tile-grid";
import { SharePreviewTile, StageTile } from "./StageTile";
import { useTileFlip } from "./use-tile-flip";
import { useRenderVideo } from "./VideoSurface";

/** What a share's box costs a phone's stage: its own 16:9 height, then the gap. */
const SHARE_ASPECT = 16 / 9;
/**
 * What the tiles stay in from the stage's edge. A scroller clips, and a speaking glow
 * reaches 16px past a tile, so the scroller runs out to the stage column's own edge
 * (`-m-2`, the column's padding) with `p-4` inside it: the whole glow, and nothing
 * drawn outside the column, however far a strip scrolls.
 */
const TILE_BLEED_PX = 8;

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

/** The big share, drawn whole in whatever box the stage gives it. */
function StageShare({
  sharer,
  className,
}: {
  sharer: VoiceParticipant;
  className?: string;
}) {
  const t = useTranslations("voice");
  const { stopScreenShare } = useVoiceRoom();
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
      {sharer.isLocal && (
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
 * The stage: the people in your zone, as big as the space allows, and one share
 * above them when anyone in view is sharing. The other shares come first among
 * the tiles, so a long run of people never hides one.
 *
 * The tiles keep one parent through every arrangement, grid or strip, so a share
 * starting glides the same elements to their new places and their video keeps
 * playing. The available space is worked out from the stage rather than measured
 * off the tile area, because the tile area's own size lags a frame behind a share
 * starting or stopping and would size every tile against the old layout.
 */
export function TileStage({
  members,
  bigShare,
  otherShares,
  onShowShare,
  shareLayout,
  tileAspect,
  minTileWidth,
}: {
  members: VoiceParticipant[];
  bigShare: VoiceParticipant | null;
  otherShares: VoiceParticipant[];
  onShowShare: (sessionId: string) => void;
  /**
   * Where the tiles go while a share is up. `strip` is a single row under it, for
   * a wide screen; `below` keeps the grid in the space a 16:9 share leaves, for a
   * tall one.
   */
  shareLayout: "strip" | "below";
  tileAspect: TileAspectRange;
  minTileWidth: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);

  const isStrip = bigShare !== null && shareLayout === "strip";
  const grid =
    stage === null || isStrip
      ? null
      : fitTileGrid({
          count: otherShares.length + members.length,
          width: stage.width - 2 * TILE_BLEED_PX,
          height:
            (bigShare === null
              ? stage.height
              : stage.height - stage.width / SHARE_ASPECT - TILE_GAP_PX) -
            2 * TILE_BLEED_PX,
          aspect: tileAspect,
          minTileWidth,
        });

  const tileClassName = isStrip ? "aspect-video h-full" : undefined;
  const tileStyle =
    grid === null ? undefined : { width: grid.tileWidth, height: grid.tileHeight };

  useTileFlip(
    tilesRef,
    `${isStrip ? "strip" : "grid"}|${bigShare !== null}|${[...otherShares, ...members]
      .map((p) => p.sessionId)
      .join(",")}|${otherShares.length}`,
  );

  return (
    <div ref={stageRef} className="flex h-full min-h-0 w-full flex-col gap-2">
      {bigShare !== null && (
        <StageShare
          sharer={bigShare}
          className={shareLayout === "strip" ? "flex-1" : "aspect-video shrink-0"}
        />
      )}
      <div
        // A wheel without a horizontal axis still has to reach every tile.
        onWheel={
          isStrip
            ? (e) => {
                e.currentTarget.scrollLeft += e.deltaY;
              }
            : undefined
        }
        className={cn(
          "-m-2 flex min-h-0 p-4",
          isStrip
            ? "h-[9.5rem] shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex-1 overflow-y-auto",
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
          {(isStrip || grid !== null) && (
            <>
              {otherShares.map((p) => (
                <SharePreviewTile
                  key={`screen:${p.sessionId}`}
                  sharer={p}
                  onShow={() => onShowShare(p.sessionId)}
                  className={tileClassName}
                  style={tileStyle}
                />
              ))}
              {members.map((p) => (
                <StageTile
                  key={p.sessionId}
                  participant={p}
                  className={tileClassName}
                  style={tileStyle}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

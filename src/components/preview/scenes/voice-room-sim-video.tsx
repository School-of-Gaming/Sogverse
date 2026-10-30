"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PICKS } from "@sog/ui";
import type { VoiceParticipant } from "@/components/voice/hooks/types";
import type { RenderVideo, VideoSource } from "@/components/voice/redesign/VideoSurface";
import { cn } from "@/lib/cn";

const FRAME_MS = 1000 / 12;
const CAMERA_SIZE = { width: 480, height: 360 };
const SCREEN_SIZE = { width: 1280, height: 720 };
const TAU = Math.PI * 2;

type Paint = (ctx: CanvasRenderingContext2D, seconds: number) => void;

interface Feed {
  ctx: CanvasRenderingContext2D;
  paint: Paint;
  stream: MediaStream;
  holders: number;
}

/** The app's own tokens and face, so the fake video sits in the room's colours. */
function readTheme() {
  const style = getComputedStyle(document.documentElement);
  return {
    ground: style.getPropertyValue("--color-card").trim(),
    edge: style.getPropertyValue("--color-border").trim(),
    ink: style.getPropertyValue("--color-foreground").trim(),
    face: getComputedStyle(document.body).fontFamily,
  };
}

/** A stable number for a person, so each keeps their colour and their rhythm. */
function hashOf(text: string) {
  let hash = 0;
  for (const char of text) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash;
}

function paintCamera(participant: VoiceParticipant): Paint {
  const theme = readTheme();
  const hash = hashOf(participant.userId);
  const { hex } = PICKS[hash % PICKS.length];
  const phase = (hash % 628) / 100;
  const initial = participant.userName.slice(0, 1).toUpperCase();
  const { width, height } = CAMERA_SIZE;

  return (ctx, seconds) => {
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, width, height);

    // A slow patch of light moving around the room behind them.
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc(
      width / 2 + Math.cos(seconds / 3 + phase) * 170,
      height / 3 + Math.sin(seconds / 4 + phase) * 70,
      120,
      0,
      TAU,
    );
    ctx.fill();
    ctx.globalAlpha = 1;

    // A head and shoulders that sway the way somebody at a desk does.
    const x = width / 2 + Math.sin(seconds * 0.9 + phase) * 26;
    const y = height * 0.48 + Math.sin(seconds * 1.7 + phase) * 7;
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.ellipse(x, height + 30, 150, 130, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 72, 0, TAU);
    ctx.fill();

    ctx.fillStyle = theme.ground;
    ctx.font = `600 64px ${theme.face}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, x, y + 4);
  };
}

/** A pretend build plan: a wall going up block by block, and a cursor pointing at it. */
function paintScreen(participant: VoiceParticipant): Paint {
  const theme = readTheme();
  const { width, height } = SCREEN_SIZE;
  const block = 56;
  const columns = 14;
  const rows = 7;
  const left = (width - columns * block) / 2;
  const top = 130;

  return (ctx, seconds) => {
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    ctx.fillStyle = theme.ink;
    ctx.font = `600 34px ${theme.face}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${participant.userName}: build plan`, 56, 76);

    const placed = columns * 2 + Math.floor(seconds * 3) % (columns * (rows - 2) + 12);
    for (let index = 0; index < Math.min(placed, columns * rows); index++) {
      const column = index % columns;
      const row = rows - 1 - Math.floor(index / columns);
      ctx.fillStyle = PICKS[(column * 3 + row * 5) % PICKS.length].hex;
      ctx.fillRect(left + column * block + 2, top + row * block + 2, block - 4, block - 4);
    }

    const cursorX = width / 2 + Math.cos(seconds * 0.8) * 420;
    const cursorY = height / 2 + Math.sin(seconds * 1.3) * 190;
    ctx.fillStyle = theme.ink;
    ctx.beginPath();
    ctx.moveTo(cursorX, cursorY);
    ctx.lineTo(cursorX, cursorY + 38);
    ctx.lineTo(cursorX + 11, cursorY + 28);
    ctx.lineTo(cursorX + 27, cursorY + 28);
    ctx.closePath();
    ctx.fill();
  };
}

/**
 * Every fake video in the room, painted from one loop outside React, so moving
 * pictures cost no renders. A feed exists only while something is showing it,
 * and the loop only while a feed exists, so unmounting the room stops the lot.
 */
class FakeVideoFeeds {
  private readonly feeds = new Map<string, Feed>();
  private frame: number | null = null;
  private lastPaint = 0;

  acquire(participant: VoiceParticipant, source: VideoSource): MediaStream {
    const key = `${participant.sessionId}:${source}`;
    const existing = this.feeds.get(key);
    if (existing) {
      existing.holders += 1;
      return existing.stream;
    }
    const { width, height } = source === "camera" ? CAMERA_SIZE : SCREEN_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this browser has no 2d canvas to fake a video with");
    const paint = source === "camera" ? paintCamera(participant) : paintScreen(participant);
    paint(ctx, performance.now() / 1000);
    const feed = { ctx, paint, stream: canvas.captureStream(12), holders: 1 };
    this.feeds.set(key, feed);
    this.frame ??= requestAnimationFrame(this.tick);
    return feed.stream;
  }

  release(participant: VoiceParticipant, source: VideoSource) {
    const key = `${participant.sessionId}:${source}`;
    const feed = this.feeds.get(key);
    if (!feed) return;
    feed.holders -= 1;
    if (feed.holders > 0) return;
    feed.stream.getTracks().forEach((track) => track.stop());
    this.feeds.delete(key);
    if (this.feeds.size === 0 && this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    if (now - this.lastPaint < FRAME_MS) return;
    this.lastPaint = now;
    this.feeds.forEach(({ ctx, paint }) => paint(ctx, now / 1000));
  };
}

function FakeVideo({
  feeds,
  participant,
  source,
}: {
  feeds: FakeVideoFeeds;
  participant: VoiceParticipant;
  source: VideoSource;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.srcObject = feeds.acquire(participant, source);
    return () => {
      videoEl.srcObject = null;
      feeds.release(participant, source);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the participant object changes on every event, and the feed must not restart with it
  }, [feeds, participant.sessionId, source]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full", source === "camera" ? "object-cover" : "object-contain")}
    />
  );
}

/** The room's video seam, drawing moving canvases in place of Daily's tracks. */
export function useFakeVideo(): RenderVideo {
  const [feeds] = useState(() => new FakeVideoFeeds());
  return useCallback(
    (participant, source) => (
      <FakeVideo feeds={feeds} participant={participant} source={source} />
    ),
    [feeds],
  );
}

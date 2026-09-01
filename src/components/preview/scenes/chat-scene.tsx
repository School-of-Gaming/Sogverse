"use client";
/* eslint-disable i18next/no-literal-string -- the control strip below is scene machinery on an admin-only preview page: the account switcher, the latency mode and the activity trigger are developer-facing metadata in the same category as the scene's own registry title, and never ship in any locale. Everything the scene *renders as the product* — the whole chat surface — goes through the `chat` namespace like any other component. */

import { useState } from "react";
import { Play } from "lucide-react";
import { ChatView } from "@/components/chat";
import { CHAT_SCENE_ACCOUNTS } from "@/components/chat/mock-chat-fixtures";
import { FIXTURE_TIMEZONE } from "@/components/family/mock-enrollment-fixtures";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useChatSceneStore,
  type ChatSceneLatency,
} from "./chat-scene-store";

/**
 * The chat surface, whole, over fixtures.
 *
 * **This is where the chat design is signed off, and it is deliberately the
 * only home for it.** A chat is judged by how a run of messages sits against
 * the run above it, at the width the panel actually gets, inside a log that
 * scrolls — none of which a style-guide card can show. So the components have
 * no demo section of their own; the states live side by side here.
 *
 * **One scenario, because the account switcher is what a second one would have
 * been.** Every viewer variant the design has — a child, a locked child, a
 * parent, the Gedu running the session, an admin dropping in — is reachable
 * without leaving the page, so they compare themselves rather than being
 * compared from memory. That is also what makes the capability derivation
 * worth exercising here: it is the production module, and switching account
 * re-runs it for real.
 *
 * **Nothing is faked to make a section easy.** Every backend-touching action —
 * send, edit, delete, remove, lock, react — runs against the store beside this
 * file and renders its real states, including the optimistic echo's pending and
 * failed bubbles, which the latency control exists to make visible.
 */
export function ChatScene() {
  // One instant, frozen at mount: the seeded conversation is anchored to it, so
  // a ticking clock would walk the whole log's timestamps under whoever is
  // reading them.
  const [now] = useState(() => new Date());
  const store = useChatSceneStore(now);
  const [width, setWidth] = useState<PanelWidth>(PANEL_WIDTHS[2]);
  const [height, setHeight] = useState<LogHeight>(LOG_HEIGHTS[2]);

  const viewer =
    CHAT_SCENE_ACCOUNTS.find((account) => account.id === store.viewerId) ??
    CHAT_SCENE_ACCOUNTS[0];

  return (
    <div className="space-y-4">
      <SceneControls
        store={store}
        width={width}
        setWidth={setWidth}
        height={height}
        setHeight={setHeight}
      />

      {/* The chat panel in a card, at whichever of the reuse geometries the
          controls have picked — full width is what the voice room hands it. */}
      <div className={width.className}>
        <Card>
          <CardContent className="pt-6">
            <ChatView
              // Switching "Acting as" is a change of person, not a handoff: the
              // half-written draft, the staged pictures and the reply target
              // belonged to whoever was typing, so the next viewer starts clean.
              key={viewer.id}
              messages={store.messages}
              accounts={CHAT_SCENE_ACCOUNTS}
              viewer={viewer}
              lockedAccountIds={store.lockedIds}
              typingAccountIds={store.typingIds}
              logHeightClassName={height.className}
              timeZone={FIXTURE_TIMEZONE}
              handlers={{
                onSend: store.send,
                onToggleReaction: store.toggleReaction,
                onEdit: store.edit,
                onDelete: store.remove,
                onHide: store.remove,
                onRestore: store.restore,
                onSetLock: store.setLock,
                onRetry: store.retry,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const LATENCY_MODES: readonly { value: ChatSceneLatency; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "slow", label: "Slow — pending bubble" },
  { value: "failing", label: "First try fails — retry" },
];

/**
 * The geometries the surface has to look good at — the whole point of the
 * height being a prop. The chat is meant to be reused (a voice-room panel
 * today, other embeddings later), so the scene lets the design be judged at
 * each shape rather than only at the one the card happens to give.
 */
const PANEL_WIDTHS = [
  { value: "phone", label: "Phone (360px)", className: "max-w-[360px]" },
  { value: "narrow", label: "Narrow (480px)", className: "max-w-[480px]" },
  { value: "full", label: "Full width", className: "" },
] as const;

const LOG_HEIGHTS = [
  { value: "short", label: "Short", className: "h-56 sm:h-64" },
  { value: "default", label: "Default", className: "h-80 sm:h-96" },
  { value: "tall", label: "Tall", className: "h-96 sm:h-[32rem]" },
] as const;

type PanelWidth = (typeof PANEL_WIDTHS)[number];
type LogHeight = (typeof LOG_HEIGHTS)[number];

/**
 * The simulation controls.
 *
 * Visibly not part of the product: a dashed, muted strip above the card, so
 * nobody reviewing the design mistakes it for something a family would see.
 */
function SceneControls({
  store,
  width,
  setWidth,
  height,
  setHeight,
}: {
  store: ReturnType<typeof useChatSceneStore>;
  width: PanelWidth;
  setWidth: (width: PanelWidth) => void;
  height: LogHeight;
  setHeight: (height: LogHeight) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm">
      <ControlRow label="Acting as">
        {CHAT_SCENE_ACCOUNTS.map((account) => (
          <Button
            key={account.id}
            type="button"
            size="sm"
            variant={store.viewerId === account.id ? "default" : "outline"}
            onClick={() => store.setViewerId(account.id)}
          >
            {account.name}
            <span
              className={cn(
                "ml-1 text-[10px] uppercase tracking-wide",
                store.viewerId === account.id
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              {account.role}
            </span>
            {store.lockedIds.has(account.id) && (
              <span className="ml-1 text-[10px] uppercase tracking-wide text-destructive">
                locked
              </span>
            )}
          </Button>
        ))}
      </ControlRow>

      <ControlRow label="Send latency">
        {LATENCY_MODES.map((mode) => (
          <Button
            key={mode.value}
            type="button"
            size="sm"
            variant={store.latency === mode.value ? "default" : "outline"}
            onClick={() => store.setLatency(mode.value)}
          >
            {mode.label}
          </Button>
        ))}
      </ControlRow>

      <ControlRow label="Incoming activity">
        <Button type="button" size="sm" variant="outline" onClick={store.sendScripted}>
          <Play className="h-3.5 w-3.5" aria-hidden />
          Send one
        </Button>
        <Button
          type="button"
          size="sm"
          variant={store.auto ? "default" : "outline"}
          onClick={() => store.setAuto(!store.auto)}
        >
          Every 5 seconds
        </Button>
      </ControlRow>

      <ControlRow label="Panel width">
        {PANEL_WIDTHS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={width.value === option.value ? "default" : "outline"}
            onClick={() => setWidth(option)}
          >
            {option.label}
          </Button>
        ))}
      </ControlRow>

      <ControlRow label="Log height">
        {LOG_HEIGHTS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={height.value === option.value ? "default" : "outline"}
            onClick={() => setHeight(option)}
          >
            {option.label}
          </Button>
        ))}
      </ControlRow>
    </div>
  );
}

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

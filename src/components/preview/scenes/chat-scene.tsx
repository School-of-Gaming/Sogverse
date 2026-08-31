"use client";
/* eslint-disable i18next/no-literal-string -- the control strip below is scene machinery on an admin-only preview page: the account switcher, the latency mode and the activity trigger are developer-facing metadata in the same category as the scene's own registry title, and never ship in any locale. Everything the scene *renders as the product* — the whole chat surface — goes through the `chat` namespace like any other component. */

import { useState } from "react";
import { Play } from "lucide-react";
import { ChatView } from "@/components/chat";
import {
  CHAT_SCENE_ACCOUNTS,
  type ChatSceneScenario,
} from "@/components/chat/mock-chat-fixtures";
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
export function ChatScene({
  scenario: _scenario,
}: {
  scenario: ChatSceneScenario;
}) {
  // One instant, frozen at mount: the seeded conversation is anchored to it, so
  // a ticking clock would walk the whole log's timestamps under whoever is
  // reading them.
  const [now] = useState(() => new Date());
  const store = useChatSceneStore(now);

  const viewer =
    CHAT_SCENE_ACCOUNTS.find((account) => account.id === store.viewerId) ??
    CHAT_SCENE_ACCOUNTS[0];

  return (
    <div className="space-y-4">
      <SceneControls store={store} />

      {/* The room's own chat panel, unchanged: a card with the surface inside
          it, at whatever width the dashboard container gives — which is the
          geometry the voice room will hand it. */}
      <Card>
        <CardContent className="pt-6">
          <ChatView
            messages={store.messages}
            accounts={CHAT_SCENE_ACCOUNTS}
            viewer={viewer}
            lockedAccountIds={store.lockedIds}
            typingAccountIds={store.typingIds}
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
  );
}

const LATENCY_MODES: readonly { value: ChatSceneLatency; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "slow", label: "Slow — pending bubble" },
  { value: "failing", label: "First try fails — retry" },
];

/**
 * The simulation controls.
 *
 * Visibly not part of the product: a dashed, muted strip above the card, so
 * nobody reviewing the design mistakes it for something a family would see.
 */
function SceneControls({
  store,
}: {
  store: ReturnType<typeof useChatSceneStore>;
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

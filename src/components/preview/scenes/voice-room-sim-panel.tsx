"use client";
/* eslint-disable i18next/no-literal-string -- this panel is scene machinery on an admin-only preview page, developer-facing like the scene's own registry title, and never ships in any locale. */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ROOM_SIZES, type RoomSimulation, type SimulationState } from "./voice-room-simulation";

/**
 * The developer's handle on the pretend call: not part of the room, so it wears
 * a dashed edge and stays folded until asked for. It sits in the stage's bottom
 * corner, which on a wide screen means inside the right panel's width (`w-80`,
 * `xl:w-96`), and just above the bar on a phone, below the sheets so they still
 * cover it.
 */
export function VoiceRoomSimPanel({
  simulation,
  state,
  readerModerates,
}: {
  simulation: RoomSimulation;
  state: SimulationState;
  readerModerates: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sharers = state.participants.filter((p) => p.screenShareOn);
  const reader = state.participants.find((p) => p.isLocal);
  const readerShareLocked = reader !== undefined && state.shareLocks.has(reader.sessionId);

  return (
    <div
      className={cn(
        "glass fixed bottom-[5.25rem] right-1 z-40 flex flex-col gap-2 rounded-md border border-dashed border-border p-1.5 text-xs lg:bottom-3 lg:right-[20.75rem] xl:right-[24.75rem]",
        open && "w-44",
      )}
    >
      {open && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => simulation.setPaused(!state.paused)}
          >
            {state.paused ? "Resume simulation" : "Pause simulation"}
          </Button>
          <p className="text-muted-foreground">People in your zone</p>
          <div className="grid grid-cols-5 gap-1">
            {ROOM_SIZES.map((size) => (
              <Button
                key={size}
                variant={state.roomSize === size ? "default" : "outline"}
                size="sm"
                className="px-0"
                aria-pressed={state.roomSize === size}
                onClick={() => simulation.setRoomSize(size)}
              >
                {size}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground">Make it happen</p>
          <Button
            variant={state.presenting ? "default" : "outline"}
            size="sm"
            aria-pressed={state.presenting}
            onClick={() => simulation.setPresenting(!state.presenting)}
          >
            Moderator presents
          </Button>
          {state.presenting && (
            <Button variant="outline" size="sm" onClick={() => simulation.moderatorShares()}>
              Moderator shares
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => simulation.startShare()}>
            Add a share
          </Button>
          {sharers.length > 0 && (
            <div className="flex max-h-28 flex-col gap-1.5 overflow-y-auto">
              {sharers.map((p) => (
                <Button
                  key={p.sessionId}
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => simulation.stopShare(p.sessionId)}
                >
                  Stop {p.userName}&apos;s share
                </Button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => simulation.someoneJoins()}>
            Someone joins
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => simulation.moderatorMovesReader()}
          >
            Moderator moves you
          </Button>
          {!readerModerates && reader !== undefined && (
            <>
              <Button
                variant={state.readerCanShare ? "default" : "outline"}
                size="sm"
                aria-pressed={state.readerCanShare}
                onClick={() => simulation.setReaderCanShare(!state.readerCanShare)}
              >
                You can share
              </Button>
              <Button
                variant={readerShareLocked ? "default" : "outline"}
                size="sm"
                aria-pressed={readerShareLocked}
                onClick={() => simulation.lockShare(reader.sessionId, !readerShareLocked)}
              >
                Your share locked
              </Button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        aria-expanded={open}
        className="flex items-center justify-between gap-1 rounded px-1 text-muted-foreground hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
      >
        Simulation{state.paused ? " (paused)" : ""}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

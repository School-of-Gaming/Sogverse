"use client";
/* eslint-disable i18next/no-literal-string -- this panel is scene machinery on an admin-only preview page, developer-facing like the scene's own registry title, and never ships in any locale. */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ROOM_SIZES, type RoomSimulation, type SimulationState } from "./voice-room-simulation";

/**
 * The developer's handle on the pretend call: not part of the room, so it wears
 * a dashed edge and stays folded until asked for. It sits in the dock's empty
 * corner on a wide screen and just above the bar on a phone, below the sheets so
 * they still cover it.
 */
export function VoiceRoomSimPanel({
  simulation,
  state,
}: {
  simulation: RoomSimulation;
  state: SimulationState;
}) {
  const [open, setOpen] = useState(false);
  const sharing = state.sharerSessionId !== null;

  return (
    <div
      className={cn(
        "glass fixed bottom-[5.25rem] right-1 z-40 flex flex-col gap-2 rounded-md border border-dashed border-border p-1.5 text-xs lg:bottom-2 lg:left-2 lg:right-auto",
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
          <div className="grid grid-cols-4 gap-1">
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
            variant="outline"
            size="sm"
            onClick={() => (sharing ? simulation.stopShare() : simulation.startShare())}
          >
            {sharing ? "Stop the share" : "Start a share"}
          </Button>
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

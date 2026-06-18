-- Private-zone voice refactor: one Daily room + SFU-enforced `canReceive`.
--
-- The "locked zone = separate Daily room" model is gone. Everyone shares a
-- single Daily room again; privacy is enforced by Daily's server-side
-- `canReceive` permission — outsiders are simply not *sent* a private-zone
-- member's audio/video at the SFU (a structural guarantee, not a client-side
-- `volume = 0`). The reverse direction stays permissive: a private-zone member
-- still receives every other zone's tracks (the existing per-zone volume
-- routing silences the audio client-side) so they keep video + speaking-glow
-- awareness of the room. See src/components/voice/CLAUDE.md.
--
-- With one room, Daily owns presence/names again, so the DB stops
-- reconstructing them (the `gamer_name` snapshot and the blurred-roster-from-DB
-- are gone). The DB now holds exactly ONE thing: the server-readable,
-- moderator-authored record of *who is currently in a private zone this session
-- window* — the hard privacy boundary that the token endpoint bakes into each
-- joiner's `canReceive` (airtight for someone who joins mid-session) and the
-- live projection re-applies to those already connected.
--
-- That generalizes the old `voice_locked_placements` (gamer-only confinement)
-- into private-zone *occupancy*, covering two write-paths that are both just "a
-- voice-group moderator writes a row":
--   * a confined gamer  — written by a moderator (a gamer can't self-write, so
--                          confinement holds);
--   * a moderator       — writes their *own* occupancy row on enter, deletes it
--                          on leave (so their voice is private too).
--
-- Schema delta vs. voice_locked_placements: gamer_id → user_id, drop gamer_name.
-- The table is ephemeral session state, so we recreate rather than alter.

drop table if exists public.voice_locked_placements;

create table public.voice_private_zone_occupants (
  id               uuid primary key default gen_random_uuid(),
  zone_id          uuid not null references public.voice_zones(id) on delete cascade,
  user_id          uuid not null references public.profiles(id),
  group_id         uuid not null references public.product_groups(id) on delete cascade,
  placed_by        uuid not null references public.profiles(id),
  session_opens_at timestamptz not null,
  created_at       timestamptz not null default now(),
  -- A user occupies at most one private zone per group at a time. This is also
  -- what makes the self-healing prune-on-join load-bearing: a stale row from a
  -- user who never left would otherwise collide here and break a future join's
  -- re-occupy. The main token endpoint reaps prior-window rows on every join.
  unique (group_id, user_id)
);

create index voice_private_zone_occupants_group_id_idx on public.voice_private_zone_occupants (group_id);
create index voice_private_zone_occupants_zone_id_idx  on public.voice_private_zone_occupants (zone_id);

alter table public.voice_private_zone_occupants enable row level security;

-- Group members read the occupancy list: it drives the `canReceive` projection
-- on every client and renders who is in each private zone.
create policy voice_private_zone_occupants_select on public.voice_private_zone_occupants
  for select
  to authenticated
  using (public.is_voice_group_member(group_id));

-- Moderators only. Authorizes actor + target (per the IDOR rule): caller is a
-- mod for group_id, pins placed_by to the caller, and verifies the referenced
-- zone is a locked zone of this same group. Covers both write-paths — a mod
-- placing a gamer (user_id = the gamer) and a mod recording their own entry
-- (user_id = self). A gamer is never a moderator, so a gamer can neither
-- self-occupy a private zone nor free themselves from one.
create policy voice_private_zone_occupants_insert on public.voice_private_zone_occupants
  for insert
  to authenticated
  with check (
    public.is_voice_group_moderator(group_id)
    and placed_by = (select auth.uid())
    and exists (
      select 1
      from public.voice_zones z
      where z.id = zone_id
        and z.group_id = voice_private_zone_occupants.group_id
        and z.is_locked = true
    )
  );

-- No UPDATE policy: occupancy is insert/delete only (re-occupying is
-- delete-then-insert, so the unique constraint never blocks a DO UPDATE that
-- RLS would deny anyway).
create policy voice_private_zone_occupants_delete on public.voice_private_zone_occupants
  for delete
  to authenticated
  using (public.is_voice_group_moderator(group_id));

-- Realtime — every client keeps its occupancy mirror current to recompute the
-- `canReceive` projection. REPLICA IDENTITY FULL so a group_id-filtered DELETE
-- payload carries the full old row (a delete otherwise ships only
-- replica-identity columns, and the filter would never match).
alter table public.voice_private_zone_occupants replica identity full;
alter publication supabase_realtime add table public.voice_private_zone_occupants;

-- Grants — new tables have no Data API access by default, not even for
-- service_role (root CLAUDE.md). Browser writes go through RLS as authenticated;
-- the token endpoint prunes prior-window rows via the admin client (service_role
-- bypasses RLS, but PostgREST still checks the grant).
grant select, insert, delete on public.voice_private_zone_occupants to authenticated;
grant select, insert, delete on public.voice_private_zone_occupants to service_role;

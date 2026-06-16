-- Voice rooms refactor: discrete zones replace the spatial canvas.
--
-- Adds the only *persisted* part of the new zone model (see
-- docs/voice-rooms-refactor-plan.md §3, §7). Lobby + the 4 Yty zones stay
-- virtual/hardcoded on the client; only mod-created custom zones (and their
-- locked variant) live in the DB, tied to a product_group so the next session
-- of the same group inherits them.
--
--   voice_zones             — mod-created custom/locked zones for a group.
--   voice_locked_placements — who a moderator has placed into a locked zone;
--                             the security source of truth for "is this gamer
--                             confined to the private room this session".

-- ---------------------------------------------------------------------------
-- Enums backing the 8-icon / 8-color palette (§8). Keep the values identical
-- to the client constant map keys (src/lib/constants/voice-zones.ts) so the
-- picker, card renderer, and DB row round-trip cleanly. Using enums lets the
-- zod contracts derive their values from the generated `Constants` object.
-- ---------------------------------------------------------------------------
create type public.voice_zone_icon  as enum ('star','rocket','gamepad','crown','trophy','flame','ghost','music');
create type public.voice_zone_color as enum ('red','orange','green','teal','sky','indigo','violet','pink');

-- ---------------------------------------------------------------------------
-- RLS helper functions — mirror the POST /api/voice/token membership/role
-- predicate so DB-level access matches who can actually join the room.
-- SECURITY DEFINER (bypasses RLS on the joined tables, like is_admin /
-- can_read_product) with an explicit search_path, per the access-control test.
-- ---------------------------------------------------------------------------

-- True when the caller may *see* the group's voice room: an active-participation
-- gamer, a gedu assigned to the owning product (cross-group mobility, checked on
-- product_id not group_id — same as the token endpoint), or an admin.
create or replace function public.is_voice_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.participations p
      where p.group_id = p_group_id
        and p.gamer_id = (select auth.uid())
        and p.status = 'active'
    )
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    );
$$;

-- True when the caller is a *moderator* of the group's voice room: an admin, or
-- a gedu assigned to the owning product. This is the write predicate for zones
-- and locked placements — gamers never qualify, which is what enforces "only a
-- mod creates zones / moves someone into a locked zone".
create or replace function public.is_voice_group_moderator(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.product_groups g
      join public.gedu_group_assignments a on a.product_id = g.product_id
      where g.id = p_group_id
        and a.gedu_id = (select auth.uid())
    );
$$;

-- ---------------------------------------------------------------------------
-- voice_zones
-- ---------------------------------------------------------------------------
create table public.voice_zones (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.product_groups(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  icon        public.voice_zone_icon  not null,
  color       public.voice_zone_color not null,
  is_locked   boolean not null default false,
  sort_order  int not null default 0,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index voice_zones_group_id_idx on public.voice_zones (group_id);

create trigger voice_zones_updated_at
  before update on public.voice_zones
  for each row execute function public.update_updated_at_column();

alter table public.voice_zones enable row level security;

-- Anyone who can join the group's room may read its zone list.
create policy voice_zones_select on public.voice_zones
  for select
  to authenticated
  using (public.is_voice_group_member(group_id));

-- Mods only. WITH CHECK authorizes both actor (is mod for this group) and
-- target (the group_id the row is tied to) per the IDOR rule, and pins
-- created_by to the caller so it can't be spoofed.
create policy voice_zones_insert on public.voice_zones
  for insert
  to authenticated
  with check (
    public.is_voice_group_moderator(group_id)
    and created_by = (select auth.uid())
  );

create policy voice_zones_update on public.voice_zones
  for update
  to authenticated
  using (public.is_voice_group_moderator(group_id))
  with check (public.is_voice_group_moderator(group_id));

create policy voice_zones_delete on public.voice_zones
  for delete
  to authenticated
  using (public.is_voice_group_moderator(group_id));

-- ---------------------------------------------------------------------------
-- voice_locked_placements
-- ---------------------------------------------------------------------------
create table public.voice_locked_placements (
  id               uuid primary key default gen_random_uuid(),
  zone_id          uuid not null references public.voice_zones(id) on delete cascade,
  gamer_id         uuid not null references public.profiles(id),
  group_id         uuid not null references public.product_groups(id) on delete cascade,
  placed_by        uuid not null references public.profiles(id),
  session_opens_at timestamptz not null,
  created_at       timestamptz not null default now(),
  -- A gamer is in at most one locked zone per group at a time.
  unique (group_id, gamer_id)
);

create index voice_locked_placements_group_id_idx on public.voice_locked_placements (group_id);
create index voice_locked_placements_zone_id_idx  on public.voice_locked_placements (zone_id);

alter table public.voice_locked_placements enable row level security;

-- Group members can read the roster so outsiders can render the blurred
-- privacy-screen card (the real privacy is the separate Daily room).
create policy voice_locked_placements_select on public.voice_locked_placements
  for select
  to authenticated
  using (public.is_voice_group_member(group_id));

-- Mods only. Authorizes actor + target: caller is a mod for group_id, pins
-- placed_by to the caller, and verifies the referenced zone is actually a
-- locked zone belonging to this same group (prevents placing into a foreign or
-- non-locked zone). A gamer can never write here.
create policy voice_locked_placements_insert on public.voice_locked_placements
  for insert
  to authenticated
  with check (
    public.is_voice_group_moderator(group_id)
    and placed_by = (select auth.uid())
    and exists (
      select 1
      from public.voice_zones z
      where z.id = zone_id
        and z.group_id = voice_locked_placements.group_id
        and z.is_locked = true
    )
  );

-- No UPDATE policy: placements are insert/delete only.
create policy voice_locked_placements_delete on public.voice_locked_placements
  for delete
  to authenticated
  using (public.is_voice_group_moderator(group_id));

-- ---------------------------------------------------------------------------
-- Realtime — mid-session zone CRUD and locked placements propagate to peers
-- via Supabase Realtime (§5, §6). REPLICA IDENTITY FULL so DELETE events carry
-- the full old row: subscriptions are filtered by group_id, and a delete
-- payload only includes replica-identity columns, so without this a
-- group_id-filtered client would never receive zone/placement deletions.
-- ---------------------------------------------------------------------------
alter table public.voice_zones             replica identity full;
alter table public.voice_locked_placements replica identity full;

alter publication supabase_realtime add table public.voice_zones;
alter publication supabase_realtime add table public.voice_locked_placements;

-- ---------------------------------------------------------------------------
-- Grants — new objects have no Data API access by default (root CLAUDE.md).
-- Both tables are browser-called under RLS. The helper functions are evaluated
-- in the caller's context by the policies above, so authenticated needs
-- EXECUTE (same rationale as can_read_product). Added to the access-control
-- allowlists in tests/db/access-control.test.ts.
--
-- NOTE: 00104 follows up with the service_role table grants and a REVOKE of the
-- default PUBLIC execute on the helpers (CREATE FUNCTION grants EXECUTE to
-- PUBLIC, which leaks to anon). Both are folded in there because this migration
-- was already applied to staging when the gap was caught — same append-only
-- repair pattern as 00095–00099.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.voice_zones to authenticated;
grant select, insert, delete on public.voice_locked_placements to authenticated;

grant execute on function public.is_voice_group_member(uuid) to authenticated;
grant execute on function public.is_voice_group_moderator(uuid) to authenticated;

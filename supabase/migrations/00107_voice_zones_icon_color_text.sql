-- Move voice_zones.icon and .color off Postgres enums onto plain text, so the
-- app's VOICE_ZONE_ICONS / VOICE_ZONE_COLORS maps become the single source of
-- truth for the valid set. Adding, removing, or renaming an icon/color is then
-- a pure code change — no migration.
--
-- Why: Postgres can ADD enum values but cannot DROP one without recreating the
-- whole type (and remapping every dependent column). That friction is exactly
-- what bit us when trimming the icon set, so we remove it permanently. Writes
-- stay moderator-only (RLS), the client only ever sends a key from the picker,
-- and the renderer falls back to a default glyph for any unknown key — so the
-- enum was belt-and-suspenders, not a real boundary.

alter table public.voice_zones
  alter column icon type text using icon::text;

alter table public.voice_zones
  alter column color type text using color::text;

-- Icons retired alongside this change (star, crown, trophy, music) → remap any
-- existing rows to a kept icon so they render a real glyph. (Unknown keys also
-- fall back client-side; this just keeps the stored data clean.)
update public.voice_zones
  set icon = 'gamepad'
  where icon in ('star', 'crown', 'trophy', 'music');

drop type public.voice_zone_icon;
drop type public.voice_zone_color;

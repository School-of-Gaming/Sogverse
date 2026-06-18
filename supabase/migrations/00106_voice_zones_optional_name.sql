-- Voice zones: make the name optional.
--
-- A moderator can now create a zone identified by just its icon + color, leaving
-- the name blank. We model "blank" as SQL NULL (not an empty string) so the
-- length invariant for a *present* name stays meaningful, and we relax the
-- existing 1..40 CHECK to allow NULL.

alter table public.voice_zones
  alter column name drop not null;

alter table public.voice_zones
  drop constraint voice_zones_name_check;

alter table public.voice_zones
  add constraint voice_zones_name_check
  check (name is null or char_length(name) between 1 and 40);

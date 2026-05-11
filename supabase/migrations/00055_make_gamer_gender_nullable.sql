-- Make gamer_profiles.gender nullable.
--
-- v1 of the Add Gamer flow lets parents skip gender at creation time
-- (the field is rendered without an "optional" hint, and parents who
-- don't pick simply submit nothing). The /api/gamers/create route now
-- passes null when the field is missing.

ALTER TABLE gamer_profiles ALTER COLUMN gender DROP NOT NULL;

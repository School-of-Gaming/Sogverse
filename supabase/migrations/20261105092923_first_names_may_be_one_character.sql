-- A first name may be a single character.
--
-- The floor was two characters, a rule carried over from voice-room nicknames
-- and never chosen for real names. It refused people who go by an initial and
-- one-character names such as many Chinese, Japanese and Korean ones. The floor
-- is now one character, for parents, gedus and gamers alike, who all keep their
-- name in this column. The ceiling of 32 and the whitespace rule stand.
--
-- At a floor of one, a name that is not empty and neither begins nor ends with
-- whitespace already holds a character that is not whitespace, so the CHECK no
-- longer states that separately. What it admits is unchanged apart from the
-- floor: never empty, never blank, never padded.
--
-- Loosening a CHECK touches no row.

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_first_name_shape,
  ADD CONSTRAINT profiles_first_name_shape
    CHECK (char_length(first_name) BETWEEN 1 AND 32
           AND first_name !~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$');

COMMENT ON CONSTRAINT profiles_first_name_shape ON public.profiles IS 'A first name is 1 to 32 characters long and neither begins nor ends with whitespace — any character of the [[:space:]] class, or U+00A0, U+200B or U+FEFF — so it always holds at least one character that is none of those. Held here rather than only in the forms because a person may update their own first_name straight through the Data API. Every reader may therefore use it as it is: it is never empty, never blank and never padded.';

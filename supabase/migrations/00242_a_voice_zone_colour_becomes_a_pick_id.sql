-- Re-key voice_zones.color from hue words onto pick ids.
--
-- The sixteen colours a moderator picks from are no longer a voice-zone palette
-- named by hue: they are the colours a person may choose for their own thing,
-- numbered rather than named, because a pick carries no meaning beyond whose it
-- is. The app now spells a stored colour as the pick's id ('1' … '16'), in the
-- order the picker has always drawn them, so every existing row is remapped
-- here to the id of the colour it already had. No hue changes: pick 1 is the
-- red these rows were storing as 'red'.
--
-- The column stays `text` and stays free of a CHECK, exactly as it has been
-- since 00107: the valid set is presentational and mod-gated, so adding,
-- removing or renaming an entry must remain a pure code change. The renderer
-- resolves an unknown key to a default, so a row this statement somehow misses
-- still renders a colour rather than nothing.
--
-- No type, grant or policy changes, so nothing to regenerate.

update public.voice_zones
  set color = case color
    when 'red' then '1'
    when 'orange' then '2'
    when 'amber' then '3'
    when 'yellow' then '4'
    when 'lime' then '5'
    when 'green' then '6'
    when 'emerald' then '7'
    when 'teal' then '8'
    when 'cyan' then '9'
    when 'sky' then '10'
    when 'blue' then '11'
    when 'indigo' then '12'
    when 'violet' then '13'
    when 'purple' then '14'
    when 'fuchsia' then '15'
    when 'pink' then '16'
    else color
  end;

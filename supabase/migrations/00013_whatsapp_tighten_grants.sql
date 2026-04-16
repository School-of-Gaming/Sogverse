-- Tighten grants on whatsapp tables: revoke excess privileges,
-- keep only what RLS policies allow.

revoke all on whatsapp_contacts from authenticated;
revoke all on whatsapp_messages from authenticated;

grant select, insert, update on whatsapp_contacts to authenticated;
grant select, insert on whatsapp_messages to authenticated;

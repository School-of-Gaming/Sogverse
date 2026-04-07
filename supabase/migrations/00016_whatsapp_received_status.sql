-- Add 'received' status for inbound messages so the status column
-- is semantically correct for both directions.

alter table whatsapp_messages
  drop constraint whatsapp_messages_status_check;

alter table whatsapp_messages
  add constraint whatsapp_messages_status_check
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received'));

-- Backfill any existing inbound messages
update whatsapp_messages set status = 'received' where direction = 'inbound';

-- Remove the default — status must always be set explicitly
-- (outbound = 'pending', inbound = 'received')
alter table whatsapp_messages alter column status drop default;

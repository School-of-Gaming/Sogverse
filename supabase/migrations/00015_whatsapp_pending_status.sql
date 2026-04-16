-- Add 'pending' status for outbound messages waiting for Meta confirmation.
-- The send route now inserts with status='pending'; webhooks promote to
-- sent/delivered/read or failed.

alter table whatsapp_messages
  drop constraint whatsapp_messages_status_check;

alter table whatsapp_messages
  add constraint whatsapp_messages_status_check
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed'));

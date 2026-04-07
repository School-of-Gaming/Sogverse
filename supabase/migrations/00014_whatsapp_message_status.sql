-- Add status column to track delivery state from Meta status webhooks.
-- Meta returns 200 for all sends, then reports actual delivery status
-- asynchronously via webhook (sent → delivered → read, or failed).

alter table whatsapp_messages
  add column status text not null default 'sent'
    check (status in ('sent', 'delivered', 'read', 'failed')),
  add column status_error text;  -- error description when status = 'failed'

-- Migration 00013 revoked all then granted only SELECT + INSERT.
-- UPDATE is needed now for webhook status updates on existing messages.
grant update on whatsapp_messages to authenticated;

-- RLS: allow admins to read the updated status (already covered by SELECT policy).
-- Webhook writes use service role so no INSERT/UPDATE RLS needed for status updates.

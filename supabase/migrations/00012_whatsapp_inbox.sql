-- WhatsApp inbox: contacts and messages for Cloud API integration

-- Contacts: people who have messaged or been messaged
create table whatsapp_contacts (
  phone text primary key,              -- E.164 digits, e.g. '358401234567'
  wa_name text,                        -- WhatsApp profile name (from webhook)
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table whatsapp_contacts enable row level security;

-- Messages: inbound and outbound
create table whatsapp_messages (
  id text primary key,                 -- Meta message ID (wamid.xxx) or UUID for outbound
  phone text not null references whatsapp_contacts(phone),
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  message_type text not null default 'text',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

alter table whatsapp_messages enable row level security;

-- Indexes
create index idx_whatsapp_messages_conversation on whatsapp_messages(phone, created_at desc);
create index idx_whatsapp_contacts_last_message on whatsapp_contacts(last_message_at desc);

-- RLS: admin-only read access (webhook uses service role to write)
create policy "Admins can read whatsapp_contacts"
  on whatsapp_contacts for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can read whatsapp_messages"
  on whatsapp_messages for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Admins can insert outbound messages (for replies from the inbox)
create policy "Admins can insert whatsapp_messages"
  on whatsapp_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
    and direction = 'outbound'
  );

-- Admins can upsert contacts (for outbound message contact creation)
create policy "Admins can insert whatsapp_contacts"
  on whatsapp_contacts for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update whatsapp_contacts"
  on whatsapp_contacts for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Enable Supabase Realtime for live message updates
alter publication supabase_realtime add table whatsapp_messages;
alter publication supabase_realtime add table whatsapp_contacts;


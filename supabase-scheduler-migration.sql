-- Run this in Supabase SQL Editor

-- Standalone scheduled events table
create table if not exists scheduled_events (
  id uuid default gen_random_uuid() primary key,
  client_name text not null,
  client_email text not null,
  client_phone text default '',
  scheduled_at timestamptz not null,
  duration_mins integer default 60,
  service_call jsonb,        -- { amount: 75.00, description: "Service Call" }
  notes text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  gcal_event_id text,
  linked_invoice_id uuid,
  linked_estimate_id uuid,
  created_at timestamptz default now()
);

-- Per-day work hours and blocked days on business_profile
alter table business_profile
  add column if not exists work_hours_per_day jsonb,
  add column if not exists blocked_days jsonb default '[0,6]'::jsonb;

-- Default per-day hours: Mon–Fri 8am–5pm, Sat/Sun blocked
update business_profile
set work_hours_per_day = '{
  "0": null,
  "1": {"start": 8, "end": 17},
  "2": {"start": 8, "end": 17},
  "3": {"start": 8, "end": 17},
  "4": {"start": 8, "end": 17},
  "5": {"start": 8, "end": 17},
  "6": null
}'::jsonb
where id = 1 and work_hours_per_day is null;

-- SMS templates (customizable per message type)
alter table business_profile
  add column if not exists sms_templates jsonb default '{}'::jsonb;

-- Reminder settings (which channels to use for 24h/48h reminders)
alter table business_profile
  add column if not exists reminder_settings jsonb default '{}'::jsonb;

-- Reminder sent tracking on events (prevents duplicate sends)
alter table scheduled_events
  add column if not exists reminder_24_sent boolean default false;
alter table scheduled_events
  add column if not exists reminder_48_sent boolean default false;

-- Multi-client invoices: array of {name, email, passcode} objects
alter table invoices
  add column if not exists co_clients jsonb default '[]'::jsonb;

-- Run this in Supabase: Dashboard → SQL Editor → New query → paste & run

-- Google Calendar fields on estimates
alter table estimates
  add column if not exists scheduling_mode text check (scheduling_mode in ('manager', 'client')),
  add column if not exists scheduled_at timestamptz,
  add column if not exists scheduled_duration integer default 60,
  add column if not exists gcal_event_id text;

-- Google Calendar fields on invoices
alter table invoices
  add column if not exists scheduled_at timestamptz,
  add column if not exists scheduled_duration integer default 60,
  add column if not exists gcal_event_id text;

-- Google Calendar + work hours on business_profile
alter table business_profile
  add column if not exists gcal_refresh_token text,
  add column if not exists gcal_calendar_id text default 'primary',
  add column if not exists work_hours_start integer default 8,
  add column if not exists work_hours_end integer default 18;

-- Run this in Supabase SQL Editor (separate from supabase-schema.sql)

-- Add passcode column to invoices
alter table invoices add column if not exists passcode text unique;

-- Business profile (always one row)
create table if not exists business_profile (
  id integer primary key default 1,
  name text default 'My Business',
  tagline text default '',
  email text default '',
  phone text default '',
  address text default '',
  city text default '',
  state text default '',
  zip text default ''
);
insert into business_profile (id) values (1) on conflict (id) do nothing;

-- Saved clients
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  phone text default '',
  company text default '',
  address text default '',
  notes text default '',
  created_at timestamptz default now()
);

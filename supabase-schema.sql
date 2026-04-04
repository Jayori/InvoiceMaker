-- Run this in Supabase: Dashboard → SQL Editor → New query → paste & run

create table invoices (
  id uuid default gen_random_uuid() primary key,
  invoice_number text unique not null,
  client_name text not null,
  client_email text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  square_payment_link text,
  square_order_id text,
  square_payment_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Optional: enable Row Level Security (recommended for production)
-- alter table invoices enable row level security;

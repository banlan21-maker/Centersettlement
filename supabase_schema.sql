-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Teachers Table
create table teachers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  commission_rate numeric default 0.0,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Vouchers Table
create table vouchers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  support_amount integer default 0,
  client_copay integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Clients Table
create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  birth_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sessions (Class Records) Table
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  teacher_id uuid references teachers(id) on delete set null,
  client_id uuid references clients(id) on delete cascade,
  duration_minutes integer not null,
  total_fee integer default 0,
  total_support integer default 0,
  final_client_cost integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Session Vouchers Junction Table
create table session_vouchers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  voucher_id uuid references vouchers(id) on delete cascade
);

-- RLS Policies
alter table teachers enable row level security;
alter table vouchers enable row level security;
alter table clients enable row level security;
alter table sessions enable row level security;
alter table session_vouchers enable row level security;

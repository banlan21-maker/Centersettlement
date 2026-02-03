-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Teachers Table
create table if not exists teachers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  birth_date date,
  commission_rate numeric default 0.0,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Vouchers Table
create table if not exists vouchers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  support_amount integer default 0,
  client_copay integer default 0, -- Legacy
  category text default 'government', -- 관리처: education_office(교육청), government(정부)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Clients Table
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  birth_date date,
  registration_date date,
  end_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Sessions (Class Records) Table
create table if not exists sessions (
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
create table if not exists session_vouchers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  voucher_id uuid references vouchers(id) on delete cascade,
  used_amount integer default 0
);

-- Client Vouchers Junction Table (Client-specific Copay)
create table if not exists client_vouchers (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  voucher_id uuid references vouchers(id) on delete cascade,
  copay integer default 0, -- Legacy / Calculated per session
  monthly_session_count integer default 4, -- Default 4 sessions per month
  monthly_personal_burden integer default 0, -- Total monthly personal burden
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Teacher Clients Junction Table (Assignments)
create table if not exists teacher_clients (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references teachers(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Schema Updates (Ensure columns exist if table already existed)
alter table teachers add column if not exists birth_date date;
alter table teachers add column if not exists phone_number text;
alter table clients add column if not exists birth_date date;
alter table clients add column if not exists phone_number text;
alter table clients add column if not exists registration_date date;
alter table clients add column if not exists end_date date;

-- RLS Policies
alter table teachers enable row level security;
alter table vouchers enable row level security;
alter table clients enable row level security;
alter table sessions enable row level security;
alter table session_vouchers enable row level security;
alter table client_vouchers enable row level security;
alter table teacher_clients enable row level security;

-- Public Access Policies (Development Only)
drop policy if exists "Allow public access" on teachers;
create policy "Allow public access" on teachers for all using (true);

drop policy if exists "Allow public access" on vouchers;
create policy "Allow public access" on vouchers for all using (true);

drop policy if exists "Allow public access" on clients;
create policy "Allow public access" on clients for all using (true);

drop policy if exists "Allow public access" on sessions;
create policy "Allow public access" on sessions for all using (true);

drop policy if exists "Allow public access" on session_vouchers;
create policy "Allow public access" on session_vouchers for all using (true);

drop policy if exists "Allow public access" on client_vouchers;
create policy "Allow public access" on client_vouchers for all using (true);

drop policy if exists "Allow public access" on teacher_clients;
create policy "Allow public access" on teacher_clients for all using (true);

-- Center Settings Table
create table if not exists center_settings (
  id uuid primary key default uuid_generate_v4(),
  center_name text,
  business_number text,
  representative_name text,
  phone_number text,
  base_fee integer default 55000,
  extra_fee_per_10min integer default 10000,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table center_settings enable row level security;
create policy "Allow public access" on center_settings for all using (true);

-- Rooms Table
create table if not exists rooms (
  id uuid primary key default uuid_generate_v4(),
  center_id uuid, -- For future multi-tenant support (optional now)
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Schedules Table
create table if not exists schedules (
  id uuid primary key default uuid_generate_v4(),
  room_id uuid references rooms(id) on delete set null,
  teacher_id uuid references teachers(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text default 'scheduled', -- 'scheduled', 'completed', 'cancelled'
  memo text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table rooms enable row level security;
drop policy if exists "Allow public access" on rooms;
create policy "Allow public access" on rooms for all using (true);

alter table schedules enable row level security;
drop policy if exists "Allow public access" on schedules;
create policy "Allow public access" on schedules for all using (true);

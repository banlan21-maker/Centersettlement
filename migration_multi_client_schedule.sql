-- Create schedule_clients junction table
create table if not exists schedule_clients (
  id uuid primary key default uuid_generate_v4(),
  schedule_id uuid references schedules(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table schedule_clients enable row level security;
drop policy if exists "Allow public access" on schedule_clients;
create policy "Allow public access" on schedule_clients for all using (true);

-- Migrate existing single client data to junction table
insert into schedule_clients (schedule_id, client_id)
select id, client_id from schedules where client_id is not null;

-- Make client_id in schedules nullable (it already is, but just good to know)
-- We keep client_id for legacy or main client if needed, but we will primarily use schedule_clients now.

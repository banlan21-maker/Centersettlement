-- Migration: Add monthly columns to client_vouchers
alter table client_vouchers add column if not exists monthly_session_count integer default 4;
alter table client_vouchers add column if not exists monthly_personal_burden integer default 0;

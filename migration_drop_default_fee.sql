-- Migration: Drop default_fee column from vouchers
alter table vouchers drop column if exists default_fee;

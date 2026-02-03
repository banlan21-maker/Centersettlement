-- Migration: Add management category to vouchers (관리처 구분)
-- 교육청, 정부 - 계산법 차이로 관리 편의를 위해 구분
alter table vouchers add column if not exists category text default 'government';

-- Supabase 스키마 캐시 갱신 (새 컬럼 인식용)
notify pgrst, 'reload schema';

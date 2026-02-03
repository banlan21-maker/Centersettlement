-- Migration: Add registration_date and end_date to clients
-- 등록일: 센터 등록 날짜
-- 종료일: 상담/수업 종료일 (설정 시 담당선생님 연결 해제, 정산 제외)
alter table clients add column if not exists registration_date date;
alter table clients add column if not exists end_date date;

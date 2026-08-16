-- 북스타 측정 로그 v2 — bookstar_events (2026-08-17)
-- 설계: klever_demo/_측정로그_설계_20260817.md
-- 멱등. 적용 = Supabase Management API SQL (hwik-web/.env SUPABASE_ACCESS_TOKEN)

create table if not exists public.bookstar_events (
  id          bigint generated always as identity primary key,
  school_id   text not null,
  student_id  text not null default 'guest',
  session_id  text,
  kind        text not null,
  sub         text,
  item_type   text not null default 'none',
  item_key    text,
  item_title  text,
  origin      text not null default 'unknown',
  origin_id   text,
  program_id  text,
  ref_table   text,
  ref_id      text,
  ok          boolean not null default true,
  voided      boolean not null default false,
  seconds     integer,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint bookstar_events_kind_chk check (kind in ('visit','view','read','link','activity')),
  constraint bookstar_events_item_type_chk check (item_type in ('paper','ebook','foreign','korean','external','none'))
);

create index if not exists bookstar_events_school_time_idx   on public.bookstar_events (school_id, created_at);
create index if not exists bookstar_events_school_kind_idx   on public.bookstar_events (school_id, kind, created_at);
create index if not exists bookstar_events_school_stu_idx    on public.bookstar_events (school_id, student_id, created_at);
create index if not exists bookstar_events_school_item_idx   on public.bookstar_events (school_id, item_key);
create index if not exists bookstar_events_program_idx       on public.bookstar_events (school_id, program_id) where program_id is not null;
create index if not exists bookstar_events_ref_idx           on public.bookstar_events (ref_table, ref_id) where ref_id is not null;

comment on table public.bookstar_events is '북스타 측정 로그(추가 전용). kind: visit 접속 / view 조회 / read 고전 읽기 / link 도서관 연결(종이·전자) / activity 글쓰기. 관리자 5화면 원천.';

-- RLS: 학생 앱(anon)은 INSERT만. 읽기/수정/삭제 정책 없음 → 관리자 Edge Function(service role)만.
alter table public.bookstar_events enable row level security;

drop policy if exists bookstar_events_anon_insert on public.bookstar_events;
create policy bookstar_events_anon_insert on public.bookstar_events
  for insert to anon, authenticated
  with check (school_id is not null and kind in ('visit','view','read','link','activity'));

revoke all on public.bookstar_events from anon, authenticated;
grant insert on public.bookstar_events to anon, authenticated;
-- identity 시퀀스 사용 권한 (INSERT 시 필요) — 이 표 시퀀스만
do $$
declare s text;
begin
  select pg_get_serial_sequence('public.bookstar_events','id') into s;
  if s is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', s);
  end if;
end $$;

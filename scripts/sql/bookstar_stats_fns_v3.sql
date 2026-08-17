-- 측정 로그 v3 보정 (2026-08-17 저녁) — 대시보드 챌린지 칸의 날짜 경계를 한국시간으로
-- 문제: DB TimeZone=UTC라 p_from::date / current_date 가 KST 자정 경계에서 하루 전으로 계산됨
--       (이번 달 8/1~ → 실제 7/31 종료 챌린지가 '완료'로 셈, 오늘 시작 챌린지가 progs에서 빠짐)
-- 수정: (ts at time zone 'Asia/Seoul')::date 로 통일. 나머지 로직은 v2와 동일.
-- ⚠️ v1(bookstar_stats_fns.sql)의 bs_stats_overview는 구버전 — 다시 실행하지 말 것. 이 파일이 최신.

create or replace function public.bs_stats_overview(p_school text, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path=public as $$
with ev as (
  select * from bookstar_events where school_id=p_school and created_at>=p_from and created_at<p_to
), uses as (
  select * from ev where (kind='link' and ok) or (kind='read' and coalesce(seconds,0)>=60)
), acts as (
  select distinct on (coalesce(ref_table||':'||ref_id, id::text)) * from ev
  where kind='activity' and ok and not voided
  order by coalesce(ref_table||':'||ref_id, id::text), id
), t as (select unnest(array['paper','ebook','foreign','korean']) as ty),
d as (select (p_from at time zone 'Asia/Seoul')::date as d_from, (p_to at time zone 'Asia/Seoul')::date as d_to, (now() at time zone 'Asia/Seoul')::date as d_today),
progs as (select p.* from library_programs p, d where coalesce(p.start_date, '1900-01-01'::date) < d.d_to and coalesce(p.end_date, '2999-12-31'::date) >= d.d_from)
select jsonb_build_object(
  'from', p_from, 'to', p_to,
  'visitors', (select count(distinct student_id) from ev where kind='visit' and student_id<>'guest'),
  'views',    (select count(*) from ev   where kind='view' and item_type in ('paper','ebook','foreign','korean')),
  'uses',     (select count(*) from uses where item_type in ('paper','ebook','foreign','korean')),
  'acts',     (select count(*) from acts where item_type in ('paper','ebook','foreign','korean')),
  'by_type', (select jsonb_agg(jsonb_build_object(
                'type', ty,
                'views', (select count(*) from ev   where kind='view' and item_type=ty),
                'uses',  (select count(*) from uses where item_type=ty),
                'acts',  (select count(*) from acts where item_type=ty))
              order by array_position(array['paper','ebook','foreign','korean'], ty)) from t),
  'ch_open', (select count(*) from library_programs p, d where coalesce(p.end_date, d.d_today) >= d.d_today),
  'ch_done', (select count(*) from library_programs p, d where p.end_date is not null and p.end_date >= d.d_from and p.end_date < d.d_to),
  'ch_part', (select count(*) from (
                select student_id from bookstar_writings w where w.school_id=p_school and w.challenge_id is not null and not coalesce(w.hidden,false) and w.created_at>=p_from and w.created_at<p_to
                union
                select student_id from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id is not null and coalesce(r.quiz_total,0)>0 and r.updated_at>=p_from and r.updated_at<p_to) x),
  'ch_fin',  (select count(distinct dd.student_id) from progs, lateral bs_ch_done_students(p_school, progs.id::text) dd),
  'stars',   (select coalesce(sum(stars),0) from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to),
  'rank',    (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'stars',s) order by s desc), '[]'::jsonb)
              from (select student_id, sum(stars) s from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to
                    group by student_id having sum(stars)>0 order by s desc limit 10) r)
);
$$;

-- ⛔ 주의 (2026-08-29 리뷰): 이 파일의 bs_stats_overview 는 같은 날 저녁 bookstar_stats_fns_v3.sql 이 덮어썼다(KST 시간대 보정).
--   재실행 시 v3 를 반드시 뒤이어 적용할 것. bs_stats_challenges 는 이 파일이 최신.
-- 측정 로그 v2 집계 보정 (2026-08-17 오후) — 완주·참가 정의를 사장님 문서 기준으로 통일
-- 참가 = 그 챌린지 책에서 1건이라도 활동(인정 글 또는 퀴즈)한 학생
-- 완주 = 담긴 책 '전부'에서 켠 미션(quiz/oneline/question/review/essay) '전부'를 마친 학생
--        (앱의 ⭐30 '완주 보너스'·enroll.done_at은 책 1권 단위라 여기선 쓰지 않는다)

-- 챌린지별 참가 학생 목록
create or replace function public.bs_ch_part_students(p_school text, p_program text)
returns table(student_id text) language sql stable security definer set search_path=public as $$
  select w.student_id from bookstar_writings w where w.school_id=p_school and w.challenge_id=p_program and not coalesce(w.hidden,false)
  union
  select r.student_id from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id=p_program and (coalesce(r.quiz_total,0)>0 or coalesce(r.submitted,false));
$$;

-- 챌린지별 완주 학생 목록
create or replace function public.bs_ch_done_students(p_school text, p_program text)
returns table(student_id text) language sql stable security definer set search_path=public as $$
  with p as (select * from library_programs where id::text=p_program),
  bk as (select coalesce(nullif(b->>'id',''), regexp_replace(coalesce(b->>'isbn',''),'^sm-','')) as key from p, jsonb_array_elements(coalesce(p.books,'[]'::jsonb)) b),
  m as (select coalesce((mission->>'quiz')::boolean,false) q, coalesce((mission->>'oneline')::boolean,false) o, coalesce((mission->>'question')::boolean,false) qu,
               coalesce((mission->>'review')::boolean,false) rv, coalesce((mission->>'essay')::boolean,false) es from p)
  select s.student_id from bs_ch_part_students(p_school,p_program) s, m
  where (select count(*) from bk)>0
    and not exists (
      select 1 from bk
      where (m.q  and not exists (select 1 from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id=p_program and r.student_id=s.student_id and regexp_replace(coalesce(r.book_id,''),'^sm-','')=bk.key and coalesce(r.quiz_total,0)>0))
         or (m.o  and not exists (select 1 from bookstar_writings w where w.school_id=p_school and w.challenge_id=p_program and w.student_id=s.student_id and w.activity='oneline'  and regexp_replace(coalesce(w.book_id,''),'^sm-','')=bk.key and not coalesce(w.hidden,false)))
         or (m.qu and not exists (select 1 from bookstar_writings w where w.school_id=p_school and w.challenge_id=p_program and w.student_id=s.student_id and w.activity='question' and regexp_replace(coalesce(w.book_id,''),'^sm-','')=bk.key and not coalesce(w.hidden,false)))
         or (m.rv and not exists (select 1 from bookstar_writings w where w.school_id=p_school and w.challenge_id=p_program and w.student_id=s.student_id and w.activity='review'   and regexp_replace(coalesce(w.book_id,''),'^sm-','')=bk.key and not coalesce(w.hidden,false)))
         or (m.es and not exists (select 1 from bookstar_writings w where w.school_id=p_school and w.challenge_id=p_program and w.student_id=s.student_id and w.activity='essay'    and regexp_replace(coalesce(w.book_id,''),'^sm-','')=bk.key and not coalesce(w.hidden,false)))
    );
$$;

-- 챌린지 요약: part/done을 위 정의로 교체
create or replace function public.bs_stats_challenges(p_school text)
returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id', p.id, 'title', p.title, 'type', p.type, 'intro', p.intro, 'status', p.status,
  'start_date', p.start_date, 'end_date', p.end_date, 'mission', p.mission, 'featured', p.featured,
  'books_n', coalesce(jsonb_array_length(p.books),0),
  'part',   (select count(*) from bs_ch_part_students(p_school, p.id::text)),
  'joined', (select count(*) from bookstar_challenge_enroll e where e.school_id=p_school and e.challenge_id=p.id::text),
  'done',   (select count(*) from bs_ch_done_students(p_school, p.id::text)),
  'missions', (select count(*) from bookstar_writings w where w.school_id=p_school and w.challenge_id=p.id::text and not coalesce(w.hidden,false))
             + (select count(*) from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id=p.id::text and coalesce(r.quiz_total,0)>0)
) order by p.start_date desc nulls last, p.created_at desc), '[]'::jsonb)
from library_programs p;
$$;

-- 대시보드: 참여 학생 = 기간 안에 챌린지 활동이 1건이라도 있는 학생, 완주 학생 = 기간과 겹치는 챌린지들의 완주 학생(중복 제거)
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
progs as (select * from library_programs where coalesce(start_date, '1900-01-01'::date) < p_to::date and coalesce(end_date, '2999-12-31'::date) >= p_from::date)
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
  'ch_open', (select count(*) from library_programs where coalesce(end_date, current_date) >= current_date),
  'ch_done', (select count(*) from library_programs where end_date is not null and end_date >= p_from::date and end_date < p_to::date),
  'ch_part', (select count(*) from (
                select student_id from bookstar_writings w where w.school_id=p_school and w.challenge_id is not null and not coalesce(w.hidden,false) and w.created_at>=p_from and w.created_at<p_to
                union
                select student_id from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id is not null and coalesce(r.quiz_total,0)>0 and r.updated_at>=p_from and r.updated_at<p_to) x),
  'ch_fin',  (select count(distinct d.student_id) from progs, lateral bs_ch_done_students(p_school, progs.id::text) d),
  'stars',   (select coalesce(sum(stars),0) from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to),
  'rank',    (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'stars',s) order by s desc), '[]'::jsonb)
              from (select student_id, sum(stars) s from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to
                    group by student_id having sum(stars)>0 order by s desc limit 10) r)
);
$$;

revoke all on function public.bs_ch_part_students(text,text) from public, anon, authenticated;
revoke all on function public.bs_ch_done_students(text,text) from public, anon, authenticated;
grant execute on function public.bs_ch_part_students(text,text) to service_role;
grant execute on function public.bs_ch_done_students(text,text) to service_role;

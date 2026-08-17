-- 북스타 측정 로그 v2 — 3단계 집계 함수 (2026-08-17)
-- 설계: klever_demo/_측정로그_설계_20260817.md §5. 호출 = admin-save Edge Function(service role)만. anon/authenticated 실행 권한 없음.
-- 사장님 화면 용어: 조회=view / 이용=link(ok)+read(seconds>=60) / 활동=activity(ok, not voided, ref 중복 제거) / 경로=program_id 유무
-- 화면 유형 4종만 집계: paper·ebook·foreign·korean (external·none 제외)

-- ───────────────────────────────── 1. 대시보드 ─────────────────────────────────
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
), t as (select unnest(array['paper','ebook','foreign','korean']) as ty)
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
  'ch_part', (select count(distinct student_id) from bookstar_challenge_enroll where school_id=p_school and joined_at>=p_from and joined_at<p_to),
  'ch_fin',  (select count(distinct student_id) from bookstar_challenge_enroll where school_id=p_school and done_at is not null and done_at>=p_from and done_at<p_to),
  'stars',   (select coalesce(sum(stars),0) from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to),
  'rank',    (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'stars',s) order by s desc), '[]'::jsonb)
              from (select student_id, sum(stars) s from bookstar_stars where school_id=p_school and created_at>=p_from and created_at<p_to
                    group by student_id having sum(stars)>0 order by s desc limit 10) r)
);
$$;

-- ───────────────────────────────── 2. 이용통계 (도서별·학생별·상세) ─────────────────────────────────
-- p_type: null/''=전체 | paper|ebook|foreign|korean   p_path: null/''=전체 | '상시' | '챌린지'
create or replace function public.bs_stats_usage(p_school text, p_from timestamptz, p_to timestamptz, p_type text default null, p_path text default null)
returns jsonb language sql stable security definer set search_path=public as $$
with ev as (
  select * from bookstar_events
  where school_id=p_school and created_at>=p_from and created_at<p_to
    and item_type in ('paper','ebook','foreign','korean')
    and (coalesce(p_type,'')='' or item_type=p_type)
    and (coalesce(p_path,'')='' or (p_path='상시' and program_id is null) or (p_path='챌린지' and program_id is not null))
), uses as (
  select *, case when kind='read' then '읽기' else '연결' end as way
  from ev where (kind='link' and ok) or (kind='read' and coalesce(seconds,0)>=60)
), acts as (
  select distinct on (coalesce(ref_table||':'||ref_id, id::text)) * from ev
  where kind='activity' and ok and not voided
  order by coalesce(ref_table||':'||ref_id, id::text), id
), keys as (
  select item_type, item_key from ev where item_key is not null group by item_type, item_key
), books as (
  select k.item_type, k.item_key,
         (select item_title from ev e where e.item_type=k.item_type and e.item_key=k.item_key and item_title is not null order by id desc limit 1) as title,
         (select count(*) from ev   e where e.kind='view' and e.item_type=k.item_type and e.item_key=k.item_key) as views,
         (select count(*) from uses u where u.item_type=k.item_type and u.item_key=k.item_key) as uses,
         (select count(*) from acts a where a.item_type=k.item_type and a.item_key=k.item_key) as acts
  from keys k
), stu as (
  select s.student_id,
         (select count(*) from ev   e where e.kind='view' and e.student_id=s.student_id) as views,
         (select count(*) from uses u where u.student_id=s.student_id) as uses,
         (select count(*) from acts a where a.student_id=s.student_id) as acts,
         (select coalesce(sum(stars),0) from bookstar_stars b where b.school_id=p_school and b.student_id=s.student_id and b.created_at>=p_from and b.created_at<p_to) as stars
  from (select distinct student_id from ev where student_id<>'guest') s
)
select jsonb_build_object(
  'from', p_from, 'to', p_to, 'type', coalesce(p_type,''), 'path', coalesce(p_path,''),
  'books', (select coalesce(jsonb_agg(to_jsonb(b) order by b.views desc, b.uses desc, b.title), '[]'::jsonb) from books b),
  'students', (select coalesce(jsonb_agg(to_jsonb(s) order by s.uses desc, s.acts desc, s.views desc, s.student_id), '[]'::jsonb) from stu s),
  'detail', (select coalesce(jsonb_agg(jsonb_build_object(
                'student_id', u.student_id, 'date', to_char(u.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
                'type', u.item_type, 'title', u.item_title, 'way', u.way, 'path', case when u.program_id is null then '상시' else '챌린지' end)
              order by u.created_at desc), '[]'::jsonb)
             from (select * from uses where student_id<>'guest' order by created_at desc limit 20000) u)
);
$$;

-- ───────────────────────────────── 3. 챌린지 통계 (요약) ─────────────────────────────────
-- 참가 = 그 챌린지에서 1건이라도 한 학생(글 또는 퀴즈). 완주 = enroll.done_at(앱의 완주 판정=미션 전부). 미션 수행 = 인정된 글 + 퀴즈 푼 책.
create or replace function public.bs_stats_challenges(p_school text)
returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id', p.id, 'title', p.title, 'type', p.type, 'intro', p.intro, 'status', p.status,
  'start_date', p.start_date, 'end_date', p.end_date, 'mission', p.mission, 'featured', p.featured,
  'books_n', coalesce(jsonb_array_length(p.books),0),
  'part', (select count(*) from (
             select student_id from bookstar_writings w where w.school_id=p_school and w.challenge_id=p.id::text and not coalesce(w.hidden,false)
             union
             select student_id from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id=p.id::text and (coalesce(r.quiz_total,0)>0 or coalesce(r.submitted,false))
           ) x),
  'joined', (select count(*) from bookstar_challenge_enroll e where e.school_id=p_school and e.challenge_id=p.id::text),
  'done',   (select count(*) from bookstar_challenge_enroll e where e.school_id=p_school and e.challenge_id=p.id::text and e.done_at is not null),
  'missions', (select count(*) from bookstar_writings w where w.school_id=p_school and w.challenge_id=p.id::text and not coalesce(w.hidden,false))
             + (select count(*) from bookstar_challenge_results r where r.school_id=p_school and r.challenge_id=p.id::text and coalesce(r.quiz_total,0)>0)
) order by p.start_date desc nulls last, p.created_at desc), '[]'::jsonb)
from library_programs p;
$$;

-- ───────────────────────────────── 3b. 챌린지 상세 (학생 × 담긴 책, 시상용) ─────────────────────────────────
create or replace function public.bs_stats_challenge_detail(p_school text, p_program text)
returns jsonb language sql stable security definer set search_path=public as $$
with p as (select * from library_programs where id::text=p_program),
bk as (
  select ord, coalesce(nullif(b->>'id',''), regexp_replace(coalesce(b->>'isbn',''),'^sm-','')) as key,
         b->>'title' as title, b->>'isbn' as isbn, b->>'id' as cid
  from p, jsonb_array_elements(p.books) with ordinality as x(b, ord)
),
w as (
  select student_id, book_id, activity as act, text, created_at as at
  from bookstar_writings where school_id=p_school and challenge_id=p_program and not coalesce(hidden,false)
),
q as (
  select student_id, book_id, 'quiz' as act,
         (coalesce(quiz_ok,0)::text||'/'||coalesce(quiz_total,0)::text) as text, updated_at as at
  from bookstar_challenge_results where school_id=p_school and challenge_id=p_program and coalesce(quiz_total,0)>0
),
allrows as (select * from w union all select * from q)
select jsonb_build_object(
  'program', (select jsonb_build_object('id',id,'title',title,'type',type,'mission',mission,'start_date',start_date,'end_date',end_date) from p),
  'books', (select coalesce(jsonb_agg(jsonb_build_object('key',key,'title',title,'isbn',isbn,'id',cid) order by ord), '[]'::jsonb) from bk),
  'rows', (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'book_id',book_id,'act',act,'text',text,'at',at) order by student_id, at), '[]'::jsonb) from allrows),
  'enroll', (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'joined_at',joined_at,'done_at',done_at) order by joined_at), '[]'::jsonb)
             from bookstar_challenge_enroll where school_id=p_school and challenge_id=p_program),
  'stars', (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'stars',s) order by s desc), '[]'::jsonb)
            from (select student_id, sum(stars) s from bookstar_stars where school_id=p_school and (ref=p_program or ref in (select 'book:'||key from bk)) group by student_id) z)
);
$$;

-- ───────────────────────────────── 4. 운영이력 — 큐레이션 칸별 조회·이용 ─────────────────────────────────
-- library_sections엔 기간이 없다(칸을 덮어쓰는 구조) → 지금 걸린 칸 제목 + 기간 안 조회·이용. '끝난 큐레이션' 이력은 별도 기록이 생기면 확장.
create or replace function public.bs_stats_curation(p_school text, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path=public as $$
with ev as (
  select * from bookstar_events where school_id=p_school and created_at>=p_from and created_at<p_to and origin in ('curation','ranking') and origin_id is not null
), uses as (
  select * from ev where (kind='link' and ok) or (kind='read' and coalesce(seconds,0)>=60)
), slots as (select origin_id from ev group by origin_id)
select coalesce(jsonb_agg(jsonb_build_object(
  'slot', s.origin_id,
  'title', (select title from library_sections ls where ls.slot=s.origin_id order by updated_at desc limit 1),
  'area',  (select area  from library_sections ls where ls.slot=s.origin_id order by updated_at desc limit 1),
  'books_n', (select coalesce(jsonb_array_length(books),0) from library_sections ls where ls.slot=s.origin_id order by updated_at desc limit 1),
  'views', (select count(*) from ev  e where e.kind='view' and e.origin_id=s.origin_id),
  'uses',  (select count(*) from uses u where u.origin_id=s.origin_id)
) order by (select count(*) from ev e where e.kind='view' and e.origin_id=s.origin_id) desc), '[]'::jsonb)
from slots s;
$$;

-- ───────────────────────────────── 5. 학생 글 숨김/복구 = 안 쓴 것 (별 회수·이벤트 voided) ─────────────────────────────────
-- 사장님 규칙: "숨기면 안 쓴 것이 됩니다 — 학생 화면에서 내려가고, 준 별도 회수". 다시 보이기 = 원복.
create or replace function public.bs_writing_hide(p_school text, p_student text, p_activity text, p_book text, p_hidden boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rate int; v_ref text; v_exists int; v_ok boolean := false;
begin
  update bookstar_writings set hidden=p_hidden
   where school_id=p_school and student_id=p_student and activity=p_activity and book_id=p_book;
  v_ok := found;
  update bookstar_events set voided=p_hidden
   where school_id=p_school and ref_table='bookstar_writings' and ref_id=p_student||'|'||p_activity||'|'||p_book;
  select stars into v_rate from bookstar_star_rates where activity=p_activity;
  v_ref := 'book:'||p_book;
  if v_rate is not null then
    if p_hidden then
      -- 원래 적립이 있었을 때만 회수(없던 별을 마이너스로 만들지 않음). 트리거가 totals를 -rate 반영.
      select count(*) into v_exists from bookstar_stars where school_id=p_school and student_id=p_student and activity=p_activity and ref=v_ref;
      if v_exists>0 then
        insert into bookstar_stars(student_id,school_id,activity,ref,stars) values(p_student,p_school,'revoke:'||p_activity,v_ref,-v_rate)
        on conflict (student_id,activity,ref) do nothing;
      end if;
    else
      delete from bookstar_stars where school_id=p_school and student_id=p_student and activity='revoke:'||p_activity and ref=v_ref;
      if found then   -- 삭제엔 트리거가 없어 totals를 직접 되돌린다
        update bookstar_student_totals set total_stars=total_stars+v_rate, grade=bookstar_grade(total_stars+v_rate), updated_at=now()
         where school_id=p_school and student_id=p_student;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', v_ok, 'hidden', p_hidden);
end $$;

-- ── 독자 서평(reviews = 빌린 책 서평) 숨김/복구 (2026-08-17 적용 완료) ──
-- reviews 에 hidden(bool, default false)·student_id(text) 컬럼 추가. anon 은 hidden SELECT/INSERT 만(UPDATE 불가 → 사서만 바꿈).
-- 같은 날 anon/authenticated 의 reviews DELETE·TRUNCATE·TRIGGER·REFERENCES 테이블 권한 회수(정책 없이 열려 있던 잔재).
-- 별 없음: 글 hidden + 이벤트 voided 만.
alter table public.reviews add column if not exists hidden boolean not null default false;
alter table public.reviews add column if not exists student_id text;
grant select(hidden), select(student_id), insert(student_id) on public.reviews to anon, authenticated;
revoke delete, truncate, trigger, references on public.reviews from anon, authenticated;
create or replace function public.bs_review_hide(p_id bigint, p_hidden boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ok boolean;
begin
  update reviews set hidden=p_hidden where id=p_id; v_ok:=found;
  update bookstar_events set voided=p_hidden where ref_table='reviews' and ref_id=p_id::text;
  return jsonb_build_object('ok', v_ok);
end $$;
revoke all on function public.bs_review_hide(bigint,boolean) from public, anon, authenticated;
grant execute on function public.bs_review_hide(bigint,boolean) to service_role;

-- 권한: anon/authenticated 실행 금지 (service role만)
revoke all on function public.bs_stats_overview(text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.bs_stats_usage(text,timestamptz,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.bs_stats_challenges(text) from public, anon, authenticated;
revoke all on function public.bs_stats_challenge_detail(text,text) from public, anon, authenticated;
revoke all on function public.bs_stats_curation(text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.bs_writing_hide(text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.bs_stats_overview(text,timestamptz,timestamptz) to service_role;
grant execute on function public.bs_stats_usage(text,timestamptz,timestamptz,text,text) to service_role;
grant execute on function public.bs_stats_challenges(text) to service_role;
grant execute on function public.bs_stats_challenge_detail(text,text) to service_role;
grant execute on function public.bs_stats_curation(text,timestamptz,timestamptz) to service_role;
grant execute on function public.bs_writing_hide(text,text,text,text,boolean) to service_role;

-- 측정 로그 v4 (2026-08-17 저녁) — 사장님 8/16 시안 감사 후속 C2·C3
--  C2. 챌린지 [결과 확정 → 운영이력]: 종료 챌린지의 참가·완주·명단(학생×책)을 그 시점 그대로 얼려 둔다
--      (시상 뒤 학생이 글을 지워도 명단이 변하지 않게). bookstar_challenge_fixed 1행 = 챌린지 1개.
--  C3. 큐레이션 이력: library_sections 는 칸을 덮어쓰는 구조라 기간이 안 남았음 → 트리거로 시작·끝을 자동 기록.
--      운영이력 '끝난 큐레이션' = ended_at 이 찍힌 이력 + 그 기간 안 조회·이용.
-- 권한: 전부 service role 전용(anon 실행 금지). 학번이 든 개인 데이터.

-- ───────────── C2. 결과 확정 저장소 ─────────────
create table if not exists public.bookstar_challenge_fixed (
  school_id text not null,
  challenge_id text not null,
  fixed_at timestamptz not null default now(),
  summary jsonb not null,          -- 그 시점의 bs_stats_challenges 한 줄(참가·완주·미션 수행·시상 방식)
  detail jsonb not null,           -- 그 시점의 bs_stats_challenge_detail(books·rows·enroll·stars) — 학번 포함
  primary key (school_id, challenge_id)
);
alter table public.bookstar_challenge_fixed enable row level security;   -- 정책 없음 = anon/authenticated 접근 불가, service role만
revoke all on table public.bookstar_challenge_fixed from public, anon, authenticated;

-- 확정 실행: 종료된 챌린지만. 이미 확정된 것은 덮어쓰지 않는다(얼린 값 보존) → 다시 확정하려면 행을 지워야 함(관리자 UI에 없음)
create or replace function public.bs_ch_fix_result(p_school text, p_program text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_end date; v_today date := (now() at time zone 'Asia/Seoul')::date; v_sum jsonb; v_det jsonb; v_at timestamptz;
begin
  select end_date into v_end from library_programs where id::text=p_program;
  if not found then return jsonb_build_object('ok',false,'error','no such program'); end if;
  if v_end is null or v_end >= v_today then return jsonb_build_object('ok',false,'error','not ended'); end if;
  select fixed_at into v_at from bookstar_challenge_fixed where school_id=p_school and challenge_id=p_program;
  if found then return jsonb_build_object('ok',true,'already',true,'fixed_at',v_at); end if;
  select e into v_sum from jsonb_array_elements(bs_stats_challenges(p_school)) e where e->>'id'=p_program;
  v_det := bs_stats_challenge_detail(p_school, p_program);
  insert into bookstar_challenge_fixed(school_id, challenge_id, summary, detail) values (p_school, p_program, coalesce(v_sum,'{}'::jsonb), coalesce(v_det,'{}'::jsonb))
  returning fixed_at into v_at;
  return jsonb_build_object('ok',true,'fixed_at',v_at);
end $$;

-- 확정 목록(요약만, 학번 없음) — 챌린지 통계·운영이력에서 '확정됨' 표시와 얼린 참가·완주 값에 씀
create or replace function public.bs_ch_fixed_list(p_school text)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('challenge_id',challenge_id,'fixed_at',fixed_at,'summary',summary) order by fixed_at desc), '[]'::jsonb)
  from bookstar_challenge_fixed where school_id=p_school;
$$;

-- 확정본 1건(명단 포함, 학번 있음) — 운영이력 [명단 엑셀]
create or replace function public.bs_ch_fixed_get(p_school text, p_program text)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce((select jsonb_build_object('challenge_id',challenge_id,'fixed_at',fixed_at,'summary',summary,'detail',detail)
                   from bookstar_challenge_fixed where school_id=p_school and challenge_id=p_program), 'null'::jsonb);
$$;

revoke all on function public.bs_ch_fix_result(text,text) from public, anon, authenticated;
revoke all on function public.bs_ch_fixed_list(text) from public, anon, authenticated;
revoke all on function public.bs_ch_fixed_get(text,text) from public, anon, authenticated;
grant execute on function public.bs_ch_fix_result(text,text) to service_role;
grant execute on function public.bs_ch_fixed_list(text) to service_role;
grant execute on function public.bs_ch_fixed_get(text,text) to service_role;

-- ───────────── C3. 큐레이션 이력 ─────────────
create table if not exists public.library_sections_history (
  id bigserial primary key,
  school text, slot text not null, title text, area text, books_n int,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text                  -- replaced(제목·책 바뀜) / hidden(visible=false) / deleted(칸 삭제)
);
create index if not exists library_sections_history_slot_open on public.library_sections_history(slot) where ended_at is null;
alter table public.library_sections_history enable row level security;
revoke all on table public.library_sections_history from public, anon, authenticated;

create or replace function public.bs_sections_hist_trg()
returns trigger language plpgsql security definer set search_path=public as $$
declare changed boolean;
begin
  if tg_op = 'DELETE' then
    update library_sections_history set ended_at=now(), end_reason='deleted' where slot=old.slot and ended_at is null;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.visible,true) then
      insert into library_sections_history(school,slot,title,area,books_n,started_at)
      values (new.school,new.slot,new.title,new.area,coalesce(jsonb_array_length(coalesce(new.books,'[]'::jsonb)),0),coalesce(new.updated_at,now()));
    end if;
    return new;
  end if;
  -- UPDATE
  if coalesce(old.visible,true) and not coalesce(new.visible,true) then
    update library_sections_history set ended_at=now(), end_reason='hidden' where slot=old.slot and ended_at is null;
    return new;
  end if;
  changed := (old.title is distinct from new.title) or (old.area is distinct from new.area) or (old.books is distinct from new.books)
             or (not coalesce(old.visible,true) and coalesce(new.visible,true));
  if changed then
    update library_sections_history set ended_at=now(), end_reason='replaced' where slot=old.slot and ended_at is null;
    if coalesce(new.visible,true) then
      insert into library_sections_history(school,slot,title,area,books_n,started_at)
      values (new.school,new.slot,new.title,new.area,coalesce(jsonb_array_length(coalesce(new.books,'[]'::jsonb)),0),now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists library_sections_hist on public.library_sections;
create trigger library_sections_hist after insert or update or delete on public.library_sections
  for each row execute function public.bs_sections_hist_trg();

-- 지금 걸려 있는 칸을 '열린 이력'으로 1회 백필(이미 열린 행이 있으면 건너뜀) — 시작일은 마지막 수정 시각
insert into public.library_sections_history(school,slot,title,area,books_n,started_at)
select s.school, s.slot, s.title, s.area, coalesce(jsonb_array_length(coalesce(s.books,'[]'::jsonb)),0), coalesce(s.updated_at, now())
from library_sections s
where coalesce(s.visible,true) and not exists (select 1 from library_sections_history h where h.slot=s.slot and h.ended_at is null);

-- 운영이력 '끝난 큐레이션': ended_at 찍힌 이력 + 그 기간 안 그 칸에서 일어난 조회·이용 (기존 bs_stats_curation과 같은 정의)
create or replace function public.bs_stats_curation_history(p_school text)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slot', h.slot, 'title', h.title, 'area', h.area, 'books_n', h.books_n,
    'started_at', h.started_at, 'ended_at', h.ended_at, 'end_reason', h.end_reason,
    'views', (select count(*) from bookstar_events e where e.school_id=p_school and e.origin_id=h.slot and e.origin in ('curation','ranking') and e.kind='view' and e.created_at>=h.started_at and e.created_at<h.ended_at),
    'uses',  (select count(*) from bookstar_events e where e.school_id=p_school and e.origin_id=h.slot and e.origin in ('curation','ranking') and e.created_at>=h.started_at and e.created_at<h.ended_at
              and ((e.kind='link' and e.ok) or (e.kind='read' and coalesce(e.seconds,0)>=60)))
  ) order by h.ended_at desc), '[]'::jsonb)
  from (select * from library_sections_history where ended_at is not null order by ended_at desc limit 200) h;
$$;
revoke all on function public.bs_stats_curation_history(text) from public, anon, authenticated;
grant execute on function public.bs_stats_curation_history(text) to service_role;

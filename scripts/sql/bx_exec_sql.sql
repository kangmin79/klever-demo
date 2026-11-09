-- 11/9 — tulip_sync.py 전용 SQL 실행 함수(service_role만 실행 가능)
-- 배경: Supabase Management API 토큰(PAT)이 9/11·9/23·10/2·11월초 네 번 만료되어 Vultr 주간 갱신(11/2·11/9)이
--       소장목록 단계 전부 401로 실패. service_role 키는 만료가 없으므로 수집기의 sql()을 이 RPC로 옮김.
-- 보안: service_role은 이미 RLS 우회·전권 → 노출 증가 없음. anon/authenticated/public 실행 권한 회수.
-- 함께 적용: alter role service_role set statement_timeout = '10min'; notify pgrst, 'reload config';
--   (PostgREST 세션은 authenticator 8초 제한 → service_role 요청에만 10분. 70초 쿼리 통과 실측 11/9)
-- 결과 모양 = Management API와 동일: 조회문은 행 배열, 비조회문(다중문 포함)은 [].
create or replace function public.bx_exec_sql(q text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r jsonb;
  s text := regexp_replace(q, '[\s;]+$', '');
begin
  if s ~* '^\s*(select|with|values|show|table)\M' then
    execute 'select coalesce(jsonb_agg(to_jsonb(_t)), ''[]''::jsonb) from (' || s || ') _t' into r;
    return r;
  end if;
  execute s;
  return '[]'::jsonb;
end
$$;
revoke all on function public.bx_exec_sql(text) from public;
revoke all on function public.bx_exec_sql(text) from anon;
revoke all on function public.bx_exec_sql(text) from authenticated;
grant execute on function public.bx_exec_sql(text) to service_role;

create or replace function public._fix_d4l_stamps() returns void
language plpgsql as $function$
declare
  n bigint := 0;
  total bigint := 0;
  t0 timestamptz := clock_timestamp();
begin
  -- 8/13 사고 복구: 정보나루 한도(outOfMaxlimit)를 "미보유"로 오인해 19,117권에
  -- 가짜 '' 도장이 찍혔다. ''는 pull()에서 영구 제외되는 도장이라 null로 되돌려야 한다.
  --
  -- 왜 시간예산 루프인가 (2026-08-13 재설계):
  --   구버전은 한 틱에 100행 고정이었다. 이 표는 임베딩+HNSW라 UPDATE가 행당
  --   0.29초(캐시 더움) ~ 2.3초(차가움)로 8배 출렁인다. 100행이면 차가울 때 230초라
  --   statement_timeout(120초)에 걸려 **틱 전체가 롤백**됐다 — 실측 21실패/7성공,
  --   50분 동안 1,000행밖에 못 갔다.
  --   그래서 (a)행 수가 아니라 **시간**으로 끊고, (b)한 문장은 20행으로 작게 유지한다.
  --   최악 20행=46초라 단일 문장은 절대 120초를 못 넘고, 60초에서 루프를 멈추므로
  --   마지막 문장까지 더해도 106초 < 120초. 롤백으로 버리는 일이 없다.
  --   캐시가 더우면 한 틱에 200행 넘게 나간다(고정 100행보다 빠르다).
  if not pg_try_advisory_lock(918213) then return; end if;

  loop
    with t as (
      select ctrl from semyung_tulip
       where kind = 'paper' and mat_type = 'm'
         and description = ''
         and updated_at >= '2026-08-12 23:00:00+00'
       limit 20)
    update semyung_tulip s set description = null from t where s.ctrl = t.ctrl;
    get diagnostics n = row_count;
    total := total + n;
    exit when n = 0;
    exit when clock_timestamp() - t0 > interval '60 seconds';
  end loop;

  if n = 0 then
    update semyung_sync_state
       set last_result = 'd4l stamp repair DONE', last_run_at = now() where id = 1;
    -- unschedule가 권한 등으로 실패해도 DONE 기록까지 같이 롤백되면 안 된다.
    -- 롤백되면 매분 깨어나 "남은 행 0" 확인을 위해 5GB 전체 스캔(약 10초)을 영원히 반복한다
    -- — 대상이 없을 때의 limit 20은 표 끝까지 훑어야 없음을 증명할 수 있기 때문.
    begin
      perform cron.unschedule('fix_d4l_stamps');
    exception when others then
      update semyung_sync_state
         set last_result = 'd4l stamp repair DONE (unschedule 실패 — 손으로 끌 것)'
       where id = 1;
    end;
  else
    -- 구버전은 여기서 count(*)로 남은 수를 셌다. 그 한 줄이 **틱당 10.4초**짜리
    -- 전체 스캔이었다(5GB 표). 진행 보고 때문에 복구가 느려지면 본말전도라 뺀다.
    -- 남은 수가 궁금하면 사람이 그때그때 세면 된다.
    update semyung_sync_state
       set last_result = 'd4l stamp repair: +' || total || ' this tick',
           last_run_at = now()
     where id = 1;
  end if;

  perform pg_advisory_unlock(918213);
end $function$;

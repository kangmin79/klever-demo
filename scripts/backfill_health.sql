-- 백필 정직한 신호등 (2026-08-13)
-- 왜: 이 파이프라인의 사고 4건이 전부 "실패가 성공처럼 보임"이었다.
--   콘솔 닫힘=조용히 종료 / 한도 오인=미보유로 저장 / 복구 롤백=cron은 실행됨 /
--   쓰기 실패=요약줄은 채움으로 보고. 실행 여부·로그·날짜도장은 전부 증거가 못 된다.
-- 그래서 재는 것은 딱 하나: **어제보다 줄거리가 몇 권 늘었나.**
create table if not exists semyung_backfill_health (
  day        date primary key,
  desc_total bigint not null,      -- 줄거리 보유 권수 (종이책 단행본)
  delta      bigint,               -- 어제 대비 증가분 = 진짜 성과
  no_desc    bigint,               -- '' 미보유 도장 (급증하면 한도 오인 재발 의심)
  untouched  bigint,               -- 아직 조회조차 안 한 것
  verdict    text,                 -- GREEN / YELLOW / RED
  note       text,
  created_at timestamptz default now()
);

create or replace function public._backfill_health_check() returns void
language plpgsql as $function$
declare
  t bigint; e bigint; u bigint; prev bigint; d bigint; v text; n text;
begin
  select count(*) filter (where description is not null and description <> ''),
         count(*) filter (where description = ''),
         count(*) filter (where description is null)
    into t, e, u
    from semyung_tulip where kind = 'paper' and mat_type = 'm';

  select desc_total into prev from semyung_backfill_health
   where day < current_date order by day desc limit 1;

  d := case when prev is null then null else t - prev end;

  -- 기준: 실측 페이스가 일 15,000~17,750이었다. 정보나루 한도(30,000)를 온전히 쓰면
  -- 최소 한 자리 수 천 권은 늘어야 정상. 3,000 미만이면 뭔가 새고 있는 것이다.
  if d is null then           v := 'GREEN'; n := '첫 측정 — 내일부터 증감 비교';
  elsif d >= 8000 then        v := 'GREEN'; n := '정상 페이스';
  elsif d >= 3000 then        v := 'YELLOW'; n := '느림 — 한도·쓰기실패 확인';
  else                        v := 'RED';
                              n := '거의 안 늘었다. tulip_daily.log에서 한도 도달·쓰기 실패·강제종료 확인할 것';
  end if;

  -- 미보유 도장이 하루에 5,000 넘게 늘면 8/13 한도 오인 사고의 재발 신호다.
  if d is not null and e > 25000 then
    v := 'RED'; n := n || ' / 미보유 도장 과다(' || e || ') — 한도 오인 재발 의심';
  end if;

  insert into semyung_backfill_health(day, desc_total, delta, no_desc, untouched, verdict, note)
  values (current_date, t, d, e, u, v, n)
  on conflict (day) do update set desc_total = excluded.desc_total, delta = excluded.delta,
    no_desc = excluded.no_desc, untouched = excluded.untouched,
    verdict = excluded.verdict, note = excluded.note;
end $function$;

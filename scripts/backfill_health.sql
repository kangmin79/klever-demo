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
  fr bigint; frc bigint; mtnull bigint; q bigint;
  -- 🔴 current_date는 UTC다. 05:00 KST = 전날 20:00 UTC라 그대로 쓰면
  --   어제 행을 덮어써서 '어제 대비 증가'가 영영 안 잡힌다(2026-08-14 실측 버그).
  kst_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- 신착(최근 14일)이 표지를 얼마나 갖췄나. 학생이 앱 열면 제일 먼저 보는 자리라 따로 잰다.
  select count(*), count(*) filter (where coalesce(cover_url,'') <> '')
    into fr, frc
    from semyung_tulip
   where kind = 'paper' and reg_date >= to_char(kst_today - interval '14 days','YYYYMMDD');
  -- mat_type이 NULL인 종이책 = 파이프라인에서 조용히 사라지는 행(8/12 신착 10권 사고).
  -- 0이 정상. 늘어나면 신착 삽입이 자료유형을 못 얻고 있다는 뜻이다.
  select count(*) into mtnull from semyung_tulip where kind='paper' and mat_type is null;
  select count(*) filter (where description is not null and description <> ''),
         count(*) filter (where description = ''),
         count(*) filter (where description is null)
    into t, e, u
    from semyung_tulip where kind = 'paper' and mat_type = 'm';

  select desc_total into prev from semyung_backfill_health
   where day < kst_today order by day desc limit 1;

  d := case when prev is null then null else t - prev end;

  -- 8/18: 남은 '조회 가능' 대상(ISBN 있고 아직 안 물어본 것). 이게 바닥나면 증가폭이 주는 게 정상이라
  --   페이스 규칙(아래)을 적용하면 매일 RED 오탐이 난다(8/18 실측: 한국어 92% 완료 상태에서 delta 6,377 → RED).
  select count(*) into q from semyung_tulip
   where kind = 'paper' and mat_type = 'm' and description is null and coalesce(isbn,'') <> '';

  if q < 2000 then
    -- 마무리 단계: 채울 수 있는 책은 다 채움. 남은 미보유는 ISBN 없음(조회 불가)·국내 API에 없는 외서.
    v := 'GREEN'; n := '마무리 — 채울 수 있는 책은 다 채움(조회 대상 ' || q || '권 남음, 오늘 +' || coalesce(d,0) || ')';
  else
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
    n := n || ' (조회 대상 ' || q || '권 남음)';
  end if;

  n := n || ' | 신착14일 ' || frc || '/' || fr || ' 표지';
  -- 신착이 있는데 표지가 하나도 없으면 --fresh 단계가 죽었거나 한도에 막힌 것이다
  if fr >= 3 and frc = 0 then
    v := 'RED'; n := n || ' ← 신착 표지 0. --fresh 단계·API 한도 확인';
  end if;
  if mtnull > 0 then
    v := 'RED'; n := n || ' / mat_type NULL ' || mtnull || '건 — 파이프라인에서 누락되는 행';
  end if;

  insert into semyung_backfill_health(day, desc_total, delta, no_desc, untouched, verdict, note)
  values (kst_today, t, d, e, u, v, n)
  on conflict (day) do update set desc_total = excluded.desc_total, delta = excluded.delta,
    no_desc = excluded.no_desc, untouched = excluded.untouched,
    verdict = excluded.verdict, note = excluded.note;
end $function$;

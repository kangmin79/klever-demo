-- 종이책 임베딩 HNSW 인덱스 재빌드 (재임베딩 후)
-- 전제: 인스턴스를 Micro(1GB) → Large(8GB)로 임시 승급한 상태. 8/7 절차와 동일.
--   Micro에서는 maintenance_work_mem이 128MB라 그래프가 디스크로 스필해 사실상 완성되지 않는다
--   (8/7 실측: 5시간에 545 tuple = stall).
-- ⚠️ max_parallel_maintenance_workers = 0 (직렬) 필수.
--   병렬 빌드는 8GB에서도 /dev/shm을 넘겨 "could not resize shared memory"로 죽는다.
-- Mgmt API는 서버 statement_timeout이 120초라 직접 실행이 불가 → pg_cron으로 던진다.
--   진행/완료는 semyung_sync_state.last_result 마커로 확인.

create or replace function _tulip_idx_paper() returns void language plpgsql as $$
begin
  if not pg_try_advisory_lock(884422) then return; end if;   -- 중복 실행 방지
  set local statement_timeout = 0;
  set local maintenance_work_mem = '4GB';
  set local max_parallel_maintenance_workers = 0;            -- 직렬 (공유메모리 초과 방지)
  create index if not exists idx_tulip_emb_paper
    on semyung_tulip using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64)
    where kind = 'paper';
  update semyung_sync_state set last_result = 'idx_paper OK', last_run_at = now() where id = 1;
  begin
    perform cron.unschedule('tulip_idx_paper');              -- 자기 자신 해제
  exception when others then null;                           -- 실패해도 롤백되지 않게
  end;
  perform pg_advisory_unlock(884422);
end $$;

-- 🔑🔑 statement_timeout 해제는 반드시 **cron 명령의 별도 문장**으로 둘 것.
--   함수 안의 `set local statement_timeout=0`은 소용없다 — 120초 시계는 바깥 호출
--   `select _tulip_idx_paper()`에 이미 걸려 있어서, 안쪽 CREATE INDEX가 매번 정확히
--   120초에 잘린다(8/18 실측: cron.job_run_details가 2분마다 statement timeout으로 failed).
-- 3분 주기 + advisory lock = 빌드 중이면 다음 틱은 즉시 되돌아감(중복 빌드 없음).
select cron.schedule('tulip_idx_paper', '*/3 * * * *',
                     'set statement_timeout=0; select _tulip_idx_paper()');

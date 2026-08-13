@echo off
rem Semyung TULIP daily sync (03:30, task: BookstarTulipSync)
rem ASCII only in this file! cmd misparses UTF-8 Korean comments -> silent exit 1 (2026-08-07)
rem %~dp0 required (Korean path lesson). Log: logs\tulip_daily.log
chcp 65001 >nul
cd /d "%~dp0.."
if not exist logs mkdir logs

rem wait for network (boot/wake Wi-Fi delay, max 5 min)
set /a _try=0
:netwait
ping -n 1 lib.semyung.ac.kr >nul 2>&1
if %errorlevel%==0 goto netok
set /a _try+=1
if %_try% geq 10 (
  echo [%date% %time%] network unavailable - giving up >> logs\tulip_daily.log
  exit /b 1
)
timeout /t 30 /nobreak >nul
goto netwait
:netok

echo ===== [%date% %time%] tulip daily start ===== >> logs\tulip_daily.log
python -u scripts\tulip_sync.py --daily >> logs\tulip_daily.log 2>&1
rem New arrivals first: they are the very first thing a student sees in the app, but they
rem  used to sit in the same random md5(ctrl) pool as 200k+ books and share one budget, so
rem  on a day the big backfill ate the quota (2026-08-13) they got nothing at all.
rem  A dozen books/day = ~30 calls, so run it FIRST while both quotas are still full.
rem  It never stamps '' (see fresh_arrivals docstring) - a book missing from Aladin today
rem  must stay retryable tomorrow.
python -u scripts\tulip_sync.py --fresh >> logs\tulip_daily.log 2>&1
python -u scripts\tulip_sync.py --enrich-ebook >> logs\tulip_daily.log 2>&1
rem ebook covers (YES24 leftover, pool nearly empty - 0 targets on 2026-08-09); of daily 5000 Aladin limit
python -u scripts\tulip_sync.py --covers-yes24 --covers-budget 500 >> logs\tulip_daily.log 2>&1
rem new paper-book covers (Naver book DB, same source as OPAC) - recheck latest 300
python -u scripts\tulip_sync.py --covers-paper --covers-limit 300 >> logs\tulip_daily.log 2>&1
rem paper cover+desc backfill. 2026-08-09: Data4Library(info-naru) first, Aladin as fallback.
rem   info-naru : blurb 94-97%%, 30,000/day  (IP registered 2026-08-09 - re-register if PC/IP changes)
rem   Aladin    : blurb 70-77%%,  5,000/day hard cap
rem  Two pools, priority order, one shared budget:
rem   pri0 no cover (53k)  -> ~55%% cover hit; cover500 upscale for Aladin CDN urls
rem   pri1 cover but no blurb (162k) -> newest-first, blurb ~96%%
rem  28000 + 4200 => whole backfill in about 8 days (was 52 with Aladin only).
rem  Manual/verify: --desc-only (pri1 only) / --d4l-budget 0 (Aladin only)
rem resume loop: if the long backfill stage dies (kill/reboot/crash), wait 5 min and continue
rem  safe to rerun: info-naru daily quota is server-tracked, and since 2026-08-13 the script
rem  only stamps 'not found' on rows info-naru actually saw (no pool poisoning on rerun)
set /a _bftry=0
:backfill
rem 2026-08-13 ANSWERED: real cap is 30,000/day. The server itself says so:
rem   errCode=outOfMaxlimit "the daily cap is 30000 calls" (server says so in Korean)
rem The 48000 probe backfired - the script only knew the code 'outOflimit' (different
rem spelling!), so every post-limit reply looked like 'book not found' and ~19,000 books
rem got stamped 'no blurb' and dropped from the pool for good. Fixed in tulip_sync.py
rem (any errCode containing 'limit' now stops the run). Budget back to the true cap.
python -u scripts\tulip_sync.py --covers-paper-aladin --d4l-budget 30000 --covers-budget 4200 >> logs\tulip_daily.log 2>&1
if %errorlevel%==0 goto backfillok
set /a _bftry+=1
echo [%date% %time%] backfill died - resume attempt %_bftry% of 3 >> logs\tulip_daily.log
if %_bftry% geq 3 goto backfillok
timeout /t 300 /nobreak >nul
goto backfill
:backfillok
rem embeddings for new books only (embedding null = a dozen per day; after covers so Aladin desc included)
python -u scripts\tulip_sync.py --embed-ebook >> logs\tulip_daily.log 2>&1
python -u scripts\tulip_sync.py --embed-paper >> logs\tulip_daily.log 2>&1
echo ===== [%date% %time%] tulip daily end (exit %errorlevel%) ===== >> logs\tulip_daily.log

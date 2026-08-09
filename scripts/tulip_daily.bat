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
python scripts\tulip_sync.py --daily >> logs\tulip_daily.log 2>&1
python scripts\tulip_sync.py --enrich-ebook >> logs\tulip_daily.log 2>&1
rem ebook covers (YES24 leftover, pool nearly empty - 0 targets on 2026-08-09); of daily 5000 Aladin limit
python scripts\tulip_sync.py --covers-yes24 --covers-budget 500 >> logs\tulip_daily.log 2>&1
rem new paper-book covers (Naver book DB, same source as OPAC) - recheck latest 300
python scripts\tulip_sync.py --covers-paper --covers-limit 300 >> logs\tulip_daily.log 2>&1
rem paper cover+desc backfill (Aladin ISBN10/13). 2026-08-09: random order + Book-target-only
rem  = 1 call per book (was ~2) and 50%% hit (was 7.5%%). ~4200 books/day, pool 53.6k -> ~13 days.
rem  500 + 4200 = 4700 of the 5000/day Aladin cap.
python scripts\tulip_sync.py --covers-paper-aladin --covers-budget 4200 >> logs\tulip_daily.log 2>&1
rem embeddings for new books only (embedding null = a dozen per day; after covers so Aladin desc included)
python scripts\tulip_sync.py --embed-ebook >> logs\tulip_daily.log 2>&1
python scripts\tulip_sync.py --embed-paper >> logs\tulip_daily.log 2>&1
echo ===== [%date% %time%] tulip daily end (exit %errorlevel%) ===== >> logs\tulip_daily.log

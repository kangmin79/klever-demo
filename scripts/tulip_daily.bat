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
rem ebook covers (YES24 leftover ~460, budget small); of daily 5000 Aladin limit
python scripts\tulip_sync.py --covers-yes24 --covers-budget 800 >> logs\tulip_daily.log 2>&1
rem new paper-book covers (Naver book DB, same source as OPAC) - recheck latest 300
python scripts\tulip_sync.py --covers-paper --covers-limit 300 >> logs\tulip_daily.log 2>&1
rem paper cover+desc backfill (Aladin ISBN10/13, random match ~64%) - gradual ~18 days, rest of daily budget
python scripts\tulip_sync.py --covers-paper-aladin --covers-budget 3500 >> logs\tulip_daily.log 2>&1
rem embeddings for new books only (embedding null = a dozen per day; after covers so Aladin desc included)
python scripts\tulip_sync.py --embed-ebook >> logs\tulip_daily.log 2>&1
python scripts\tulip_sync.py --embed-paper >> logs\tulip_daily.log 2>&1
echo ===== [%date% %time%] tulip daily end (exit %errorlevel%) ===== >> logs\tulip_daily.log

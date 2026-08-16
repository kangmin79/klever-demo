@echo off
rem Cover mirror daily (07:00, task: BookstarCoverMirror)
rem ASCII only in this file! cmd misparses UTF-8 Korean comments -> silent exit (2026-08-07 lesson)
rem %~dp0 required (Korean path). Log: logs\cover_mirror.log
chcp 65001 >nul
cd /d "%~dp0.."
if not exist logs mkdir logs

rem wait for network (boot/wake Wi-Fi delay, max 5 min)
set /a _try=0
:netwait
ping -n 1 gkujptyfrzqrjrvovbnc.supabase.co >nul 2>&1
if %errorlevel%==0 goto netok
set /a _try+=1
if %_try% geq 10 (
  echo [%date% %time%] network unavailable - giving up >> logs\cover_mirror.log
  exit /b 1
)
timeout /t 30 /nobreak >nul
goto netwait
:netok

echo ===== [%date% %time%] cover mirror start ===== >> logs\cover_mirror.log
rem phase 1: download to PC only (fast, ~80/s). phase 2: gentle upload to cloud storage.
python -u scripts\cover_mirror.py --budget 250000 >> logs\cover_mirror.log 2>&1
rem 2026-08-16: ebooks too (new arrivals only after first full run; ~23k done). then rescue dead originals via ISBN.
python -u scripts\cover_mirror.py --kinds ebook --budget 30000 >> logs\cover_mirror.log 2>&1
python -u scripts\cover_rescue.py --kinds ebook >> logs\cover_mirror.log 2>&1
rem recover early-uploaded covers that predate local-save (one-time, cheap no-op afterwards)
python -u scripts\cover_mirror.py --pull-storage >> logs\cover_mirror.log 2>&1
rem local master copy: full bibliographic dump to Desktop\bookstar\data (few minutes)
python -u scripts\local_dump.py >> logs\cover_mirror.log 2>&1
rem phase 2: push local files to cloud storage (slow leg, resumes via cover_pushed)
python -u scripts\cover_mirror.py --push-storage --budget 250000 >> logs\cover_mirror.log 2>&1
rem ebook barcode aliases (screen asks covers/<barcode>.webp) - incremental, skips done
python -u scripts\cover_alias_ebook.py >> logs\cover_mirror.log 2>&1
echo ===== [%date% %time%] cover mirror end (exit %errorlevel%) ===== >> logs\cover_mirror.log

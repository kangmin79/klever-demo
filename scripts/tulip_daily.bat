@echo off
rem 세명대 튤립 신착 데일리 (매일 03:30, 작업 스케줄러 BookstarTulipSync)
rem %~dp0 필수 — 한글경로 침묵실패 교훈. 로그: logs\tulip_daily.log
chcp 65001 >nul
cd /d "%~dp0.."
if not exist logs mkdir logs

rem 네트워크 대기 (부팅/절전복귀 직후 Wi-Fi 미연결 대비, 최대 5분)
set /a _try=0
:netwait
ping -n 1 lib.semyung.ac.kr >nul 2>&1
if %errorlevel%==0 goto netok
set /a _try+=1
if %_try% geq 10 (
  echo [%date% %time%] 네트워크 불가 - 포기 >> logs\tulip_daily.log
  exit /b 1
)
timeout /t 30 /nobreak >nul
goto netwait
:netok

echo ===== [%date% %time%] tulip daily 시작 ===== >> logs\tulip_daily.log
python scripts\tulip_sync.py --daily >> logs\tulip_daily.log 2>&1
python scripts\tulip_sync.py --enrich-ebook >> logs\tulip_daily.log 2>&1
rem 예산 3000 = 일한도 5000 중 tulip-cover(종이책 lazy 표지) 여유분 2000 남김
python scripts\tulip_sync.py --covers-yes24 --covers-budget 3000 >> logs\tulip_daily.log 2>&1
rem 신착 종이책 표지(네이버 책DB, OPAC과 동일 소스) — 최근 300권만 재확인
python scripts\tulip_sync.py --covers-paper --covers-limit 300 >> logs\tulip_daily.log 2>&1
echo ===== [%date% %time%] tulip daily 끝 (exit %errorlevel%) ===== >> logs\tulip_daily.log

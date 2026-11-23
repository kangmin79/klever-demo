#!/bin/bash
# 북스타 세명대 — 표지·줄거리 채우기(--fresh)만 매일. Vultr 중계서버 /opt/bookstar/daily_fresh.sh
#   2026-11-23 배경: 주간 갱신 한 번에 정보나루 400건 한도(IP 미등록 1일 500)라 신착 500권의 줄거리를 한 주에 다 못 채웠다
#   (11/23 따라잡기: 112권 채우고 374권 남김 → 다음 월요일까지 공백). 이 단계는 학교 서버를 전혀 부르지 않으므로
#   (정보나루·우리 DB만) 학교의 "1주일 단위" 요청과 무관하게 매일 돌려도 된다.
#   cron: 30 4 * * 2-7  (화~일 04:30 KST. 월요일은 weekly.sh 안의 --fresh 가 돈다)
set -a; . /root/Desktop/hwik-web/.env; set +a
cd /opt/bookstar || exit 1
echo "===== $(date '+%F %T') daily-fresh start ====="
python3 -u scripts/tulip_sync.py --fresh --fresh-days 180 --d4l-budget 400 --covers-budget 1500 || echo "[daily-fresh] FAILED exit=$?"
echo "===== $(date '+%F %T') daily-fresh end ====="

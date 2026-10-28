#!/bin/bash
# 북스타 세명대 '우리도서관' 주 1회 갱신 — Vultr 중계서버(158.247.239.108)에서 돈다.
#   2026-10-28 사장님 지시("주 1회로 해줘 지금"). 학교(박주원) 요청 = 1주일 단위.
#   예전엔 사장님 PC 예약작업(Bookstar_Semyung_Sync·BookstarTulipSync, 8/27 정지)이 매일 돌렸다.
#   사장님 PC는 10월부터 학교 서버에 못 닿아 이 서버로 옮김. 설치 위치 /opt/bookstar, 로그 logs/weekly.log
#   cron: 0 4 * * 1  (매주 월요일 04:00 KST)
# 학교 서버를 부르는 단계 = ① --daily(도서관 openapi bookinfo, 신착 번호 순회, 0.3초 간격)
#                          ② --enrich-ebook(같은 openapi) ③ 대출 랭킹(OPAC 통계 페이지 2회)
#   나머지(--fresh 표지·줄거리, 임베딩, 랭킹 줄거리)는 알라딘·정보나루·OpenAI·우리 DB만 부른다.
# 뺀 단계: 매일 돌던 대량 표지·줄거리 백필(--covers-paper-aladin 3만 건/일) — 정보나루 IP 등록이 사장님 PC 기준이고
#   학교와 무관한 대량 작업이라 주간 갱신엔 넣지 않음. 필요하면 별도 결정.
set -a; . /root/Desktop/hwik-web/.env; set +a
cd /opt/bookstar || exit 1
PY=python3
echo "===== $(date '+%F %T') weekly start ====="
$PY -u scripts/tulip_sync.py --daily          || echo "[weekly] daily FAILED exit=$?"
$PY -u scripts/tulip_sync.py --fill-class     || echo "[weekly] fill-class FAILED exit=$?"
$PY -u scripts/tulip_sync.py --fresh --fresh-days 180 --d4l-budget 2000 --covers-budget 1500 || echo "[weekly] fresh FAILED exit=$?"
$PY -u scripts/tulip_sync.py --enrich-ebook   || echo "[weekly] enrich-ebook FAILED exit=$?"
$PY -u scripts/tulip_sync.py --embed-ebook    || echo "[weekly] embed-ebook FAILED exit=$?"
$PY -u scripts/tulip_sync.py --embed-paper    || echo "[weekly] embed-paper FAILED exit=$?"
$PY -u scripts/build_semyung_loan_rank.py     || echo "[weekly] loan-rank FAILED exit=$?"
node scripts/desc_loan_rank.mjs               || echo "[weekly] loan-rank-desc FAILED exit=$?"
echo "===== $(date '+%F %T') weekly end ====="

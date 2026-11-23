#!/bin/bash
# 북스타 세명대 '우리도서관' 주 1회 갱신 — Vultr 중계서버(158.247.239.108)에서 돈다.
#   2026-10-28 사장님 지시("주 1회로 해줘 지금"). 학교(박주원) 요청 = 1주일 단위.
#   예전엔 사장님 PC 예약작업(Bookstar_Semyung_Sync·BookstarTulipSync, 8/27 정지)이 매일 돌렸다.
#   사장님 PC는 10월부터 학교 서버에 못 닿아 이 서버로 옮김. 설치 위치 /opt/bookstar, 로그 logs/weekly.log
#   cron: 0 4 * * 1  (매주 월요일 04:00 KST)
# 학교 서버를 부르는 단계 = ① --daily(도서관 openapi bookinfo, 신착 번호 순회, 0.3초 간격)
#                          ② --enrich-ebook(같은 openapi) ③ 대출 랭킹(OPAC 통계 페이지 2회)
#   나머지(--fresh 표지·줄거리, 임베딩)는 정보나루·OpenAI·우리 DB만 부른다.
#   정보나루는 IP 미등록이면 1일 500건 → d4l-budget 400(Vultr IP 등록 전).
#   🛑 알라딘 OpenAPI 2026-10-30 전면 종료 → 폴백 없음(tulip_sync.aladin()은 즉시 빈손). 랭킹 표지·ISBN·줄거리는
#      semyung_tulip 조인으로(build_semyung_loan_rank.py 11/9). 랭킹 줄거리 단계(desc_loan_rank.mjs)는 은퇴.
# 뺀 단계: 매일 돌던 대량 표지·줄거리 백필(--covers-paper-aladin 3만 건/일) — 정보나루 IP 등록이 사장님 PC 기준이고
#   학교와 무관한 대량 작업이라 주간 갱신엔 넣지 않음. 필요하면 별도 결정.
# DB 쓰기(tulip_sync): 11/9부터 service_role→bx_exec_sql RPC(PAT 만료 무관). 로그 첫 줄 "[db] 경로:"로 확인.
set -a; . /root/Desktop/hwik-web/.env; set +a
cd /opt/bookstar || exit 1
PY=python3
echo "===== $(date '+%F %T') weekly start ====="
$PY -u scripts/tulip_sync.py --daily 2>&1 | tee /tmp/bx_daily_out.txt; [ "${PIPESTATUS[0]}" = 0 ] || echo "[weekly] daily FAILED exit=${PIPESTATUS[0]}"
# 11/23 사고 재발 방지: 신착 0건이면 폰 알림(ntfy). 11/9 이후 두 주 연속 "신착 0건"(빈 제어번호 구간)을 아무도 못 봤다.
#   학기 중 신착 0건은 비정상. 방학엔 0건이 정상일 수 있으니 알림 문구에 그렇게 적는다. NTFY_TOPIC 은 .env(휙과 공용).
if grep -q '신착 0건' /tmp/bx_daily_out.txt && [ -n "$NTFY_TOPIC" ]; then
  curl -s -m 15 -H "Title: Bookstar weekly" -d "세명대 신착 수집 0건 ($(date '+%m/%d')). 학기 중이면 수집 정지 의심 — /opt/bookstar/logs/weekly.log 확인" "https://ntfy.sh/$NTFY_TOPIC" > /dev/null || true
fi
$PY -u scripts/tulip_sync.py --fill-class     || echo "[weekly] fill-class FAILED exit=$?"
$PY -u scripts/tulip_sync.py --fresh --fresh-days 180 --d4l-budget 400 --covers-budget 1500 || echo "[weekly] fresh FAILED exit=$?"
$PY -u scripts/tulip_sync.py --enrich-ebook   || echo "[weekly] enrich-ebook FAILED exit=$?"
# 11/16 교보 전자책 웹뷰어 허용 판정(새 책 + app_only 30일 재판정) → app_only 면 학생 화면에서 숨김. 학교 서버 0.3초 간격.
$PY -u scripts/kyobo_webviewer_check.py       || echo "[weekly] kyobo-webviewer-check FAILED exit=$?"
$PY -u scripts/tulip_sync.py --embed-ebook    || echo "[weekly] embed-ebook FAILED exit=$?"
$PY -u scripts/tulip_sync.py --embed-paper    || echo "[weekly] embed-paper FAILED exit=$?"
$PY -u scripts/build_semyung_loan_rank.py     || echo "[weekly] loan-rank FAILED exit=$?"
echo "===== $(date '+%F %T') weekly end ====="

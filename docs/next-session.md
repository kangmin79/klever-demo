# 다음 세션 / 미팅 전 체크

## ⚠️ 관장님 미팅(다음 주) 전 반드시 확인 — GitHub Actions 자동 갱신
세명대 신착(전자책+종이책) 매일 자동 갱신 워크플로는 올렸으나, **비밀키 1개를 GitHub에 직접 넣어야 작동**.

**할 일 (미팅 전):**
1. github.com/kangmin79/klever-demo → Settings → Secrets and variables → Actions
2. New repository secret → Name: `SUPABASE_SERVICE_ROLE`, Secret: 클레버/api_keys.md 의 `SERVICE_ROLE=` 값
3. Actions 탭 → "세명대 신착 갱신" → **Run workflow** (수동 1회 실행)
4. ✅ 성공하면 매일 02:00 KST 자동. ❌ 실패(US IP 차단)면 → PC에서 `python scripts/build_semyung_new.py` + `build_semyung_new_paper.py` 직접 실행으로 폴백
5. 미팅 직전 앱(bookstar.co.kr/app.html → 우리 도서관)에서 신착 줄 최신인지 눈으로 확인

## 현재 상태 (6/25 완료)
- 세명대 신착 = `semyung_new` 테이블 318행(전자112 + 종이206), 앱에서 합쳐 304장 표시
- 전자책/종이책 태그 정확, 표지 누락 0, 종이책 '전자책 읽기' 오표기 수정
- 자세한 맥락: 메모리 project_bookstar_semyung_new

## 향후 (미팅 후)
- YES24 구독분(cttsDvsnCode 다름) 추가
- 사서가 신착 표시 권수 정하는 UI

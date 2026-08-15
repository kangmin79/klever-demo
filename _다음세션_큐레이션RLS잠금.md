# 다음 세션: 큐레이션 테이블 RLS 잠금 (2026-08-15 리뷰에서 확정)

## 문제 (실측 확인됨)
- `library_sections`(큐레이션 칸)·`library_programs`(챌린지/발행물)가 **anon 키로 INSERT/DELETE 전부 열림** (probe 201/204 확인, probe 행은 삭제 완료)
- anon 키는 학생 앱·관리자 페이지 소스에 공개돼 있음 → 누구나 학생 앱 서가·챌린지를 변조/삭제 가능
- 관리자 게이트(비번 bookstar)는 화면에 답이 적힌 데모용 — 방어력 없음
- 같은 계열 기존 발견: semyung_catalog RLS OFF, quiz_items public 쓰기 (project_bookstar_db_audit_20260712)

## ⚠️ 함정
**RLS만 잠그면 관리자 페이지도 같이 죽는다** — admin/index.html의 saveSections/saveChallenges가 같은 anon 키로 쓰기 때문.
잠금과 쓰기 경로 교체는 반드시 한 배포로 같이 가야 함.

## 권장 설계 (둘 중 택1)
1. **Edge Function 경유 (가벼움, 권장)**: `admin-save` Edge Function 신설
   - service_role로 library_sections/library_programs 쓰기
   - 요청에 관리자 시크릿(환경변수 ADMIN_SECRET) 요구 — admin 페이지 로그인 비번을 이것으로 교체(하드코딩 제거)
   - RLS: 두 테이블 anon은 SELECT만 허용, INSERT/UPDATE/DELETE 정책 제거
   - admin의 fetch 4곳 교체: saveSections upsert/DELETE, saveChallenges INSERT/DELETE
2. Supabase Auth 도입: 사서 계정 만들고 authenticated+is_admin 정책 — 더 정석이지만 배보다 배꼽

## 수정 지점 (admin/index.html)
- saveSections: `library_sections` POST(on_conflict=school,slot) + DELETE 루프
- saveChallenges: `library_programs` POST + DELETE(id=in.())
- 공지글(notices?)·발행물 저장도 같은 키로 쓰는지 전수 grep 필요: `method:'POST'|'DELETE'|'PATCH'` 전부
- 학생 앱(index.html)은 읽기 전용이라 anon SELECT만 남기면 무변경

## 검증 순서
1. Edge Function 배포 → admin 교체 → 저장/삭제/챌린지 E2E
2. anon으로 INSERT/DELETE probe → 401/403 확인
3. 학생 앱 큐레이션 로드 정상 확인 (SELECT 살아있는지)

시작 프롬프트: "큐레이션 RLS 잠금 이어서 — klever_demo/_다음세션_큐레이션RLS잠금.md 보고"

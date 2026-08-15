# ✅ 완료: 큐레이션 테이블 RLS 잠금 (2026-08-15)

## 결과
- `library_sections`·`library_programs` — anon 쓰기 정책(write/update/delete) 전부 drop, **read만 유지**
- anon INSERT probe → 42501 차단 확인 (양 테이블). anon DELETE → 0행 필터 확인. anon SELECT → 정상 (학생 앱 무변경)
- 쓰기는 **admin-save Edge Function** 경유만 가능 (service_role + ADMIN_SECRET 검증)
  - op 5종: ping / sections_upsert / sections_delete / programs_insert / programs_delete
  - E2E 통과: sections upsert 201→재upsert 200(merge)→delete 204, programs insert→delete→소멸 확인
- admin/index.html: 쓰기 5곳 adminSave() 교체 + 로그인 게이트를 ADMIN_SECRET ping 검증으로 교체 (하드코딩 `bookstar` 비번·화면 힌트 제거)
- 관리자 비밀번호 = Supabase 시크릿 ADMIN_SECRET (변경: `supabase secrets set ADMIN_SECRET=새값` 후 재배포 불필요, 즉시 반영)
- 커밋: c95e446

## 남은 같은 계열 (후속 — 이번 범위 밖)
- admin이 여전히 anon으로 쓰는 테이블: `library_notices`, `minsong_popups`, `library_books`, `bookstar_writings`(PATCH), `community_posts`, `reviews`(DELETE) — 열려 있는지 실측 후 같은 패턴(admin-save op 추가)으로 잠글 것
- 구 발견: semyung_catalog RLS OFF, quiz_items public 쓰기 (project_bookstar_db_audit_20260712)

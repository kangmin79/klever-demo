/* ═══ 테스트 계정 + 챌린지 결과 서버 저장 (bookstar_students / bookstar_challenge_results) ═══ */
// (BX_H 는 js/00-config.js — 9/2 S7-4. 아무도 안 쓰던 BX_SB 는 지움)
// 8/9 데모 학생 5명(s1~s5) 삭제 — DB 기록까지 전부 정리(백업: 세명대_자료/_데모학생5명_삭제전_백업_20260809.json).
// 이제 계정은 세명대 SSO(도서관 배너)로만 생긴다. 배열은 이름/학과 보강용 폴백이라 비워서 유지.
const BX_STUDENTS = [];
// ── 학생 식별 단일 진입점 (SSO 연결 지점) ──
// 세명대 SSO 붙는 날: 로그인 성공 후 window.__SSO_STUDENT = {id, name, emoji, dept} 를 세팅하면
// bxStudent()를 쓰는 앱 전역(40여 곳)이 전부 그 학생으로 동작한다(다른 코드 무변경).
// 데모에선 __SSO_STUDENT 미설정 → 아래 localStorage 데모 계정으로 폴백.
function bxStudent(){
  try{ if(window.__SSO_STUDENT && window.__SSO_STUDENT.id) return window.__SSO_STUDENT; }catch(e){}
  try{ return JSON.parse(localStorage.getItem('bookstar-current-student')||'null'); }catch(e){ return null; }
}
function bxSetStudent(s){ try{ localStorage.setItem('bookstar-current-student', JSON.stringify(s)); }catch(e){} try{ bxEnsureStudentRow(s); }catch(e){} }
function _bxSid(){ const s=bxStudent(); return s?s.id:'guest'; }
// 8/29 인생책·프로필 저장 수리: 학생 정보 줄(bookstar_students)이 서버에 없으면 만들어 둔다.
//   8/9 데모 학생 5명을 지우면서 "줄을 만드는 유일한 경로"가 같이 사라졌고, 그 뒤 로그인은 브라우저에만 학생을 기억했다.
//   인생책·프로필 저장은 "그 줄을 고치는" 방식이라 줄이 없으면 0건 수정 = 서버는 성공(204)이라 답하고 아무것도 안 남았다.
//   ignore-duplicates = 없을 때만 만든다(이미 있으면 이름·이모지 등 아무것도 덮어쓰지 않음). 실패해도 앱 동작엔 영향 없음.
function bxEnsureStudentRow(s){
  if(!s||!s.id) return;
  const row={id:String(s.id), name:String(s.name||s.id), school_id:CH_SCHOOL};
  if(s.emoji) row.emoji=s.emoji;
  sbWrite('POST',`/bookstar_students?on_conflict=id`,row,
    {prefer:'resolution=ignore-duplicates,return=minimal'}).catch(()=>{});   // 8/29 본인 세션으로(익명 키는 이제 못 씀)
}


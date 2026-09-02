/* ====== 초기화 ====== */
// 8/13 앱 관리 숨김 — 예전에 앱 모드로 두고 나간 사람이 들어오면 버튼도 없는 화면에 갇힌다.
// 저장값이 app이어도 웹 관리로 돌려놓는다. (앱 관리를 되살릴 땐 아래 한 줄을 원래대로)
try{ if(localStorage.getItem('bs_admin_mode')==='app') setMode('web'); }catch(e){}
rtInit('ntBodyRich','공지 내용을 입력하세요. 위 도구로 굵게·소제목·목록·인용·링크·이미지를 넣을 수 있어요.');
rtInit('cmBodyRich','내용을 입력하세요 (선택). 굵게·색·목록·표·링크·이미지·파일 등을 넣을 수 있어요.');
buildNtLoc();
initDashDates(); dbSum();   // 8/17 시안: 첫 화면(대시보드)은 집계를 부르지 않고 기간·시트 요약 줄만
renderChallenges();
loadSections();
loadServerPrograms();
loadChallenges();
loadNotices();
loadInventory();

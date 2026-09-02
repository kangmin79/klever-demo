/* ====== 헬퍼 ====== */
const el=id=>document.getElementById(id);
const esc=s=>(s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>(n||0).toLocaleString();
function toast(m){const t=el('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600);}
function gtag(t){const k=t==='큐레이션'?'cur':t==='고전챌린지'?'clas':'chal';
  const lbl=t==='큐레이션'?'큐레이션':t==='고전챌린지'?'고전챌린지':'챌린지';return `<span class="gtag ${k}">${lbl}</span>`;}
// Supabase 주소·키(SB_REST·SB_PROJ·ADMIN_FN·anon 키=COVER_ANON)는 학생과 공유 → ../js/00-config.js (9/2 S8-3)
// 호출은 전부 ../js/04-api.js 창구를 거친다 — 관리자는 익명 갈래만(sbGetAnon·sbWrite({anon})·sbFnPost({anon})·sbUpload)
const RT_BUCKET="notice-images";
function adminSecret(){try{return sessionStorage.getItem('bs_admin_secret')||'';}catch(e){return '';}}
function adminSave(payload){
  return sbFnPost(ADMIN_FN, Object.assign({secret:adminSecret()},payload), {anon:true});
}


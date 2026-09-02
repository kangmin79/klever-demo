/* ====== 헬퍼 ====== */
const el=id=>document.getElementById(id);
const esc=s=>(s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>(n||0).toLocaleString();
function toast(m){const t=el('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2600);}
function gtag(t){const k=t==='큐레이션'?'cur':t==='고전챌린지'?'clas':'chal';
  const lbl=t==='큐레이션'?'큐레이션':t==='고전챌린지'?'고전챌린지':'챌린지';return `<span class="gtag ${k}">${lbl}</span>`;}
// Supabase — 발행물(library_programs) + 우리도서관 카테고리(library_sections)
const SB_REST="https://gkujptyfrzqrjrvovbnc.supabase.co/rest/v1";
const SB_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc";
const SB_PROJ="https://gkujptyfrzqrjrvovbnc.supabase.co";
const RT_BUCKET="notice-images";
// 큐레이션 쓰기 프록시 — library_sections·library_programs는 anon 쓰기 정책이 잠겨 이 함수만 쓸 수 있다 (2026-08-15)
const ADMIN_FN=SB_PROJ+"/functions/v1/admin-save";
function adminSecret(){try{return sessionStorage.getItem('bs_admin_secret')||'';}catch(e){return '';}}
function adminSave(payload){
  return fetch(ADMIN_FN,{method:'POST',
    headers:{apikey:SB_ANON,Authorization:'Bearer '+SB_ANON,'content-type':'application/json'},
    body:JSON.stringify(Object.assign({secret:adminSecret()},payload))});
}


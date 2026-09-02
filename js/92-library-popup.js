/* ── 사서 팝업 (minsong_popups — 관리자 '팝업 관리'에서 발행, 앱과 같은 테이블·팝업당 한 번만) ── */
(async function(){
  try{
    const r=await fetch(`${SB_REST}/minsong_popups?select=id,title,body,target,starts_at,ends_at&active=is.true&channel=in.(web,both)&order=created_at.desc&limit=20`,
      {headers:{apikey:COVER_ANON,Authorization:'Bearer '+COVER_ANON}});
    if(!r.ok) return;
    const rows=await r.json();
    let seen=[]; try{ seen=JSON.parse(localStorage.getItem('ms_seen_popups')||'[]'); }catch(e){}
    // 한국 날짜로 비교 — toISOString은 UTC라 자정~오전 9시에 어제로 계산되는 버그 방지
    const today=new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
    const p=(rows||[]).find(x=>{
      if(seen.includes(x.id))return false;
      if(x.starts_at&&today<x.starts_at)return false;
      if(x.ends_at&&today>x.ends_at)return false;
      if(x.target==='login'&&!ssoToken())return false;
      if(x.target==='overdue'||x.target==='charm0')return false;   // 앱 전용 조건 — 웹에선 안 띄움
      return true;
    });
    if(!p) return;
    const pe=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(25,31,40,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:28px';
    ov.innerHTML=`<div style="background:#fff;border-radius:20px;padding:24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#b8902f;margin-bottom:8px">민송도서관</div>
      <div style="font-size:17px;font-weight:800;color:#1f2430;line-height:1.45">${pe(p.title)}</div>
      ${p.body?`<div style="color:#4e5968;font-size:13.5px;line-height:1.55;margin-top:10px;white-space:pre-line">${pe(p.body)}</div>`:''}
      <button id="msPpOk" style="margin-top:18px;width:100%;background:#1f2430;color:#fff;border:0;border-radius:14px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">확인</button></div>`;
    document.body.appendChild(ov);
    document.getElementById('msPpOk').onclick=()=>{
      try{ seen.push(p.id); localStorage.setItem('ms_seen_popups',JSON.stringify(seen.slice(-50))); }catch(e){}
      ov.remove();
    };
  }catch(e){}
})();

/* ═══════════════════════════════════════════════════════════
   휙 허브 (내서재)
   ═══════════════════════════════════════════════════════════ */
const HUB_NODES = [
  {key:'continue',    icon:'bookOpen', label:'이어 읽기',    angle:-90, badge:'1'},
  {key:'library',     icon:'library',  label:'컬렉션',       angle:-30, badge:''},
  {key:'program',     icon:'sparkles', label:'프로그램',     angle:30,  badge:'3', alert:true},
  {key:'challenge',   icon:'target',   label:'챌린지',       angle:90,  badge:'5/12'},
  {key:'score',       icon:'trophy',   label:'점수·뱃지',    angle:150, badge:''},
];

function renderHomeHub(){
  const v = document.getElementById('hubVisualHome');
  const hc = document.getElementById('hubCenterHome');
  if(!v || !hc) return;

  const VW=800, VH=700, RADIUS_X=372, RADIUS_Y=300;
  const cx=VW/2, cy=VH/2;

  hc.innerHTML = buildCenterCard();

  let svg='', html='';
  HUB_NODES.forEach(n=>{
    const rad = n.angle*Math.PI/180;
    const nx = cx + RADIUS_X*Math.cos(rad);
    const ny = cy + RADIUS_Y*Math.sin(rad);
    svg += `<line class="hub-line" x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}"/>`;
    ['t3','t2','t1'].forEach((s,i)=>svg+=`<circle class="pulse-${s}" id="p${s}-${n.key}" cx="${cx}" cy="${cy}" r="${6-i}"/>`);
    svg += `<circle class="pulse-head" id="ph-${n.key}" cx="${cx}" cy="${cy}" r="3.5"/>`;
    const badgeCls = n.alert ? 'alert' : '';
    const badge = n.badge ? `<span class="hub-node-badge ${badgeCls}">${n.badge}</span>` : '';
    html += `<div class="hub-node" data-key="${n.key}" style="left:${(nx/VW*100).toFixed(1)}%;top:${(ny/VH*100).toFixed(1)}%;" onclick="onHubNode('${n.key}')">
      <div class="hub-node-inner">
        <span class="hub-node-icon">${ic(n.icon)}</span>
        <span class="hub-node-label">${esc(n.label)}</span>${badge}
      </div>
    </div>`;
  });

  document.getElementById('hubLinesHome').innerHTML = svg;
  v.querySelectorAll('.hub-node').forEach(el=>el.remove());
  v.insertAdjacentHTML('beforeend', html);
  v.querySelectorAll('.hub-node').forEach((el,i)=>{
    setTimeout(()=>el.classList.add('appear'), 30+i*40);
    el.addEventListener('mouseenter',()=>pulseStart(el.dataset.key));
    el.addEventListener('mouseleave',()=>pulseStop(el.dataset.key));
  });

  startIdlePulse();
}

// 중앙 통합 카드 — 학생 요약 + 이번 주 챌린지 (홈 동기 장치)
function buildCenterCard(){
  const q = QUEST.find(x=>x.current) || QUEST.find(x=>!x.done) || QUEST[0];
  const book = q ? (BOOKS.find(b=>b.id===q.id) || BOOKS.find(b=>b.title===q.book)) : null;
  const prog = (book && book.progress) ? book.progress : 0;
  const openArg = book ? book.id : '';
  // 자유 독서(진행 중) 권수 — 챌린지 도서 제외
  const reading = BOOKS.filter(b => b.progress>0 && b.progress<100 && (!book || b.id!==book.id));
  const others = reading.length;
  return `
    <div class="cc-head" onclick="event.stopPropagation();nav('mypage')">
      <span class="cc-name">${esc(Student.name)}</span>
      <span class="cc-stat">${ic('flame','cc-flame-ic')} ${Student.streak}일 · ${Student.score.toLocaleString()}점</span>
    </div>
    <div class="cc-week">${q ? q.week+'주차 · 이번 주 지정 도서' : '이번 주 챌린지'}</div>
    <div class="cc-book">${esc(q ? q.book : '—')}</div>
    <div class="cc-author">${book ? esc(book.author)+' · '+esc(book.category) : '고전 챌린지'}</div>
    <div class="cc-progress"><div class="cc-progress-fill" style="width:${prog}%"></div></div>
    <div class="cc-deadline">완독 ${prog}% · ⏰ 내일 23:59까지 <b>+500점</b></div>
    <button class="cc-cta" onclick="event.stopPropagation();${openArg?`openViewer('${openArg}','challenge')`:`nav('mypage')`}">${ic('bookOpen','cc-cta-ic')} 이어서 읽고 미션 완료</button>
    ${others>0 ? `<div class="cc-others" onclick="event.stopPropagation();nav('mypage')">+ 다른 ${others}권 이어읽는 중 →</div>` : ''}
  `;
}

let pulseRaf=null;
function pulseStart(key){
  const n = HUB_NODES.find(x=>x.key===key); if(!n) return;
  const fx=400, fy=350, R=320;
  const rad = n.angle*Math.PI/180;
  const tx = fx+R*Math.cos(rad), ty = fy+R*Math.sin(rad);
  const els = ['ph','pt1','pt2','pt3'].map(p=>document.getElementById(`${p}-${key}`));
  els.forEach(e=>{if(e)e.classList.add('on');});
  const t0=performance.now(), dur=500, delays=[0,40,90,150];
  const anim=now=>{
    els.forEach((e,i)=>{
      if(!e) return;
      const t = Math.max(0, Math.min((now-t0-delays[i])/dur, 1));
      const ease = t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2, 3)/2;
      e.setAttribute('cx', fx+(tx-fx)*ease);
      e.setAttribute('cy', fy+(ty-fy)*ease);
    });
    if((now-t0-delays[3])/dur<1) pulseRaf=requestAnimationFrame(anim);
    else{
      els.forEach(e=>{if(e){e.setAttribute('cx',fx);e.setAttribute('cy',fy);}});
      setTimeout(()=>{if(document.querySelector(`.hub-node[data-key="${key}"]:hover`)) pulseStart(key);}, 200);
    }
  };
  pulseRaf=requestAnimationFrame(anim);
}
function pulseStop(key){
  if(pulseRaf){cancelAnimationFrame(pulseRaf); pulseRaf=null;}
  ['ph','pt1','pt2','pt3'].forEach(p=>{
    const e=document.getElementById(`${p}-${key}`);
    if(e) e.classList.remove('on');
  });
}

function onHubNode(key){
  if(key==='continue'){ openViewer('gunju','challenge'); }
  else if(key==='library'){ nav('collection'); }
  else if(key==='program'){ openProgramModal(); }
  else if(key==='score'){ nav('mypage'); }
  else if(key==='challenge'){ nav('mypage'); }
}

function openProgramModal(){
  document.getElementById('programModal').classList.add('open');
}
function closeProgramModal(){
  document.getElementById('programModal').classList.remove('open');
}

// 유휴 시 순차 펄스 (휙 hub-new 패턴)
let idleTimer=null, idleSeq=0;
function startIdlePulse(){
  resetIdle();
  ['mousemove','keydown','click','scroll'].forEach(ev=>{
    document.removeEventListener(ev, resetIdle);
    document.addEventListener(ev, resetIdle);
  });
}
function resetIdle(){
  clearTimeout(idleTimer); idleSeq=0;
  idleTimer = setTimeout(triggerIdle, 5000);
}
function triggerIdle(){
  const ph=document.getElementById('page-home'); if(!ph || !ph.classList.contains('active')) return;
  if(document.getElementById('viewerOverlay').classList.contains('open')) return;
  const node = HUB_NODES[idleSeq % HUB_NODES.length];
  pulseStart(node.key);
  setTimeout(()=>pulseStop(node.key), 700);
  idleSeq++;
  idleTimer = setTimeout(triggerIdle, 1600);
}



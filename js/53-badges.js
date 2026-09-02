/* ═══════════════════════════════════════════════════════════
   뱃지 / 내가 읽은 책
   ═══════════════════════════════════════════════════════════ */
function renderBadges(){
  const el = document.getElementById('badgeGrid');
  if(!el) return;
  el.innerHTML = BADGES.map(b=>`
    <div class="badge-card ${b.unlocked?'':'locked'}">
      <div class="badge-icon">${b.unlocked?b.icon:'🔒'}</div>
      <div class="badge-name">${esc(b.name)}</div>
      <div class="badge-desc">${esc(b.desc)}</div>
    </div>
  `).join('');
}

/* (8/29 별 포인트 폐지 — 리더보드 페이지·함수 삭제) */


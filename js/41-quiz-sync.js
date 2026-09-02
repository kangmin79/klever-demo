/* ═══ DB 퀴즈 ↔ 왼쪽 본문 동기화 — 장면별 자동 점프·형광펜 (앵커: 본문 정확 일치 문장) ═══ */
const SCENE_ANCHORS = {
 "gb-74222": [   // 데미안 — 10장면(scene_no 1~10) 시작 문장(BODIES_TRANS 정확 일치)
  "내 누이들 또한 밝은 세계에 속했다.",
  "나는 프랑크 크로머를 잘 알았고",
  "얼마 전 우리 라틴어 학교에 새 아이가 하나 들어왔다.",
  "이마에 표를 지니고 다닌 카인 이야기, 그렇지?",
  "데미안은 같은 학년 아이들과 함께 견진성사를 받지 않았고",
  "나는 그녀에게 베아트리체라는 이름을 붙였으니",
  "새는 알을 깨고 나오려 싸운다. 알은 세계다.",
  "피스토리우스, 부목사",
  "나를 에바 부인이라 부르는",
  "아직 프랑크 크로머를 기억하나?"
 ],
 "gb-1342": [   // 오만과 편견 — 10장면 시작 문장(번역본 정확 일치, 단조 증가)
  "그의 친구 다아시 씨는 곧 좌중의 시선을 끌었다",
  "그만하면 봐줄 만하군. 하지만 내 마음을 끌 만큼 아름답진 않아",
  "데니 씨가 곧장 그들에게 말을 걸며, 자기 친구 위컴 씨를 소개하게 해 달라고 청했다",
  "하지만 저로서는 거절하는 것 말고는 달리 도리가 없네요",
  "저는 헛되이 애써 왔습니다. 소용이 없더군요",
  "이 편지를 받으시고, 지난밤 당신께 그토록 역겨웠던",
  "엘리자베스는 마차가 달려가는 동안 펨벌리 숲이 처음으로 모습을 드러내기를",
  "리디아가 그의 장교 중 한 사람과 스코틀랜드로 달아났다는 거야",
  "그분은 그들을 찾아내기까지 며칠을 런던에서 보냈지만, 우리에게는 없던 단서가 그분에게는 있었어",
  "제 애정과 소망은 변함이 없습니다"
 ],
 "gb-2554": [   // 죄와 벌 — 10장면(번역본 정확 일치). #7 스비드리가일로프가 #8 소냐 고백보다 본문 뒤(원작 6부) — 정상
  "나라면 그 빌어먹을 늙은이를 죽이고 돈을 털어 달아날 수 있어",
  "도끼의 무딘 등을 그녀의 머리에 내리쳤다",
  "이미 잠 속에서 한참 전부터 시작된 열병에서 비롯된 것이었다",
  "땅바닥에는 마차에 치인 한 사내가 의식을 잃은 듯 피투성이가 된 채 누워 있었다",
  "한동안 당신이 여기 오기를 기다리고 있었거든요",
  "나사로를 살리는 대목 말이오. 그걸 찾아 주시오, 소냐",
  "그는 스비드리가일로프에게 서둘러 갔다",
  "누가 리자베타를 죽였는지 당신에게 말해 주겠다고",
  "스비드리가일로프는 방아쇠를 당겼다",
  "노파 전당포 주인과 그 동생 리자베타를 도끼로 죽이고 물건을 훔친 건 바로 저였습니다"
 ],
 "gb-2701": [   // 모비딕 — 주제 장면(줄거리순 아님). 각 주제 대표 대목(번역본 정확 일치)
  "나를 이슈메일이라 불러 다오.",
  "이제부터 우리는 부부가 된 거라고 말했다.",
  "그자는 이 금화 한 닢을 차지하리라, 제군들!",
  "가디너 선장, 나는 그리할 수 없소.",
  "뱀 같은 불꽃이 문 밖으로 굽이치며 날름거려 그들의 발을 붙잡으려 들었다.",
  "온갖 아름다움이 내게는 고통이니, 나는 결코 그것을 누릴 수 없는 까닭이다.",
  "저 흰 불꽃은 다름 아닌 흰 고래(White Whale)에게로 가는 길을 밝혀 주는 것이다!",
  "스타벅은 천사와 씨름하는 듯했다.",
  "그는 그 사나운 작살을, 그리고 그보다 훨씬 더 사나운 저주를 미운 고래에게 던져 박았다.",
  "그 관에 떠받쳐진 채로, 거의 꼬박 하루 낮과 밤 동안, 나는 부드럽고 만가(輓歌) 같은 바다 위를 떠다녔다."
 ],
 "gb-64317": [   // 위대한 개츠비 — 10장면 시작 문장(번역본 정확 일치, 단조 증가)
  "작고 아득한, 어느 부두 끝일 법한 초록 불빛 하나",
  "이곳은 재의 골짜기다",
  "파티가 시작된 것이다",
  "정말이지 너를 다시 보게 돼서 너무너무 기뻐",
  "제임스 개츠—그것이 정말로, 적어도 법적으로는 그의 이름이었다",
  "당신은 마이어 울프심 패거리 중 하나야",
  "잠시 후 그녀가 두 손을 휘저으며 소리를 지르고 황혼 속으로 뛰쳐나왔다",
  "데이지가 잠자리에 들 때까지 여기서 기다리겠네",
  "개츠비는 매트리스를 어깨에 둘러메고 수영장으로 향했다",
  "그러나 소용없는 일이었다. 아무도 오지 않았다"
 ]
};
/* 결정적 장면 배경 설명 — 카드 모드(한 문제씩 넘기기) 왼쪽용. 맥락은 주되 정답은 흘리지 않게 작성 */
const SCENE_DESC = {
 "gb-64317": [
  "닉이 개츠비를 처음 목격하는 밤, 개츠비는 만(灣) 건너편에서 반짝이는 작은 초록 불빛을 향해 어둠 속에서 홀로 팔을 뻗는다. 그 불빛은 단순한 등불이 아니라, 개츠비가 오래도록 손 뻗어 온 어떤 꿈—되찾고 싶은 과거이자 이상—의 상징이다. 그는 빛을 그저 바라보는 데 그치지 않고, 그것에 닿기 위해 자신의 삶 전체를 걸기로 이미 마음먹은 사람이다. 소설을 여는 이 장면은 앞으로 펼쳐질 모든 이야기가 결국 이 ‘닿을 수 없는 갈망’에서 비롯됨을 예고한다. 우리도 저마다 손에 잡히지 않는 무언가를 바라보며 산다—그 갈망이 나를 앞으로 나아가게 하는지, 아니면 닿을 수 없는 것에 붙들어 두는지, 개츠비의 뻗은 손은 그 질문을 던진다.",
  "웨스트에그에서 뉴욕으로 가는 길목에는 잿빛 재가 산처럼 쌓인 황량한 골짜기가 놓여 있다. 화려한 부자들의 저택과 극명하게 대비되는 이 잿빛 땅은, 그 화려함을 떠받치느라 타 버리고 버려진 삶들을 상징한다. 낡은 광고판 위 거대한 두 눈이 이 황무지를 말없이 내려다보는데, 작가는 신도 도덕도 흐릿해진 시대를 이 텅 빈 시선으로 그려 낸다. 눈부신 앞면과 잿빛 뒷면을 나란히 놓아, 부의 화려함이 무엇을 대가로 치르는지 묻는 것이다. 누군가의 성공 뒤에는 대개 눈에 띄지 않는 그늘이 있다—우리는 앞면만 보고 그 값을 치르는 뒷면은 얼마나 자주 잊는가.",
  "개츠비의 대저택에서는 여름밤마다 초대장 없이도 수백 명이 몰려드는 성대한 파티가 열린다. 넘치는 음악과 술과 웃음은 눈부시게 화려하지만, 정작 그 한가운데 있어야 할 주인은 어디에도 잘 보이지 않는다. 사람들은 개츠비가 누구인지, 어떻게 그 많은 부를 쌓았는지 온갖 소문만 주고받을 뿐, 그를 알려 하지도 고마워하지도 않는다. 작가는 이 북적임을 통해 오히려 한 사람의 깊은 외로움을 그린다. 수많은 팔로워와 ‘좋아요’ 속에서도 정작 나를 아는 사람은 없을 때의 공허—그 감각은 2026년에 더 익숙하다.",
  "오랜 세월이 흐른 뒤, 개츠비는 닉의 조용한 주선으로 데이지와 다시 마주 앉는다. 처음에는 숨 막히는 어색함과 긴장된 침묵이 흐르지만, 곧 억눌러 온 감정이 되살아난다. 개츠비가 그토록 많은 부와 저택과 파티를 쌓아 올린 진짜 이유가 바로 이 순간을 위해서였음이 서서히 드러난다. 그러나 그가 되찾으려는 것은 한 사람이라기보다 ‘그때 그 시절’ 자체다—작가는 흘러간 시간을 그대로 되돌릴 수 있다는 믿음이 얼마나 위태로운지 보여 준다. 지나간 순간을 완벽히 되돌릴 수 있다고 믿을 때, 우리는 지금의 무엇을 잃게 될까.",
  "개츠비의 화려한 이름과 근사한 신분은 사실 그가 스스로 지어낸 것이다. 가난한 집안에서 태어난 한 소년이 자신의 초라한 과거를 지우고, 이상적으로 상상한 새로운 인물로 다시 태어났다. 그는 아주 어린 나이에 이미 자신을 완전히 새로 발명하기로 결심했고, 남은 삶을 그 상상을 현실로 만드는 데 바쳤다. ‘누구나 노력하면 원하는 사람이 될 수 있다’는 아메리칸 드림의 눈부신 빛과, 진짜 나를 지워야만 했던 그 그림자가 한 인물 안에 겹쳐 있다. 꾸며 낸 이미지와 진짜 나 사이에서, 우리는 지금 어디쯤 서 있을까.",
  "무더운 여름날 뉴욕의 한 호텔 방, 겉으로 눌려 있던 인물들의 긴장이 마침내 터진다. 한 인물이 개츠비의 부가 어디서 왔는지, 그 떳떳지 못한 뒷세계를 들춰내며 그를 몰아세운다. 완벽해 보이던 개츠비의 이미지에 금이 가고, 그 사이에서 데이지의 마음도 흔들린다. 작가는 이 대치를 통해, 아무리 잘 쌓아 올린 이미지도 결정적 순간에는 ‘진짜’가 무엇인지 시험받는다는 것을 보여 준다. 위기 앞에서 사람은 자신이 가장 원한다고 믿었던 것을 정말로 택할 수 있을까.",
  "뉴욕에서 돌아오는 밤, 잿빛 골짜기에서 한 여자가 어둠 속으로 달려 나오다 자동차에 치이는 비극이 벌어진다. 우연처럼 보이는 이 사고는 사실 인물들이 오래 쌓아 온 거짓과 욕망이 끝내 터져 버린 결과다. 그 순간 누가 운전대를 잡고 있었는지, 그리고 누가 그 책임을 대신 떠안기로 하는지가 이후의 이야기를 돌이킬 수 없는 파국으로 몰아간다. 작가는 잘못을 저지른 사람과 그 대가를 치르는 사람이 어긋나는 구조를 냉정하게 드러낸다. 책임이 엉뚱한 곳으로 넘어갈 때, 우리 사회는 그것을 과연 정의라 부를 수 있을까.",
  "사고가 있던 밤, 개츠비는 데이지의 집 밖 어둠 속에 홀로 서서 밤을 지새운다. 그는 여전히 그녀를 지키려 하지만, 환하게 불 밝힌 집 안의 두 사람은 이미 그와는 다른 쪽으로 마음을 정하고 있다. 개츠비는 자신이 지키는 것이 이미 자신을 떠났다는 사실을 끝내 인정하지 못한다. 작가는 이 헛된 파수를 통해, 상대의 마음이 떠난 자리를 홀로 지키는 사랑의 쓸쓸함을 그려 낸다. 상대는 이미 마음을 접었는데 나 혼자 문 앞을 지키던 밤—헌신과 미련은 대체 어디서 갈라지는 걸까.",
  "여름 내내 한 번도 쓰지 않던 수영장으로 개츠비가 향한다. 그는 끝내 걸려 오지 않을 전화를 기다리며 여름의 마지막을 맞는다. 그토록 화려하고 시끌벅적했던 삶이 가장 조용하고 쓸쓸한 방식으로 매듭지어진다. 작가는 한 사람의 꿈이 무너지는 순간을 요란하게가 아니라 이렇게 고요하게 그려, 그 허무를 더 깊게 만든다. 우리가 평생 좇던 것이 결국 오지 않을 때, 그 오랜 기다림은 무엇으로 남을까.",
  "살아 있을 때 그의 파티에 구름처럼 몰려들던 수백 명 가운데, 마지막 자리에 나타난 사람은 거의 없었다. 텅 빈 그 자리는 개츠비를 둘러쌌던 눈부신 화려함이 얼마나 허망한 것이었는지를 말없이 증언한다. 화려할 때 곁을 채우던 이들과, 끝까지 남은 몇 안 되는 이들이 이 자리에서 선명하게 갈린다. 작가는 이 빈자리를 통해 한 시대의 꿈과 그 꿈이 배신당하는 방식을 응축해 보여 준다. 내가 사라진 뒤 정말로 남는 관계는 어떤 것일지, 이 빈자리는 우리에게 조용히 되묻는다."
 ]
};
let _scnIO=null, _scnCur=-1, _scnMarkP=null;
let _scnDbAnchors=null;   // DB(bookstar_quiz_items.anchor)에서 받은 장면 앵커 — 하드코딩 없는 신규 책용(143권 확장)
function _scnAnchors(){ return (currentBook && SCENE_ANCHORS[currentBook.id]) || _scnDbAnchors; }
function _scnClearMark(){
  if(!_scnMarkP) return;
  const p=_scnMarkP; _scnMarkP=null;
  if(p.classList) p.classList.remove('scn-flash');
  const m=p.querySelector && p.querySelector('mark.bx-hl');
  if(m){ m.replaceWith(document.createTextNode(m.textContent)); p.normalize&&p.normalize(); }
  if(p.querySelectorAll) p.querySelectorAll('span.psent.scn-hl').forEach(s=>s.classList.remove('scn-hl'));
}
function _scnSyncTo(sceneNo){
  const anchors=_scnAnchors(); if(!anchors) return;
  const phrase=anchors[sceneNo-1]; if(!phrase) return;
  if(sceneNo===_scnCur && _scnMarkP) return;
  const left=document.querySelector('.viewer-pane.left'); if(!left) return;
  const ps=left.querySelectorAll('p'); if(!ps.length) return;   // 본문 아직 로딩 중
  let target=null;
  for(const p of ps){ if((p.textContent||'').includes(phrase)){ target=p; break; } }
  if(!target) return;
  _scnCur=sceneNo; _scnClearMark();
  const eh=esc(phrase); let marked=false;
  if(target.innerHTML.includes(eh)){   // 단일 문장(또는 스팬) 내부 → 정확한 부분만 형광펜
    target.innerHTML=target.innerHTML.replace(eh, '<mark class="bx-hl">'+eh+'</mark>'); marked=true;
  } else {   // 문장정렬 책: 앵커가 여러 psent 문장스팬에 걸침 → 겹치는 문장 스팬들에 형광펜
    const full=target.textContent||''; const start=full.indexOf(phrase);
    if(start>=0){ const end=start+phrase.length; let off=0;
      target.childNodes.forEach(node=>{ const len=(node.textContent||'').length, s=off, e=off+len; off=e;
        if(node.nodeType===1 && node.classList && node.classList.contains('psent') && s<end && e>start){ node.classList.add('scn-hl'); marked=true; } });
    }
  }
  if(!marked) target.classList.add('scn-flash');   // 최후 폴백: 문단 강조
  _scnMarkP=target;
  // 대작 본문은 content-visibility 가상화로 화면 밖 문단 위치가 '추정치'라 1회 스크롤이 크게 빗나감
  // (태양은다시떠오른다 문제2가 엉뚱한 페이지에 안착하던 버그). 대상 청크 강제 렌더 + 수렴할 때까지 반복 보정.
  const ch=target.closest && target.closest('.cv-chunk'); if(ch) ch.style.contentVisibility='visible';
  const syncedTarget=target; let tries=0;
  const doScroll=()=>{
    if(_scnMarkP!==syncedTarget){ if(ch) ch.style.contentVisibility=''; return; }   // 그새 다른 장면으로 이동
    const mk=syncedTarget.querySelector('mark.bx-hl')||syncedTarget.querySelector('span.psent.scn-hl')||syncedTarget;
    const r1=mk.getBoundingClientRect(), r0=left.getBoundingClientRect();
    const d=(r1.top-r0.top)-100;
    left.scrollTop += d;
    if(Math.abs(d)>2 && ++tries<12) requestAnimationFrame(doScroll);   // 렌더로 레이아웃이 밀리는 동안 재보정
    else if(ch) ch.style.contentVisibility='';
  };
  doScroll();
}
function _scnSetupSync(retries){
  if(_scnIO){ _scnIO.disconnect(); _scnIO=null; }
  _scnCur=-1; _scnMarkP=null;
  if(!_scnAnchors()) return;
  if(_chalStacked()) return;   // 폰 쌓기 모드: 본문·퀴즈가 한 스크롤이라 자동 점프하면 퀴즈가 화면 밖으로 튐 → 동기화 안 함 (8/17)
  const right=document.querySelector('.viewer-pane.right');
  const box=document.getElementById('mpQuizBox');
  if(!right || !box) return;
  const qs=box.querySelectorAll('.mp-q[data-scene]'); if(!qs.length) return;
  // 본문(왼쪽)이 아직 안 떴으면 잠시 후 재시도(고전 본문 지연 로드 대비)
  const left=document.querySelector('.viewer-pane.left');
  if(left && !left.querySelector('p') && (retries||0)<6){ setTimeout(()=>_scnSetupSync((retries||0)+1), 500); return; }
  _scnSyncTo(+qs[0].dataset.scene||1);   // 첫 장면 즉시 표시
  const visible=new Set();
  _scnIO=new IntersectionObserver(entries=>{
    entries.forEach(e=>{ if(e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
    let best=null, bestTop=Infinity;
    visible.forEach(el=>{ const top=el.getBoundingClientRect().top; if(top<bestTop){ bestTop=top; best=el; } });
    if(best){ const sn=+best.dataset.scene; if(sn) _scnSyncTo(sn); }
  }, {root:right, rootMargin:'0px 0px -55% 0px', threshold:0});   // 오른쪽 칸 상단 45%에 걸린 문항=활성
  qs.forEach(q=>_scnIO.observe(q));
}

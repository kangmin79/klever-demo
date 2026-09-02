// ═══ 출판사 검증 큐레이션 (공유마당∩문지·민음사 / 민음사 세계문학전집∩구텐베르크) ═══
// DROP: 교집합 외 국내 고전(출판사 미검증 — 정철·이육사·신채호·권환·김상용). 콘텐츠는 보존, 노출만 제외
const DROP_IDS = new Set(["k13313590","k13313606","k13313608","k13313607","k9001059","k9001047","k9001048","k9001052","k9001060","k9001035","k9020973","k9032975","k9000607","k9031445","k9032996","k9032995","k9032994","k9032993","k13313736","k13313731","k13313732","k13313735","k13313734","k13313733"]);
// MINUMSA: 민음사 세계문학전집 선정작 (배지)
const MINUMSA_IDS = new Set(["g31","g21765","g41537","g996","g1122","g1112","g1129","g1128","g1127","g1113","g1400","g98","g730","g46","g1342","g161","g158","g1260","g768","g145","g550","g110","g345","g120","g42","g174","g844","g1661","g2852","g135","g2610","g1184","g1257","g1237","g2413","g44747","g2554","g28054","g2638","g600","g2600","g1399","g1754","g30723","g1081","g76","g74","g205","g15","g33","g203","g209","g215","g910","g5200","g7849","g2814","g219","g5658","g541","g4517","g1998","g4363"]);
// 민음사 배지는 표시하지 않음(2026-06-30 사용자 지시로 삭제). minumsa 플래그 미부여 → 모든 배지 렌더 비활성.
// 해외고전 장르 분류(2026-06-30) — 비-소설만 명시, 나머지는 '소설' 기본. id 기준 오버레이라 데이터 재생성돼도 유지.
const FOREIGN_LIT_GENRE = {
  // 동화·우화
  'gb-21':'동화·우화','gb-16':'동화·우화','gb-11':'동화·우화','gb-14838':'동화·우화','gb-500':'동화·우화',
  'gb-1597':'동화·우화','gb-52521':'동화·우화','gb-29021':'동화·우화','gb-27805':'동화·우화',
  // 신화·전설
  'gb-36462':'신화·전설','gb-1251':'신화·전설','gb-5160':'신화·전설','gb-56644':'신화·전설',
  'gb-51252':'신화·전설','gb-10148':'신화·전설','gb-597':'신화·전설',
  // 사상·철학
  'gb-23639':'사상·철학','gb-57342':'사상·철학','gb-2130':'사상·철학','gb-30201':'사상·철학','gb-2434':'사상·철학','gb-2085':'사상·철학',
  // 에세이·자서전
  'gb-1080':'에세이·자서전','gb-9198':'에세이·자서전','gb-36151':'에세이·자서전','gb-56463':'에세이·자서전',
};
// 국내(고전) = 한국 고전 110권(제목만 표지, 본문은 Supabase classics fetch)
// 해외 = 확정 목록(2026-06-14)만 진열 — 옛 mvp35 해외분 제외
const BOOKS_RAW = (typeof BOOKS_CLASSICS_KR !== 'undefined' ? BOOKS_CLASSICS_KR : [])
  .concat(typeof BOOKS_CLASSICS_FOREIGN !== 'undefined' ? BOOKS_CLASSICS_FOREIGN : []);
const _KOT = (typeof window !== 'undefined' && window.CLASSICS_KO) ? window.CLASSICS_KO : {};
const BOOKS = BOOKS_RAW.filter(b => !DROP_IDS.has(b.id))
                       // 2026-06-21 사용자 지시: 해외 고전은 "번역된 것만" 노출/검색.
                       // → 번역 없는 해외 항목(비영어판 7권 junk + 7차 번역중 5권) 제외. 번역 완료(wire 후)되면 자동 복귀.
                       .filter(b => !(b.locale === 'foreign' && !b.hasTrans))
                       .map(b => {
                         let o = b;   // 민음사 배지 삭제: minumsa 플래그 미부여
                         // 해외 고전 장르(소설/동화·우화/신화·전설/사상·철학/에세이·자서전). 비-소설만 맵에 명시, 나머지 소설.
                         if (b.locale === 'foreign') o = Object.assign({}, o, {litGenre: FOREIGN_LIT_GENRE[b.id] || '소설'});
                         // 해외 고전: 카드/목록 라벨은 한글 제목, 영어 원제는 titleEn 보존 (표지 이미지는 영어 그대로)
                         if (b.id && b.id.indexOf('gb-') === 0 && _KOT[b.id]) o = Object.assign({}, o, {titleEn: b.title, title: _KOT[b.id]});
                         return o;
                       });
// 2026-06-21 사용자 지시: 해외 고전은 확정·번역된 목록(classics_foreign_data.js)만 노출/검색.
// 옛 해외고전 41권(BOOKS_EXTRA, 원문만·번역 없음)은 표시·검색 양쪽에서 제외. 데이터는 books_extra.js에 보존(되돌리기 가능).
// (번역된 책이 아니므로 6/19 절대규칙 "번역분 숨김 금지"에 저촉되지 않음.)

const CURATIONS = [
  {id:'c1', cls:'cur-1', eyebrow:'심리·자아',     title:'나를 바꾸는 심리 챌린지',       desc:'논어·맹자·니체로 떠나는 자기 탐구',         meta:'8권 · 423명 참여'},
  {id:'c2', cls:'cur-2', eyebrow:'경제·세상',     title:'부의 본질을 꿰뚫는 경제 고전 퀘스트', desc:'국부론·자본론으로 보는 경제의 원리',         meta:'6권 · 287명 참여'},
  {id:'c3', cls:'cur-3', eyebrow:'우주·과학',     title:'은하계를 넘나드는 SF 고전',      desc:'쥘 베른·웰스로 시작하는 SF의 뿌리',         meta:'7권 · 198명 참여'},
  {id:'c4', cls:'cur-4', eyebrow:'조선 지성',     title:'조선의 지성인들은 어떻게 살았나',  desc:'정약용·박지원·박제가의 일상과 사유',         meta:'10권 · 312명 참여', intl:true},
  {id:'c5', cls:'cur-5', eyebrow:'풍자·해학',     title:'조선 시대의 뼈 때리는 풍자',     desc:'양반전·허생전이 보여주는 사회 비판',         meta:'5권 · 256명 참여', intl:true},
  {id:'c6', cls:'cur-6', eyebrow:'정서·감성',     title:'한국인 특유의 감정을 이해하다',   desc:'김소월·윤동주·한용운의 정서',              meta:'9권 · 384명 참여', intl:true},
];

// 구 QUEST_MVP35(mvp35_data.js) 실데이터를 인라인으로 이전(2026-07-02, 7.27MB 파일 제거하며 유일 실사용분만 옮김)
const QUEST = (typeof QUEST_MVP35 !== 'undefined' && QUEST_MVP35.length) ? QUEST_MVP35 : [
  {week:1, book:'동백꽃',      id:'k9000397',  done:true,  current:false},
  {week:2, book:'봄봄',        id:'k9000404',  done:true,  current:false},
  {week:3, book:'메밀꽃 필 무렵', id:'k9001211',  done:true,  current:false},
  {week:4, book:'운수 좋은 날', id:'k9002094',  done:true,  current:false},
  {week:5, book:'진달래꽃',    id:'k9000320',  done:false, current:true},
  {week:6, book:'서시',        id:'k9000779',  done:false, current:false},
  {week:7, book:'청춘예찬',    id:'k13313822', done:false, current:false},
  {week:8, book:'님의 침묵',   id:'k9001830',  done:false, current:false},
];

const BADGES = [
  {icon:'🌱', name:'첫 한 권', desc:'첫 책 완독', unlocked:true},
  {icon:'🔥', name:'7일 연속', desc:'7일 연속 출석', unlocked:true},
  {icon:'📖', name:'고전 입문', desc:'한국 고전 3권', unlocked:true},
  {icon:'✍️', name:'서평 작가', desc:'서평 3편 작성', unlocked:true},
  {icon:'🎯', name:'퀴즈 마스터', desc:'퀴즈 10개 정답', unlocked:false},
  {icon:'⭐', name:'챌린지 완주', desc:'12주 챌린지', unlocked:false},
  {icon:'🌟', name:'독서왕', desc:'책 10권 완독', unlocked:false},
];

const LEADERBOARD = [
  {rank:1, name:'이서연', score:3245},
  {rank:2, name:'박지호', score:2987},
  {rank:3, name:'최가은', score:2654},
  {rank:4, name:'정유진', score:2432},
  {rank:5, name:'한승우', score:2210},
  {rank:14, name:'김민서 (나)', score:1842, me:true},
];

// 커뮤니티 글은 전적으로 관리자(community_posts)가 소스 — 가짜 mock 없이 빈 상태로 시작
const COMMUNITY_POSTS = { program:[], event:[], free:[], notice:[] };

// 군주론 본문 mock
const BOOK_CONTENT = {
  gunju: {
    origin:`<h1>Capitolo I</h1>
<h2>Quot sint genera principatuum et quibus modis acquirantur</h2>
<p>Tutti gli stati, tutti e' dominii che hanno avuto et hanno imperio sopra li uomini, sono stati e sono o repubbliche o principati.</p>
<p>E' principati sono o ereditarii, de' quali el sangue del loro signore ne sia suto lungo tempo principe, o e' sono nuovi.</p>
<p>E' nuovi, o sono nuovi tutti, come fu Milano a Francesco Sforza, o sono come membri aggiunti allo stato ereditario del principe che li acquista, come è el regno di Napoli al re di Spagna.</p>`,
    trans:`<h1>제1장</h1>
<h2>군주국의 종류와 그것을 획득하는 방법</h2>
<p>일찍이 사람들 위에 군림하였고 지금도 군림하고 있는 모든 나라와 모든 영토는 공화국이거나 군주국이거나 둘 중 하나입니다.</p>
<p>군주국은 다시 세습 군주국과 새로운 군주국으로 나뉩니다. 세습 군주국이란 군주의 혈통이 오랜 세월 그 자리를 이어온 나라를 말하며, 새로운 군주국은 그렇지 아니한 나라를 일컫습니다.</p>
<p>새로운 군주국 역시 두 가지로 구분할 수 있습니다. 하나는 프란체스코 스포르차에게 밀라노가 그러하였듯 전체가 새로 세워진 경우요, 다른 하나는 스페인 왕에게 나폴리 왕국이 그러하였듯 군주가 본디 가진 세습국에 새로이 덧붙여진 경우입니다.</p>`,
    nativeEN:`<h1>Chapter I</h1>
<h2>How Many Kinds of Principalities There Are, and By What Means They Are Acquired</h2>
<p>All states, all powers, that have held and hold rule over men have been and are either republics or principalities.</p>
<p>Principalities are either hereditary, in which the family has been long established; or they are new.</p>
<p>The new are either entirely new, as was Milan to Francesco Sforza, or they are, as it were, members annexed to the hereditary state of the prince who has acquired them, as was the kingdom of Naples to that of the King of Spain.</p>`,
    quiz:[
      {q:'군주국이 나뉘는 두 가지 큰 종류는?', opts:['세습 군주국 · 새로운 군주국', '공화국 · 제국', '평화국 · 전쟁국'], correct:0},
      {q:'본문에서 \"새로 세워진 경우\"의 예로 드는 것은?', opts:['나폴리 왕국', '밀라노', '스페인'], correct:1},
      {q:'영토를 획득하는 방편 네 가지에 해당하지 않는 것은?', opts:['남의 군대', '운', '덕', '신탁'], correct:3},
    ],
  }
};

let currentBook = null;
let currentMode = 'challenge';


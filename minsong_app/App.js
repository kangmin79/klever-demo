// 민송도서관 앱 v0.4 — 밀리의서재 스타일: 순백 바탕 · 테두리 없음 · 여백 구분 · 굵은 고딕
// 실데이터: semyung_tulip 32만 장서 + semyung_loan_rank (읽기 전용 anon)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, FlatList, Image, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet, StatusBar, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

const SB = 'https://gkujptyfrzqrjrvovbnc.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

// 밀리처럼 흰 바탕(8/11 사장님) — 온기는 인증 카드의 크림·금색 포인트로만 남긴다
const TXT = '#1f2430', SUB = '#4e5968', LIGHT = '#8b93a5', FAINT = '#b3b9c4';
const BG = '#ffffff', FILL = '#f2f3f5', CREAM = '#f7f0dd', GOLD = '#d4a93b', GOLD_D = '#b8902f';
const BTN = '#1f2430';

async function rest(q) {
  const r = await fetch(`${SB}/rest/v1/semyung_tulip?${q}`, { headers: H });
  if (!r.ok) return [];
  return r.json();
}
async function restT(table, q) {
  const r = await fetch(`${SB}/rest/v1/${table}?${q}`, { headers: H });
  if (!r.ok) return [];
  return r.json();
}
function cleanTitle(t) {
  return String(t || '').replace(/\[[^\]]*\]/g, ' ').split(/ [:=] /)[0].replace(/\s+/g, ' ').trim();
}
function cleanAuthor(a) {
  return String(a || '').split(/[;,]/)[0].replace(/지음|지은이|저자?:?/g, '').trim();
}

// ── 판형 배지: 같은 제목이 종이책·전자책·구독(크레마)으로도 있는지 ──
// 한 책이 여러 판형이면 전부 표시 (웹 '우리 도서관'의 fmtTags와 동일한 발상)
function normKey(t) {
  let x = String(t || '').replace(/\[[^\]]*\]/g, ' ');
  x = x.split(/[:=/]/)[0];
  return x.replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
}
const _fmtCache = {};
async function bookFormats(title) {
  const key = normKey(title);
  if (!key) return { paper: false, ebook: false, crema: false };
  if (_fmtCache[key]) return _fmtCache[key];
  const probe = encodeURIComponent('*' + cleanTitle(title).slice(0, 8).replace(/'/g, "''") + '*');
  const rows = await rest(`select=kind,crema,title&title=ilike.${probe}&limit=10`);
  const f = { paper: false, ebook: false, crema: false };
  rows.forEach((r) => {
    if (normKey(r.title) !== key) return;      // 제목 정규화 완전일치만 (딴 책 방지)
    if (r.kind === 'paper') f.paper = true;
    if (r.kind === 'ebook') f.ebook = true;
    if (r.crema) f.crema = true;
  });
  _fmtCache[key] = f;
  return f;
}
// 목록에 판형 정보를 붙여서 다시 그린다 (6개씩 끊어 조회)
async function annotateFormats(list, apply) {
  const out = [...list];
  for (let i = 0; i < out.length; i += 6) {
    await Promise.all(out.slice(i, i + 6).map(async (b, j) => {
      out[i + j] = { ...b, fmt: await bookFormats(b.title) };
    }));
    apply([...out]);
  }
}
function FmtBadges({ book, style }) {
  const f = book.fmt || { paper: book.kind === 'paper', ebook: book.kind === 'ebook', crema: false };
  const chips = [];
  if (f.ebook) chips.push(['전자책', '#e8f1fb', '#2b6cb0']);
  if (f.paper) chips.push(['종이책', '#e6f4ea', '#1d8f56']);
  if (f.crema) chips.push(['구독', '#efe9fb', '#7c5cd6']);
  if (!chips.length) return null;
  return (
    <View style={[{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }, style]}>
      {chips.map(([t, bg, fg]) => (
        <Text key={t} style={{ backgroundColor: bg, color: fg, fontSize: 9.5, fontWeight: '700',
          paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5, overflow: 'hidden' }}>{t}</Text>
      ))}
    </View>
  );
}

// ── 사서 큐레이션 (관리자 '우리 도서관'에서 저장한 칸 — 웹과 같은 library_sections를 읽는다) ──
// 라이브 칸(랭킹·신착)은 앱이 자체로 그리므로 제외, 사서가 손으로 담은 칸만
const LIVE_STYLES = ['rank', 'ebookrank', 'newlive_p', 'newlive_e'];
async function loadCurated() {
  const rows = await restT('library_sections',
    'select=area,title,subtitle,style,sort_order,books,visible&order=sort_order');
  return (rows || [])
    .filter((s) => (s.area || '우리도서관') === '우리도서관' && s.visible !== false
      && !LIVE_STYLES.includes(s.style) && Array.isArray(s.books) && s.books.length)
    .map((s) => ({
      title: s.title, subtitle: s.subtitle || '',
      books: s.books.map((b, i) => ({
        ctrl: 'cur' + i + (b.isbn || ''), curated: true, lib: b.lib || '',
        title: b.title || b.t || '', author: b.author || b.a || '', cover_url: b.cover || '',
      })),
    }));
}

// 고전 컬렉션 (표지↔제목 검증된 쌍 — 북스타 자체 번역본)
const CLASSICS = [
  ['gb-64317', '위대한 개츠비', '피츠제럴드'], ['kr-memilkkot', '메밀꽃 필 무렵', '이효석'],
  ['gb-1342', '오만과 편견', '제인 오스틴'], ['kr-unsujoeunnal', '운수 좋은 날', '현진건'],
  ['gb-11', '이상한 나라의 앨리스', '루이스 캐럴'], ['kr-nalgae', '날개', '이상'],
  ['gb-1260', '제인 에어', '샬럿 브론테'], ['kr-gamja', '감자', '김동인'],
  ['gb-345', '드라큘라', '브램 스토커'], ['kr-sarang', '사랑', '이광수'],
].map(([id, t, a]) => ({ ctrl: id, title: t, author: a, cover_url: `https://bookstar.co.kr/covers/${id}.webp`, classic: true }));

// ── 표지 (없으면 활자 표지) ──────────────────────────────────
const NC_PAL = ['#55606f', '#5d4e8e', '#7b5a3d', '#2d6183', '#2f6b55', '#7a6531', '#8a4560', '#256f74', '#8d4034', '#4d5570'];
function Cover({ book, w, h, r = 8 }) {
  const [err, setErr] = useState(false);
  const t = cleanTitle(book.title);
  if (book.cover_url && !err) {
    return <Image source={{ uri: book.cover_url }} onError={() => setErr(true)}
      style={{ width: w, height: h, borderRadius: r, backgroundColor: FILL }} />;
  }
  let hash = 0; for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) >>> 0;
  return (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: NC_PAL[hash % 10], padding: 8, justifyContent: 'space-between' }}>
      <Text numberOfLines={4} style={{ color: '#fff', fontWeight: '700', fontSize: Math.max(10, w / 9) }}>{t}</Text>
      <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,.85)', fontSize: 8 }}>{cleanAuthor(book.author)}</Text>
    </View>
  );
}

// ── 졸업 독서인증 카드 (토스식 미션 카드 — 큰 숫자 대신 문장 + 4칸 세그먼트) ──
function CertCard({ n = 0, hint }) {
  const total = 4;
  return (
    <View style={s.certBlock}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.cEye}>졸업 독서인증</Text>
          <Text style={s.certTitle}>
            독후감 4편 중 <Text style={{ color: GOLD_D }}>{n}편</Text> 썼어요
          </Text>
        </View>
        <View style={s.certIcon}><Ionicons name="school" size={22} color={GOLD_D} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 15 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[s.certSeg, i < n && { backgroundColor: GOLD }]} />
        ))}
      </View>
      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginTop: 15 }}>
        <Text style={{ color: TXT, fontSize: 13.5, fontWeight: '800' }}>200선에서 첫 책 고르기</Text>
        <Ionicons name="chevron-forward" size={15} color={TXT} style={{ marginTop: 1 }} />
      </TouchableOpacity>
      {!!hint && <Text style={[s.cS, { marginTop: 10 }]}>{hint}</Text>}
    </View>
  );
}

// ── 섹션 헤더 (밀리식 굵은 고딕) ─────────────────────────────
function SecHead({ title, more }) {
  return (
    <View style={s.secH}>
      <Text style={s.secT}>{title}</Text>
      {!!more && <Text style={s.secM}>{more}</Text>}
    </View>
  );
}

// ── 가로 선반 ────────────────────────────────────────────────
function Rail({ title, more, books, onPick }) {
  if (!books.length) return null;
  return (
    <View style={{ marginTop: 30 }}>
      <SecHead title={title} more={more} />
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={books}
        keyExtractor={(b) => b.ctrl} contentContainerStyle={{ paddingHorizontal: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onPick && onPick(item)} style={{ marginRight: 12, width: 96 }}>
            <Cover book={item} w={96} h={138} />
            <Text numberOfLines={2} style={s.railN}>{cleanTitle(item.title)}</Text>
            <Text numberOfLines={1} style={s.railA}>{cleanAuthor(item.author)}</Text>
          </TouchableOpacity>
        )} />
    </View>
  );
}

// ── 우리 학교 대출 랭킹 (박스 없이 흰 바탕 위 줄) ────────────
function RankMove({ b }) {
  if (b.prev_rank == null) return <Text style={[s.mv, { color: '#7c5cd6' }]}>NEW</Text>;
  const d = b.prev_rank - b.rank;
  if (d > 0) return <Text style={[s.mv, { color: '#1d8f56' }]}>▲{d}</Text>;
  if (d < 0) return <Text style={[s.mv, { color: FAINT }]}>▼{-d}</Text>;
  return <Text style={[s.mv, { color: FAINT }]}>─</Text>;
}
function RankList({ rows, onPick }) {
  if (!rows.length) return null;
  return (
    <View style={{ marginTop: 30 }}>
      <SecHead title="우리 학교 대출 랭킹" more="실제 대출 순위" />
      <View style={{ paddingHorizontal: 20 }}>
        {rows.map((b, i) => (
          <TouchableOpacity key={b.rank} onPress={() => onPick(b)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
            <Text style={s.rkNum}>{b.rank}</Text>
            <RankMove b={b} />
            <Cover book={b} w={40} h={57} r={4} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text numberOfLines={1} style={{ color: TXT, fontSize: 13.5, fontWeight: '700' }}>{cleanTitle(b.title)}</Text>
              <Text numberOfLines={1} style={{ color: LIGHT, fontSize: 11, marginTop: 3 }}>{cleanAuthor(b.author)}</Text>
              <FmtBadges book={b} style={{ marginTop: 5 }} />
            </View>
            <Text style={{ color: LIGHT, fontSize: 11, fontWeight: '600' }}>{b.loan_count}회</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── 책 상세 모달 ─────────────────────────────────────────────
// 버튼 실배선(8/11): 전자책=본인 명의 대출→교보 뷰어 / 종이책=찾아줘북즈·반납예약 (웹 app.html과 같은 openapi 체인)
function Detail({ book, onClose, session, goLogin }) {
  const [full, setFull] = useState(null);
  const [stock, setStock] = useState(null);      // 전자책 재고
  const [holding, setHolding] = useState(null);  // 종이책 소장 현황 (anon, 로그인 전에도 보임)
  const [fmt, setFmt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);        // {kind:'pickup'|'hold'|'ebook', ...취소용 번호}
  useEffect(() => {
    if (!book || book.classic) return;
    setFull(null); setStock(null); setHolding(null); setDone(null); setBusy(false);
    setFmt(book.fmt || null);
    if (!book.fmt) bookFormats(book.title).then(setFmt);
    rest(`ctrl=eq.${book.ctrl}&select=description,call_no,publisher,pub_year,barcode,vendor,kind`)
      .then((r) => {
        const f = r[0] || {};
        setFull(f);
        if (f.kind === 'ebook' && f.barcode) {
          fetch(`${SB}/functions/v1/semyung-ebook-borrow?action=stock&brcd=${f.barcode}`, { headers: H })
            .then((x) => x.json()).then(setStock).catch(() => {});
        }
        if (f.kind !== 'ebook') {
          fetch(`${SB}/functions/v1/semyung-holding?reckey=CATTOT${book.ctrl}`, { headers: H })
            .then((x) => x.json()).then(setHolding).catch(() => {});
        }
      }).catch(() => setFull({}));
  }, [book]);

  // 로그인·개인 연동 확인 — 예약/대출은 학생 본인 이름으로만
  const requirePersonal = () => {
    if (!session) { goLogin(); return false; }   // 안내창 없이 바로 로그인 화면으로
    if (!session.personal) {
      Alert.alert('도서관 연동이 안 열렸어요', '내 서재에서 다시 로그인해 주세요.',
        [{ text: '닫기' }, { text: '다시 로그인', onPress: goLogin }]);
      return false;
    }
    return true;
  };

  // 종이책: 소장 상태를 본인 명의로 다시 확인한 뒤 → 대출가능=찾아줘북즈 / 대출중=반납예약
  const doPaper = async () => {
    if (!requirePersonal() || busy) return;
    setBusy(true);
    let list = null;
    try {
      const h = await myApi(session.token, 'holding', { ctrl: book.ctrl });
      list = (((h || {}).data || {}).holdings || {}).holding;
    } catch (e) {}
    setBusy(false);
    if (!list) { Alert.alert('소장 정보를 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); return; }
    if (!Array.isArray(list)) list = [list];
    const av = list.find((x) => x && x.book_state === '대출가능');
    if (av) {
      Alert.alert('찾아줘북즈로 예약할까요?',
        `「${cleanTitle(book.title)}」을(를) 서가에서 찾아 민송도서관 2층 안내데스크에 보관해 드려요.\n\n· 도서관 승인 후 24시간 안에 받으세요\n· 예약 1인 3권 · 대출기간 14일\n· 받아가지 않으면 노쇼 — 3회면 30일간 제한`,
        [{ text: '닫기' }, { text: '예약 신청', onPress: () => doPickup(av) }]);
    } else {
      const t = list.find((x) => x && x.book_state === '대출중' && x.reserve_available === 'Y')
        || list.find((x) => x && x.reserve_available === 'Y');
      if (!t) { Alert.alert('지금은 예약할 수 없어요', '잠시 후 다시 시도하거나 도서관에 문의해 주세요.'); return; }
      Alert.alert('반납되면 예약해 드릴까요?',
        `「${cleanTitle(book.title)}」은(는) 지금 대출 중이에요.\n\n· 반납되면 순번대로 대출 안내를 보내드려요\n· 안내 후 3일 안에 대출하지 않으면 자동 취소\n· 한 책당 1순위 · 예약은 3권까지`,
        [{ text: '닫기' }, { text: '예약 신청', onPress: () => doHold(t) }]);
    }
  };
  const doPickup = async (av) => {
    setBusy(true);
    try {
      const d = await myApi(session.token, 'pickup',
        { controlno: book.ctrl, accession_no: av.accession_no || '', main_no: av.main_no || '' });
      if (!d || !d.ok) {
        Alert.alert('예약에 실패했어요', (((d || {}).data) || {}).message || (d || {}).error || '잠시 후 다시 시도해 주세요.');
      } else {
        // 취소에 쓸 신청번호 — 응답엔 없어서 현황에서 이 책(제어번호 일치) 건을 되찾는다 (웹과 동일)
        let request_no = '';
        try {
          const l = await myApi(session.token, 'pickups');
          let it = ((l || {}).data || {}).item;
          if (it && !Array.isArray(it)) it = [it];
          const live = (it || []).filter((x) => x && x.loan_status === '0001');
          const mine = live.find((x) => String(x.control_no || x.controlno || '').replace(/\D/g, '') === book.ctrl)
            || live.slice().sort((a, b) => Number(b.request_no || 0) - Number(a.request_no || 0))[0];
          request_no = (mine && mine.request_no) || '';
        } catch (e) {}
        setDone({ kind: 'pickup', request_no });
        logEv('pickup', { book: cleanTitle(book.title), student_tag: tagOf(session.uid) });
      }
    } catch (e) { Alert.alert('예약 중 오류가 발생했어요', '네트워크를 확인해 주세요.'); }
    setBusy(false);
  };
  const doHold = async (t) => {
    setBusy(true);
    try {
      const d = await myApi(session.token, 'reserve', { main_no: t.main_no || '', location: t.location || '' });
      if (!d || !d.ok) Alert.alert('예약에 실패했어요', (((d || {}).data) || {}).message || (d || {}).error || '잠시 후 다시 시도해 주세요.');
      else {
        setDone({ kind: 'hold', main_no: t.main_no || '' });
        logEv('hold', { book: cleanTitle(book.title), student_tag: tagOf(session.uid) });
      }
    } catch (e) { Alert.alert('예약 중 오류가 발생했어요', '네트워크를 확인해 주세요.'); }
    setBusy(false);
  };

  // 전자책: 본인 명의 대출 → 교보 DRM 뷰어(외부 브라우저)
  const doEbook = async () => {
    if (!requirePersonal() || busy) return;
    const brcd = full && full.barcode;
    if (!brcd) { Alert.alert('전자책 정보를 불러오지 못했어요', '잠시 후 다시 시도해 주세요.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${SB}/functions/v1/semyung-ebook-borrow?action=borrow&brcd=${encodeURIComponent(brcd)}`,
        { headers: { apikey: ANON, Authorization: 'Bearer ' + session.token } });
      const d = await r.json();
      if (d && d.needsPersonal) {
        setBusy(false);
        Alert.alert('로그인이 만료됐어요', '내 서재에서 다시 로그인해 주세요.',
          [{ text: '닫기' }, { text: '다시 로그인', onPress: goLogin }]);
        return;
      }
      if (d && d.ok && d.viewerUrl) {
        setDone({ kind: 'ebook', viewerUrl: d.viewerUrl, due: d.dueDate || '' });
        logEv('ebook_borrow', { book: cleanTitle(book.title), student_tag: tagOf(session.uid) });
        Linking.openURL(d.viewerUrl);
      } else {
        logEv('ebook_borrow', { ok: false, book: cleanTitle(book.title), student_tag: tagOf(session.uid),
          detail: String((d && (d.message || d.error)) || 'unknown').slice(0, 300) });
        Alert.alert('지금은 대출할 수 없어요', (d && (d.message || d.error)) || '동시이용 한도일 수 있어요. 잠시 후 다시 시도해 주세요.');
      }
    } catch (e) { Alert.alert('대출 중 오류가 발생했어요', '네트워크를 확인해 주세요.'); }
    setBusy(false);
  };

  const cancelResv = () => {
    Alert.alert('예약을 취소할까요?', '', [
      { text: '아니요' },
      { text: '취소하기', onPress: async () => {
        setBusy(true);
        try {
          const d = done.kind === 'pickup'
            ? await myApi(session.token, 'cancelPickup', { request_no: done.request_no })
            : await myApi(session.token, 'cancelReserve', { main_no: done.main_no });
          if (d && d.ok) {
            logEv(done.kind === 'pickup' ? 'cancel_pickup' : 'cancel_hold',
              { book: cleanTitle(book.title), student_tag: tagOf(session.uid) });
            setDone(null);
          }
          else Alert.alert('취소에 실패했어요', '내 서재의 기다리는 책에서 다시 확인해 주세요.');
        } catch (e) { Alert.alert('취소 중 오류가 발생했어요', '네트워크를 확인해 주세요.'); }
        setBusy(false);
      } },
    ]);
  };

  if (!book) return null;
  const isClassic = !!book.classic;
  const isE = !isClassic && ((full && full.kind) || book.kind) === 'ebook';
  const hOk = holding && holding.ok && holding.total > 0;
  const ctaLabel = isClassic ? '바로 읽기 (다음 버전)'
    : isE ? (session ? '대출하고 바로 읽기 — 내 이름으로' : '대출하고 바로 읽기 (로그인 필요)')
    : hOk
      ? (holding.available > 0 ? '서가에서 찾아 보관받기 · 찾아줘북즈' : '반납되면 순번대로 예약하기')
      : (session ? '종이책 예약하기' : '종이책 예약하기 (로그인 필요)');
  const ctaPress = isClassic ? onClose : isE ? doEbook : doPaper;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBack}>
        <View style={s.modalCard}>
          <ScrollView>
            <View style={{ flexDirection: 'row' }}>
              <Cover book={book} w={110} h={158} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={s.dTitle}>{cleanTitle(book.title)}</Text>
                <Text style={s.dMeta}>{cleanAuthor(book.author)}</Text>
                {isClassic ? (
                  <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
                    <Text style={[s.badge, { backgroundColor: CREAM, color: GOLD_D }]}>고전 · 무료</Text>
                  </View>
                ) : full ? (
                  <>
                    {!!full.publisher && <Text style={s.dMeta2}>{full.publisher} · {String(full.pub_year || '').slice(0, 4)}</Text>}
                    <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                      <FmtBadges book={{ ...book, fmt: fmt || undefined }} />
                      {!isE && !!full.call_no && <Text style={[s.badge, { backgroundColor: FILL, color: LIGHT }]}>{full.call_no}</Text>}
                      {!isE && hOk && (
                        <Text style={[s.badge, holding.available > 0
                          ? { backgroundColor: 'rgba(46,184,114,.12)', color: '#1d8f56' }
                          : { backgroundColor: '#fdeceb', color: '#c0392b' }]}>
                          {holding.available > 0 ? `대출 가능 ${holding.available}/${holding.total}` : '모두 대출 중'}
                        </Text>
                      )}
                      {stock && stock.ok && (
                        <Text style={[s.badge, stock.available
                          ? { backgroundColor: 'rgba(46,184,114,.12)', color: '#1d8f56' }
                          : { backgroundColor: '#fdeceb', color: '#c0392b' }]}>
                          {stock.available ? `대출 가능 ${stock.total - stock.loaned}/${stock.total}` : '모두 대출 중'}
                        </Text>
                      )}
                    </View>
                  </>
                ) : <ActivityIndicator color={LIGHT} style={{ marginTop: 12 }} />}
              </View>
            </View>
            {isClassic && <Text style={s.desc}>북스타가 직접 번역해 무료로 제공하는 고전입니다. 도서관 소장 여부와 관계없이 바로 읽을 수 있어요.</Text>}
            {!isClassic && full && !!full.description && <Text style={s.desc}>{full.description}</Text>}
            {!isClassic && full && !full.description && <Text style={[s.desc, { color: FAINT }]}>등록된 책소개가 없습니다.</Text>}
            {done ? (
              <View style={{ backgroundColor: 'rgba(46,184,114,.1)', borderRadius: 14, padding: 16, marginTop: 20 }}>
                <Text style={{ color: '#1d8f56', fontWeight: '800', fontSize: 14.5 }}>
                  {done.kind === 'ebook' ? '대출했어요 — 뷰어가 열립니다' : '예약 신청이 접수됐어요'}
                </Text>
                <Text style={{ color: SUB, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>
                  {done.kind === 'pickup' ? '도서관 승인 후 민송도서관 2층 안내데스크에서 24시간 안에 받으세요.'
                    : done.kind === 'hold' ? '반납되면 순번대로 대출 안내를 보내드려요.'
                    : (done.due ? `반납일 ${done.due} · ` : '') + '뷰어가 안 열리면 아래를 다시 눌러 주세요.'}
                </Text>
                {done.kind === 'ebook' ? (
                  <TouchableOpacity onPress={() => Linking.openURL(done.viewerUrl)} style={{ marginTop: 12 }}>
                    <Text style={{ color: '#1d8f56', fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>다시 열기</Text>
                  </TouchableOpacity>
                ) : ((done.kind === 'pickup' ? done.request_no : done.main_no) ? (
                  <TouchableOpacity onPress={cancelResv} style={{ marginTop: 12 }}>
                    <Text style={{ color: LIGHT, fontSize: 13, textDecorationLine: 'underline' }}>예약 취소하기</Text>
                  </TouchableOpacity>
                ) : null)}
              </View>
            ) : (
              <TouchableOpacity style={[s.cta, busy && { opacity: 0.6 }]} disabled={busy} onPress={ctaPress}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>{ctaLabel}</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={{ padding: 13, alignItems: 'center' }}>
              <Text style={{ color: LIGHT, fontSize: 13 }}>닫기</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── 홈 ───────────────────────────────────────────────────────
function Home({ onPick, goSearch, session, goMy }) {
  const [fresh, setFresh] = useState([]);
  const [ebooks, setEbooks] = useState([]);
  const [pickBook, setPickBook] = useState(null);
  const [rank, setRank] = useState([]);
  const [myInfo, setMyInfo] = useState(null);
  const [curated, setCurated] = useState([]);
  // 큐레이션 책 터치 → 도서관 소장 레코드로 연결해 상세(대출·예약 버튼까지) 열기
  const pickCurated = async (b) => {
    const m = String(b.lib || '').match(/brcd=(\d+)/);
    let hit = null;
    if (m) { const r = await rest(`select=ctrl,title,author,cover_url,kind&barcode=eq.${m[1]}&limit=1`); hit = r[0]; }
    if (!hit) {
      const probe = encodeURIComponent('*' + cleanTitle(b.title).slice(0, 8).replace(/'/g, "''") + '*');
      const r = await rest(`select=ctrl,title,author,cover_url,kind&title=ilike.${probe}&limit=5`);
      hit = r.find((x) => normKey(x.title) === normKey(b.title)) || r[0];
    }
    if (hit) onPick({ ...hit, cover_url: hit.cover_url || b.cover_url });
    else Alert.alert('소장 정보를 찾지 못했어요', '이 책은 지금 도서관 목록과 연결되지 않았어요.');
  };
  useEffect(() => {
    if (session) myApi(session.token, 'info').then((d) => setMyInfo(d.data || {}));
    else setMyInfo(null);
  }, [session]);
  useEffect(() => {
    rest('select=ctrl,title,author,cover_url,kind&kind=eq.paper&cover_url=like.https*&order=reg_date.desc&limit=15').then(setFresh);
    rest('select=ctrl,title,author,cover_url,kind,description&kind=eq.ebook&cover_url=like.https*&order=reg_date.desc&limit=15')
      .then((r) => {
        setEbooks(r);
        const p = r.find((b) => b.description && b.description.length > 60) || r[0] || null;
        setPickBook(p);
        if (p) bookFormats(p.title).then((fmt) => setPickBook({ ...p, fmt }));
      });
    loadCurated().then(setCurated);
    restT('semyung_loan_rank', 'select=rank,title,author,loan_count,cover,prev_rank,brcd&order=rank&limit=10')
      .then((r) => {
        const rows = r.map((b) => ({ ...b, cover_url: b.cover, ctrl: String(b.brcd || '').slice(-12), kind: 'paper' }));
        setRank(rows);
        annotateFormats(rows, setRank);          // 판형 배지(전자책·종이책·구독) 뒤이어 채움
      });
  }, []);
  return (
    <View style={{ flex: 1 }}>
    {/* 상단 흰 안개막 — 스크롤 콘텐츠가 검색창 뒤로 자연스럽게 사라진다 */}
    <LinearGradient colors={['#ffffff', '#ffffff', 'rgba(255,255,255,0)']} locations={[0, 0.62, 1]}
      pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 96, zIndex: 9 }} />
    {/* 떠 있는 검색 — 스크롤해도 상단 고정 */}
    <View style={s.floatWrap} pointerEvents="box-none">
      <TouchableOpacity onPress={goSearch} activeOpacity={0.85} style={s.searchFloat}>
        <Ionicons name="search" size={18} color={TXT} />
        <Text style={s.searchPillQ}>별이에게 물어보세요 — "위로가 되는 소설"</Text>
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={{ paddingBottom: 34, paddingTop: 78 }}>
      {/* 졸업 독서인증 — 미션 카드 */}
      <View style={{ paddingHorizontal: 20 }}>
        <CertCard n={0} />

        {/* 내 도서관 — 한 줄 (박스 없음). 로그인하면 실시간 요약 */}
        <TouchableOpacity style={s.rowLink} onPress={goMy}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TXT, fontSize: 15, fontWeight: '700' }}>
              내 도서관{session ? ` · ${session.name} 님` : ''}
            </Text>
            <Text style={{ color: LIGHT, fontSize: 12, marginTop: 3 }}>
              {session
                ? (myInfo ? `빌린 책 ${myInfo.loanCount ?? 0} · 연체 ${myInfo.overDueCount ?? 0} · 예약 ${myInfo.reserveCount ?? 0}` : '확인 중…')
                : '포털 로그인하면 빌린 책 · 반납일이 여기 떠요'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={FAINT} />
        </TouchableOpacity>
      </View>

      {/* 오늘의 추천 — 플랫 */}
      {pickBook && (
        <View style={{ marginTop: 30 }}>
          <SecHead title="오늘의 추천" more="전체" />
          <TouchableOpacity onPress={() => onPick(pickBook)}
            style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 20 }}>
            <Cover book={pickBook} w={84} h={121} />
            <View style={{ flex: 1 }}>
              <Text style={s.pickQ}>{cleanTitle(pickBook.title)}</Text>
              <Text numberOfLines={3} style={s.pickW}>{pickBook.description || cleanAuthor(pickBook.author)}</Text>
              <View style={{ flexDirection: 'row', gap: 5, marginTop: 9, alignItems: 'center' }}>
                <Text style={[s.chip, { backgroundColor: 'rgba(46,184,114,.12)', color: '#1d8f56' }]}>바로 읽기</Text>
                <FmtBadges book={pickBook} />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* 사서 큐레이션 — 관리자에서 저장하면 웹·앱 동시 반영 */}
      {curated.map((sec) => (
        <Rail key={sec.title} title={sec.title} more="사서 추천" books={sec.books} onPick={pickCurated} />
      ))}
      <RankList rows={rank} onPick={onPick} />
      <Rail title="전자책 · 지금 바로" more="전체" books={ebooks.slice(0, 12)} onPick={onPick} />
      <Rail title="새로 들어온 책" more="전체" books={fresh} onPick={onPick} />
      <Rail title="고전 컬렉션 · 바로 읽기" more="300+" books={CLASSICS} onPick={onPick} />
      <Text style={s.foot}>개발 미리보기 v0.5 · 실데이터(세명대 학술정보원 공식 API)</Text>
    </ScrollView>
    </View>
  );
}

// ── 찾기 ─────────────────────────────────────────────────────
function Search({ onPick }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [kind, setKind] = useState('all');          // 전체 | paper | ebook
  const shown = kind === 'all' ? rows : rows.filter((b) => b.kind === kind);
  const run = useCallback(async () => {
    const query = q.trim();
    if (!query) return;
    setBusy(true); setDone(false);
    try {
      const r = await fetch(`${SB}/functions/v1/semyung-find`, {
        method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 20 }),
      });
      const d = await r.json();
      const cands = (d.candidates || []).map((c) => ({ ...c, ctrl: String(c.key || '').slice(-12) })).filter((c) => c.ctrl.length === 12);
      const covers = cands.length
        ? await rest(`select=ctrl,cover_url,kind,author&ctrl=in.(${cands.map((c) => c.ctrl).join(',')})`)
        : [];
      const cmap = Object.fromEntries(covers.map((c) => [c.ctrl, c]));
      const merged = cands.map((c) => ({ ...c, ...(cmap[c.ctrl] || {}), ctrl: c.ctrl }));
      setRows(merged);
      annotateFormats(merged, setRows);          // 판형 배지 뒤이어 채움
    } catch (e) { setRows([]); }
    setBusy(false); setDone(true);
  }, [q]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', margin: 20, marginBottom: 6, gap: 8 }}>
        <View style={[s.searchPill, { flex: 1, margin: 0 }]}>
          <Ionicons name="search" size={16} color={LIGHT} />
          <TextInput value={q} onChangeText={setQ} onSubmitEditing={run} returnKeyType="search" autoFocus
            placeholder="책 제목, 주제, 기분… 뭐든" placeholderTextColor={FAINT}
            style={{ flex: 1, color: TXT, fontSize: 13.5, padding: 0, marginLeft: 8 }} />
        </View>
        <TouchableOpacity onPress={run} style={s.searchBtn}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>검색</Text></TouchableOpacity>
      </View>
      {/* 종이책·전자책 필터 칩 */}
      <View style={{ flexDirection: 'row', gap: 7, paddingHorizontal: 20, marginTop: 10 }}>
        {[['all', '전체'], ['paper', '종이책'], ['ebook', '전자책']].map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setKind(k)}
            style={[s.fchip, kind === k && { backgroundColor: BTN }]}>
            <Text style={[s.fchipT, kind === k && { color: '#fff' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
        {done && rows.length > 0 && (
          <Text style={{ color: FAINT, fontSize: 11.5, marginLeft: 'auto', alignSelf: 'center' }}>{shown.length}권</Text>
        )}
      </View>
      {busy && <ActivityIndicator color={LIGHT} style={{ marginTop: 30 }} />}
      <FlatList data={shown} keyExtractor={(b, i) => b.ctrl + i} contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={!busy && done
          ? <Text style={{ color: FAINT, textAlign: 'center', marginTop: 30 }}>
              {rows.length ? (kind === 'paper' ? '이 결과엔 종이책이 없어요' : '이 결과엔 전자책이 없어요') : '결과가 없습니다'}
            </Text>
          : null}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onPick(item)} style={{ flexDirection: 'row', marginBottom: 16, alignItems: 'center' }}>
            <Cover book={item} w={52} h={74} r={4} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text numberOfLines={2} style={s.resultTitle}>{cleanTitle(item.title)}</Text>
              <Text numberOfLines={1} style={s.railA}>{cleanAuthor(item.author)}</Text>
              <FmtBadges book={item} style={{ marginTop: 6 }} />
            </View>
          </TouchableOpacity>
        )} />
    </View>
  );
}

// ── 인증 ─────────────────────────────────────────────────────
function Cert() {
  const STEPS = [
    ['1', '지정도서 200선에서 책을 고르고'],
    ['2', '읽은 뒤 독후감을 1,500자 이상 쓰고'],
    ['3', '제출하면 표절 검사를 거쳐'],
    ['4', '승인되면 1편 완료 — 4편이면 인증'],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 26 }}>
      <Text style={[s.secT, { fontSize: 22 }]}>졸업 독서인증</Text>
      <Text style={[s.cS, { marginTop: 6 }]}>신입생은 4편, 편입생은 2편 — 졸업 요건입니다</Text>
      <View style={{ marginTop: 6 }}>
        <CertCard n={0} hint="포털 로그인하면 실제 진행 상황이 표시됩니다" />
      </View>
      <View style={{ marginTop: 26 }}>
        <Text style={[s.secT, { fontSize: 16 }]}>어떻게 하나요</Text>
        {STEPS.map(([n, t]) => (
          <View key={n} style={{ flexDirection: 'row', gap: 12, marginTop: 14, alignItems: 'center' }}>
            <View style={s.stepN}><Text style={{ color: SUB, fontSize: 12, fontWeight: '800' }}>{n}</Text></View>
            <Text style={{ color: SUB, fontSize: 14, flex: 1, lineHeight: 20 }}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 28 }}>
        <Text style={[s.secT, { fontSize: 16 }]}>지정도서 200선</Text>
        <Text style={[s.cS, { marginTop: 8 }]}>표지·소개·대출 가능 여부가 붙은 200선 목록이 다음 버전에 여기 들어옵니다. 그중 70여 권은 전자책이라 이 앱에서 바로 읽고 쓸 수 있어요.</Text>
      </View>
    </ScrollView>
  );
}

// ── 포털 로그인 + 내 도서관 (실배선) ────────────────────────
// 비밀번호는 서버가 포털 확인에 1회 쓰고 버린다(저장 안 함) — sso-login 검증된 체인
// ── 앱 경유 행동 로그 (익명 집계 전용 — 관리자 '민송 앱' 대시보드) ──
// 이름·학번 원문은 보내지 않는다. 꼬리표는 단방향 해시. 실패해도 앱 동작에 영향 없음.
function tagOf(uid) {
  let h = 5381; const str = 'ms:' + (uid || '');
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function logEv(event, extra) {
  try {
    fetch(`${SB}/rest/v1/minsong_app_events`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ event, ...(extra || {}) }),
    }).catch(() => {});
  } catch (e) {}
}

async function myApi(token, action, params) {
  const q = Object.entries({ action, ...(params || {}) })
    .map(([k, v]) => `${k}=${encodeURIComponent(v == null ? '' : v)}`).join('&');
  const r = await fetch(`${SB}/functions/v1/semyung-my?${q}`,
    { headers: { Authorization: 'Bearer ' + token } });
  return r.json();
}
const qs = (url, k) => {
  const m = String(url || '').match(new RegExp('[?&]' + k + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
};

function LoginForm({ onLogin }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    const uid = id.trim();
    if (!uid || !pw || busy) return;
    setBusy(true); setMsg('');
    try {
      const body = `school=semyung.ac.kr&client_userid=${encodeURIComponent(uid)}&client_username=`
        + `&portal_id=${encodeURIComponent(uid)}&portal_pw=${encodeURIComponent(pw)}`;
      const r = await fetch(`${SB}/functions/v1/sso-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      const token = qs(r.url, 'sso_token');   // 302를 따라간 최종 URL에 토큰이 실려 온다
      if (token) {
        onLogin({ token, name: qs(r.url, 'sso_name') || uid, uid: qs(r.url, 'sso_uid'),
                  personal: qs(r.url, 'sso_personal') === '1' });
        logEv('login', { student_tag: tagOf(qs(r.url, 'sso_uid') || uid) });
      } else setMsg('로그인에 실패했어요. 아이디와 비밀번호를 확인해 주세요.');
    } catch (e) { setMsg('연결에 실패했어요. 네트워크를 확인해 주세요.'); }
    setBusy(false);
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 46 }} keyboardShouldPersistTaps="handled">
      <Ionicons name="library-outline" size={38} color={FAINT} />
      <Text style={[s.secT, { fontSize: 22, marginTop: 12 }]}>내 도서관</Text>
      <Text style={{ color: LIGHT, marginTop: 8, lineHeight: 21, fontSize: 13.5 }}>
        세명대 포털 아이디로 로그인하면{'\n'}빌린 책 · 반납일 · 예약이 여기 모여요
      </Text>
      <TextInput value={id} onChangeText={setId} placeholder="포털 아이디 (학번)" placeholderTextColor={FAINT}
        autoCapitalize="none" autoCorrect={false} style={s.input} />
      <TextInput value={pw} onChangeText={setPw} placeholder="포털 비밀번호" placeholderTextColor={FAINT}
        secureTextEntry onSubmitEditing={submit} style={s.input} />
      {!!msg && <Text style={{ color: '#c0392b', fontSize: 12.5, marginTop: 10 }}>{msg}</Text>}
      <TouchableOpacity onPress={submit} style={[s.cta, { opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>세명대 포털로 로그인</Text>}
      </TouchableOpacity>
      <Text style={{ color: FAINT, fontSize: 11.5, marginTop: 14, lineHeight: 17 }}>
        비밀번호는 학교 포털 확인에 한 번 쓰이고 저장하지 않아요.{'\n'}이후에는 학교가 발급한 연결값으로만 동작합니다.
      </Text>
    </ScrollView>
  );
}

function MyShelf({ session, setSession }) {
  const [info, setInfo] = useState(null);
  const [loans, setLoans] = useState(null);
  const [pickups, setPickups] = useState(null);
  useEffect(() => {
    if (!session) { setInfo(null); setLoans(null); setPickups(null); return; }
    myApi(session.token, 'info').then((d) => setInfo(d.data || {}));
    myApi(session.token, 'loans').then((d) => setLoans([].concat((d.data || {}).item || [])));
    myApi(session.token, 'pickups').then((d) => {
      const all = [].concat((d.data || {}).item || []);
      // 진행 중 판정은 날짜로: 대출됐거나 취소됐으면 종료 (8/9 교훈 — 상태코드 추측 금지)
      setPickups(all.filter((x) => !x.loan_date && !x.cancel_date));
    });
  }, [session]);
  if (!session) return <LoginForm onLogin={setSession} />;
  const due = (b) => b.return_date || b.return_due_date || b.due_date || b.returnDate || '';
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[s.secT, { fontSize: 22, flex: 1 }]}>{session.name} 님</Text>
        <TouchableOpacity onPress={() => setSession(null)}>
          <Text style={{ color: FAINT, fontSize: 12.5 }}>로그아웃</Text>
        </TouchableOpacity>
      </View>
      {info ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {[['빌린 책', info.loanCount], ['연체', info.overDueCount], ['예약', info.reserveCount]].map(([t, n]) => (
            <View key={t} style={s.statPill}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: Number(n) > 0 ? TXT : FAINT }}>{n ?? 0}</Text>
              <Text style={{ fontSize: 10.5, color: LIGHT, marginTop: 1 }}>{t}</Text>
            </View>
          ))}
        </View>
      ) : <ActivityIndicator color={LIGHT} style={{ marginTop: 20 }} />}

      <Text style={[s.secT, { fontSize: 16, marginTop: 26 }]}>빌린 책</Text>
      {loans === null ? <ActivityIndicator color={LIGHT} style={{ marginTop: 14 }} />
        : loans.length === 0
          ? <Text style={{ color: FAINT, fontSize: 13, marginTop: 10 }}>지금 빌린 책이 없어요</Text>
          : loans.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 10, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: TXT, fontSize: 14, fontWeight: '700' }}>{cleanTitle(b.title)}</Text>
                {!!due(b) && <Text style={{ color: LIGHT, fontSize: 11.5, marginTop: 3 }}>반납 {due(b)}</Text>}
              </View>
            </View>
          ))}

      <Text style={[s.secT, { fontSize: 16, marginTop: 26 }]}>기다리는 책</Text>
      {pickups === null ? <ActivityIndicator color={LIGHT} style={{ marginTop: 14 }} />
        : pickups.length === 0
          ? <Text style={{ color: FAINT, fontSize: 13, marginTop: 10 }}>기다리는 책이 없어요</Text>
          : pickups.map((b, i) => (
            <View key={i} style={{ paddingVertical: 10 }}>
              <Text numberOfLines={1} style={{ color: TXT, fontSize: 14, fontWeight: '700' }}>{cleanTitle(b.title)}</Text>
              <Text style={{ color: LIGHT, fontSize: 11.5, marginTop: 3 }}>
                {b.loan_status_name || '진행 중'} · {b.receive_location || '민송도서관'}
              </Text>
            </View>
          ))}
      {!session.personal && (
        <Text style={{ color: '#c0392b', fontSize: 12, marginTop: 20, lineHeight: 18 }}>
          도서관 개인 연동이 아직 안 열렸어요. 다시 로그인해 보세요.
        </Text>
      )}
    </ScrollView>
  );
}

// [키, 라벨, 평소 아이콘, 선택 시 꽉 찬 아이콘]
const TABS = [
  ['home', '홈', 'home-outline', 'home'],
  ['search', '찾기', 'search-outline', 'search'],
  ['cert', '인증', 'book-outline', 'book'],
  ['my', '내 서재', 'library-outline', 'library'],
];

function Main() {
  const [tab, setTab] = useState('home');
  const [pick, setPick] = useState(null);
  const [session, setSession] = useState(null);   // 포털 로그인 세션 (토큰·이름)
  const insets = useSafeAreaInsets();   // 기기별 시스템 바 높이 (상태바·하단 내비게이션)
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={{ flex: 1, paddingTop: insets.top + 4 }}>
        {tab === 'home' && <Home onPick={setPick} goSearch={() => setTab('search')} session={session} goMy={() => setTab('my')} />}
        {tab === 'search' && <Search onPick={setPick} />}
        {tab === 'cert' && <Cert />}
        {tab === 'my' && <MyShelf session={session} setSession={setSession} />}
      </View>
      {/* 탭바 — 시스템 내비게이션 버튼(Ⅲ ◯ <) 위로 정확히 띄운다 */}
      <View style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map(([k, label, icon, iconOn]) => {
          const on = tab === k;
          return (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 4, gap: 3 }}>
              <Ionicons name={on ? iconOn : icon} size={24} color={on ? TXT : '#9aa3ad'} />
              <Text style={{ color: on ? TXT : '#9aa3ad', fontSize: 10.5, fontWeight: on ? '800' : '600' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Detail book={pick} onClose={() => setPick(null)} session={session}
        goLogin={() => { setPick(null); setTab('my'); }} />
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}

const s = StyleSheet.create({
  // 검색 알약 — 회색 채움, 테두리 없음
  searchPill: { flexDirection: 'row', alignItems: 'center', margin: 20, marginBottom: 4,
    backgroundColor: FILL, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  // 홈 상단 고정 — 떠 있는 흰 알약 (또렷한 그림자 + 테두리)
  floatWrap: { position: 'absolute', top: 8, left: 16, right: 16, zIndex: 10 },
  searchFloat: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff',
    borderRadius: 99, paddingVertical: 13, paddingHorizontal: 17,
    borderWidth: 1, borderColor: '#e8eaee',
    shadowColor: '#1a2030', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  fchip: { backgroundColor: FILL, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 14 },
  fchipT: { fontSize: 12, fontWeight: '700', color: SUB },
  searchPillQ: { flex: 1, fontSize: 13.5, color: SUB, marginLeft: 9, fontWeight: '500' },
  searchBtn: { backgroundColor: BTN, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 18 },
  // 인증 미션 카드 — 문장 + 4칸 세그먼트 + 텍스트 링크
  certBlock: { backgroundColor: CREAM, borderRadius: 20, padding: 18, marginTop: 16 },
  cEye: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: GOLD_D, marginBottom: 6 },
  certTitle: { fontSize: 17, fontWeight: '800', color: TXT, letterSpacing: -0.3 },
  certIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f3ecd6', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  certSeg: { flex: 1, height: 8, borderRadius: 99, backgroundColor: '#ebe3cc' },
  cS: { fontSize: 12.5, color: SUB, lineHeight: 19 },
  rowLink: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  // 섹션
  secH: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 14 },
  secT: { fontSize: 18, fontWeight: '800', color: TXT, letterSpacing: -0.3 },
  secM: { fontSize: 12, color: GOLD_D, fontWeight: '700' },
  railN: { fontSize: 12, fontWeight: '700', color: TXT, marginTop: 8, lineHeight: 16, letterSpacing: -0.2 },
  railA: { fontSize: 10.5, color: LIGHT, marginTop: 2 },
  pickQ: { fontSize: 15.5, fontWeight: '800', color: TXT, lineHeight: 21, letterSpacing: -0.3 },
  pickW: { fontSize: 12, color: LIGHT, marginTop: 7, lineHeight: 17 },
  chip: { fontSize: 10, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99,
    backgroundColor: FILL, color: SUB, overflow: 'hidden' },
  stepN: { width: 24, height: 24, borderRadius: 12, backgroundColor: FILL, alignItems: 'center', justifyContent: 'center' },
  rkNum: { fontSize: 16, fontWeight: '800', color: TXT, width: 24, textAlign: 'center' },
  mv: { fontSize: 9, fontWeight: '800', width: 30, textAlign: 'center' },
  foot: { padding: 22, paddingBottom: 8, fontSize: 10, color: FAINT, textAlign: 'center', lineHeight: 15 },
  resultTitle: { color: TXT, fontSize: 14.5, lineHeight: 20, fontWeight: '700' },
  input: { backgroundColor: FILL, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 14.5, color: TXT, marginTop: 12 },
  statPill: { flex: 1, backgroundColor: FILL, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  badge: { fontSize: 10.5, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, overflow: 'hidden', marginRight: 6 },
  // 모달
  modalBack: { flex: 1, backgroundColor: 'rgba(25,31,40,.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '84%' },
  dTitle: { fontSize: 18, fontWeight: '800', color: TXT, lineHeight: 25, letterSpacing: -0.3 },
  dMeta: { color: SUB, marginTop: 7, fontSize: 13 },
  dMeta2: { color: LIGHT, marginTop: 3, fontSize: 12 },
  desc: { color: SUB, marginTop: 18, fontSize: 13.5, lineHeight: 21 },
  cta: { backgroundColor: BTN, borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 20 },
  ctaT: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabBar: { flexDirection: 'row', backgroundColor: '#ffffff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    shadowColor: '#1a2030', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -5 }, elevation: 16 },
});

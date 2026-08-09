# -*- coding: utf-8 -*-
"""세명대 튤립(TulipWeb2) 공식 API → semyung_tulip 테이블 수집기.

사용:
  python scripts/tulip_sync.py --test          # 소량(1페이지=1000건) 테스트 적재
  python scripts/tulip_sync.py --full          # 전수 수집 (약 319페이지)
  python scripts/tulip_sync.py --enrich-ebook  # 전자책만 bookinfo로 barcode·뷰어링크 보강
  python scripts/tulip_sync.py --daily         # 신착 증분 (last_max_ctrl 위로)

쓰기 = Supabase Management API SQL (RLS 우회). 토큰: 환경변수 SUPABASE_ACCESS_TOKEN
또는 hwik-web/.env 의 SUPABASE_ACCESS_TOKEN.
규칙: 요청 간격 0.5초(전수)/0.3초(bookinfo), User-Agent 명시. 표지는 P2에서 별도.
"""
import sys, io, os, re, json, time, argparse, ssl, html
import urllib.request, urllib.parse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 BookstarSync/1.0"
TULIP = "https://lib.semyung.ac.kr/openapi"
PROJECT = "gkujptyfrzqrjrvovbnc"
MGMT = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"

def find_token():
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if tok: return tok.strip()
    envp = os.path.join(os.path.expanduser("~"), "Desktop", "hwik-web", ".env")
    if os.path.exists(envp):
        for line in open(envp, encoding="utf-8", errors="replace"):
            m = re.match(r"\s*SUPABASE_ACCESS_TOKEN\s*=\s*(\S+)", line)
            if m: return m.group(1).strip().strip("\"'")
    sys.exit("토큰 없음: SUPABASE_ACCESS_TOKEN 환경변수 또는 hwik-web/.env 필요")

TOKEN = find_token()

def http(url, data=None, headers=None, timeout=60):
    h = {"User-Agent": UA}; h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", "replace")

def sql(query, timeout=60):
    body = json.dumps({"query": query}).encode()
    return http(MGMT, data=body, headers={
        "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}, timeout=timeout)

def tulip(path, **params):
    qs = urllib.parse.urlencode(params, encoding="utf-8")
    return http(f"{TULIP}/{path}?{qs}", timeout=45)

# ---------- 파싱 ----------
DATA_RE = re.compile(r'<data num="\d+"([^>]*)>(.*?)</data>', re.S)
def cdata(inner, tag):
    m = re.search(rf"<{tag}><!\[CDATA\[(.*?)\]\]></{tag}>", inner, re.S)
    return (m.group(1) if m else "").strip()

def parse_search(xml):
    """검색 응답 → 레코드 dict 목록"""
    out = []
    for attrs, inner in DATA_RE.findall(xml):
        ctrl = re.search(r'CTRL="([^"]*)"', attrs)
        if not ctrl: continue
        title = cdata(inner, "DISP01")
        if not title: continue
        isbn = cdata(inner, "DISP08")
        if not re.search(r"\d{9}", isbn): isbn = ""
        out.append({
            "ctrl": ctrl.group(1),
            "title": re.sub(r"\[32703m", "", title),   # 하이라이트 잔재 제거
            "author": cdata(inner, "DISP02"),
            "publisher": cdata(inner, "DISP03"),
            "pub_year": cdata(inner, "DISP06"),
            "call_no": cdata(inner, "DISP04"),
            "class_no": cdata(inner, "DISP05"),
            "isbn": isbn,
            "reg_date": cdata(inner, "DISP09") or cdata(inner, "INDT"),
            "mat_type": cdata(inner, "LIMT01"),
            "lang": cdata(inner, "LIMT03"),
        })
    return out

def is_ebook(rec):
    return "[전자책]" in rec["title"]

# ---------- 적재 ----------
def esc(s):
    if s is None: return "null"
    s = str(s).replace("\\", "").replace("'", "''")
    s = re.sub(r"[\x00-\x1f]", " ", s)          # 제어문자 금지 (Mgmt API 파싱)
    return "'" + s.strip() + "'"

def norm_url(u):
    """표지 URL 정규화. 유효한 http(s) 절대주소면 반환, 아니면 "".
    네이버 프록시(/openapi/thumbnail)가 'http://https://lib.semyung...' 처럼
    스킴을 이중으로 붙여 보내는 응답이 섞여 있다(2026-08-09 실측 147건 — 브라우저에서
    전부 로드 실패). startswith("http")만 보면 그대로 통과하므로 여기서 잘라낸다."""
    u = (u or "").strip()
    while re.match(r"^https?://(https?://)", u):
        u = re.sub(r"^https?://", "", u, count=1)
    return u if re.match(r"^https?://[^/\s]+/", u) else ""

def upsert_rows(rows):
    """페이지 전체를 한 번의 Mgmt API 요청으로 upsert (200행 인서트문 여러 개를 ;로 결합).
    reg_date도 인서트문에 포함. 반환: 시도 행수"""
    stmts = []
    for i in range(0, len(rows), 200):
        chunk = rows[i:i+200]
        vals = []
        for r in chunk:
            kind = "ebook" if is_ebook(r) else "paper"
            st = " ".join(x for x in [r["title"], r["author"], r["publisher"]] if x)
            vals.append("(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)" % (
                esc(r["ctrl"]), esc(kind), esc(r["title"]), esc(r["author"]),
                esc(r["publisher"]), esc(r["pub_year"]), esc(r["isbn"] or None),
                esc(r["call_no"]), esc(r["class_no"]), esc(r["lang"]),
                esc(r["mat_type"]), esc(r["reg_date"] or None), esc(st)))
        stmts.append(
            "insert into semyung_tulip (ctrl,kind,title,author,publisher,pub_year,isbn,"
            "call_no,class_no,lang,mat_type,reg_date,search_text) values " + ",".join(vals) +
            " on conflict (ctrl) do update set kind=excluded.kind,title=excluded.title,"
            "author=excluded.author,publisher=excluded.publisher,pub_year=excluded.pub_year,"
            "isbn=excluded.isbn,call_no=excluded.call_no,class_no=excluded.class_no,"
            "lang=excluded.lang,mat_type=excluded.mat_type,reg_date=excluded.reg_date,"
            "search_text=excluded.search_text,updated_at=now()")
    sql("; ".join(stmts))
    return len(rows)

# ---------- 모드 ----------
def run_sweep(max_pages, label):
    print(f"[{label}] 전수 수집 시작 (display=1000)")
    total = 0; fails = []
    for pg in range(1, max_pages + 1):
        try:
            xml = tulip("search", verb="alpha", target="total", query="TOTAL",
                        display="1000", page=str(pg))
            rows = parse_search(xml)
        except Exception as e:
            print(f"  page {pg} 실패: {e} — 재시도 1회")
            time.sleep(3)
            try:
                xml = tulip("search", verb="alpha", target="total", query="TOTAL",
                            display="1000", page=str(pg))
                rows = parse_search(xml)
            except Exception as e2:
                fails.append(pg); print(f"  page {pg} 재실패: {e2}"); continue
        if not rows:
            print(f"  page {pg}: 0건 → 종료")
            break
        upsert_rows(rows)
        total += len(rows)
        if pg % 10 == 0 or pg == 1:
            print(f"  page {pg}: 누적 {total:,}건")
        time.sleep(0.5)
    print(f"[{label}] 완료: {total:,}건 적재, 실패 페이지 {fails or '없음'}")
    return total

def enrich_ebooks(limit=None):
    """전자책의 barcode·viewer_url·vendor를 bookinfo로 보강.
    UPDATE문은 100건씩 모아 Mgmt API 한 번에 전송 (건당 왕복 제거 — 9h→4h대)"""
    print("[enrich] 전자책 보강 시작")
    res = json.loads(sql("select ctrl from semyung_tulip where kind='ebook' and barcode is null"
                         + (f" limit {limit}" if limit else "")))
    ctrls = [r["ctrl"] for r in res]
    print(f"  대상 {len(ctrls):,}건")
    done = 0; buf = []
    def flush():
        if not buf: return
        try:
            sql("; ".join(buf))
        except Exception as e:
            print(f"  flush 실패({len(buf)}건 — 재실행 시 barcode null로 재수집됨): {e}")
        buf.clear()
    for ctrl in ctrls:
        try:
            xml = tulip("bookinfo", verb="all", cid="CAT" + ctrl)
        except Exception:
            time.sleep(2); continue
        u = re.search(r"<uri_856>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</uri_856>", xml, re.S)
        url = (u.group(1).strip() if u else "").replace("&amp;", "&")
        bc = re.search(r"(?:barcode|brcd)=([0-9A-Za-z]+)", url)   # 교보=barcode, YES24=brcd
        vendor = "kyobo" if "교보" in xml else ("yes24" if "YES24" in xml else None)
        sets = ["updated_at=now()"]
        if url: sets.append("viewer_url=" + esc(url))
        if bc:
            sets.append("barcode=" + esc(bc.group(1)))
            if vendor == "kyobo":   # 교보 표지는 바코드로 즉시 조립 (실측 검증됨)
                sets.append("cover_url=" + esc(
                    f"https://ebook.semyung.ac.kr/upload/20213/content/ebook/{bc.group(1)}/L{bc.group(1)}.jpg"))
        if vendor: sets.append("vendor=" + esc(vendor))
        buf.append(f"update semyung_tulip set {', '.join(sets)} where ctrl={esc(ctrl)}")
        if len(buf) >= 100: flush()
        done += 1
        if done % 500 == 0: print(f"  {done:,}/{len(ctrls):,}")
        time.sleep(0.3)
    flush()
    print(f"[enrich] 완료 {done:,}건")

# ---------- 표지 (P2) ----------
ALADIN_KEY = os.environ.get("ALADIN_TTBKEY", "ttbbgtrfvcdewsx771056001")

def _norm(s):
    return re.sub(r"[\s,:·\-—~()\[\]]+", "", (s or "")).lower()

def clean_title(t):
    """튤립 서명 → 검색용 본제목. '제목 : 부제 / [전자책]. 8 = Tokyo' → '제목'"""
    t = re.sub(r"\s*/?\s*\[전자책\].*$", "", t or "")
    t = re.sub(r"^\([^)]{1,20}\)\s*", "", t)        # 선두 (에이든) 류 관형구
    base = re.split(r"[:/=\[]", t)[0].strip()
    return base or t.strip()

def surname(author):
    """MARC 저자 '토드, 안나'→'토드', '김선태'→'김선태' (성 일치 가드용)"""
    return (author or "").split(",")[0].split(";")[0].strip()

_aladin_calls = 0
def aladin(endpoint, **params):
    global _aladin_calls
    _aladin_calls += 1
    params.update({"ttbkey": ALADIN_KEY, "output": "js", "Version": "20131101"})
    qs = urllib.parse.urlencode(params, encoding="utf-8")
    try:
        d = json.loads(http(f"https://www.aladin.co.kr/ttb/api/{endpoint}.aspx?{qs}", timeout=25))
        return d.get("item") or []
    except Exception:
        return []

def _cover(it):
    c = (it.get("cover", "") or "").replace("\\/", "/").replace("/coversum/", "/cover200/")
    if not c or "noimg" in c.lower(): return ""   # 알라딘 '표지없음' placeholder(noimg_*.gif) 제외 — 진짜 표지 아님
    return norm_url(c)

def _desc(it):
    d = re.sub(r"<[^>]+>", " ", it.get("description", "") or "")
    # HTML 엔티티 해제 — 앱은 textContent로 그리므로 &lt;책제목&gt;이 그대로 노출된다.
    # (2026-08-09: 구 이식분 1,638건이 이 상태로 들어와 있어 일괄 정정함)
    d = html.unescape(d)
    # 해제로 되살아난 '진짜 HTML 태그'만 제거. <[^>]+> 로 싹 지우면 안 된다 —
    # 책 제목의 <리버 보이> 같은 홑화살괄호까지 사라진다(실측).
    d = re.sub(r"</?(?:b|i|u|p|br|hr|div|span|strong|em|a|img|font|ul|ol|li|h[1-6]|table|tr|td)\b[^>]*>",
               " ", d, flags=re.I)
    return re.sub(r"\s+", " ", d).strip()[:1200]

def aladin_cover_isbn(isbn, order=("Book", "eBook")):
    """ISBN 직조회 — 오매칭 없음. ISBN10(구간)/ISBN13 자동감지(옛 종이책은 10자리).
    전자책은 order=("eBook","Book")로 호출 절약. 반환 (cover, desc)"""
    clean = re.sub(r"[^0-9Xx]", "", isbn or "")
    idtype = "ISBN13" if len(clean) == 13 else "ISBN"   # 알라딘: ISBN=10자리, ISBN13=13자리
    for st in order:
        items = aladin("ItemLookUp", itemIdType=idtype, ItemId=clean, SearchTarget=st)
        if items:
            return _cover(items[0]), _desc(items[0])
    return "", ""

def aladin_cover_search(title, author):
    """제목+저자 엄격매칭 — 저자 성 일치 필수(8/6 오매칭 70% 실증 교훈). 반환 (cover, desc)"""
    base = clean_title(title)
    if not base: return "", ""
    sn = surname(author)
    q = urllib.parse.quote((base + " " + sn).strip())
    items = aladin("ItemSearch", Query=q, QueryType="Keyword", MaxResults=5)
    tkey = _norm(base); akey = _norm(sn)
    for it in items:
        it_t = _norm(it.get("title", "")); it_a = _norm(it.get("author", ""))
        title_ok = tkey and (it_t.startswith(tkey) or tkey in it_t)
        author_ok = akey and akey in it_a          # 성 미일치는 무조건 탈락
        if title_ok and author_ok:
            return _cover(it), _desc(it)
    return "", ""  # 확신 없으면 빈손 (오답표지보다 안전)

def covers_yes24(limit=None, budget=4500):
    """YES24 전자책 표지: ①ISBN 직조회 ②엄격 제목검색. 실패는 cover_url='' 마킹(재시도 방지).
    budget = 알라딘 일 호출한도 안전선(기본키 5,000/일)"""
    res = json.loads(sql(
        "select ctrl, title, author, isbn from semyung_tulip "
        "where vendor='yes24' and cover_url is null order by ctrl"
        + (f" limit {limit}" if limit else "")))
    print(f"[covers-yes24] 대상 {len(res):,}건 (알라딘 예산 {budget:,}회)")
    hit_isbn = 0; hit_search = 0; miss = 0; buf = []
    def flush():
        if not buf: return
        try: sql("; ".join(buf))
        except Exception as e: print(f"  flush 실패({len(buf)}건): {e}")
        buf.clear()
    for r in res:
        if _aladin_calls >= budget:
            print(f"  예산 소진 — 남은 {len(res)-hit_isbn-hit_search-miss:,}건은 내일 재실행")
            break
        cov = dsc = ""
        if r["isbn"]:
            cov, dsc = aladin_cover_isbn(r["isbn"], order=("eBook", "Book"))
        if not cov:
            cov, dsc = aladin_cover_search(r["title"], r["author"])
        if cov:
            extra = f", description={esc(dsc)}" if dsc else ""
            buf.append(f"update semyung_tulip set cover_url={esc(cov)}{extra}, updated_at=now() where ctrl={esc(r['ctrl'])}")
            if r["isbn"]: hit_isbn += 1
            else: hit_search += 1
        else:
            # ''=시도했으나 실패 (null=미시도와 구분, 앱은 falsy로 동일 처리→타이포 표지)
            buf.append(f"update semyung_tulip set cover_url='', updated_at=now() where ctrl={esc(r['ctrl'])}")
            miss += 1
        if len(buf) >= 100: flush()
        n = hit_isbn + hit_search + miss
        if n % 200 == 0: print(f"  {n:,}/{len(res):,} (ISBN {hit_isbn} / 검색 {hit_search} / 실패 {miss})")
        time.sleep(0.15)
    flush()
    print(f"[covers-yes24] 완료 — ISBN조회 {hit_isbn:,} + 엄격검색 {hit_search:,} 채움, 실패 {miss:,}, 알라딘 호출 {_aladin_calls:,}회")

def covers_paper_aladin(limit=None, budget=4500, desc_only=False):
    """종이책 단행본 표지+설명 백필: ISBN 있고 표지 없는 것 → 알라딘 ISBN 직조회.
    네이버(/openapi/thumbnail)에 없던 ~5.9만 보강. 표지와 함께 description도 채움.
    실패는 cover_url='' 마킹(다음날 재시도 방지, 앱은 falsy→타이포 표지)."""
    # 두 개의 풀을 우선순위로 이어서 처리한다(알라딘 호출 1건당 성과가 큰 쪽 먼저).
    #  pri=0 표지 없음(5.3만) — 알라딘 매칭 50%, 성공분의 47%가 줄거리 동반
    #  pri=1 표지는 있는데 줄거리 없음(16.2만, 네이버 thumbnail이 표지만 준 것) — ISBN 100% 보유
    #        2026-08-09 실측(무작위 120건): 알라딘 매칭 120/120(100%), 줄거리 확보 84(70%).
    #        2010년대 78%·2020년대 93%. 표지 풀이 마르면 예산이 자동으로 이쪽으로 흐른다.
    # 정렬 = 무작위(md5). ctrl은 '등록 순번'이라 같이 들어온 책(일괄구매·기증)이 붙어 있어
    # ctrl 정렬은 실패가 뭉텅이로 이어진다. 2026-08-09 실측: ctrl desc 선두 7.5% vs 무작위 50.0%.
    take = limit or int(budget * 1.1) + 50        # 예산만큼만 가져온다(21만 행 전량 fetch 방지)
    # 정렬키(ord)를 각 서브쿼리가 직접 만들어 붙인다. 바깥에서 다시 정렬하면 안쪽 순서가 날아간다.
    base = ("select ctrl, isbn, {pri} as pri, {ord} as ord from semyung_tulip "
            "where kind='paper' and mat_type='m' and isbn is not null and isbn<>'' and {cond}")
    # pri0(표지) = 무작위. ctrl은 '등록 순번'이라 같이 들어온 책(일괄구매·기증)이 붙어 있어
    #   ctrl 정렬은 실패가 뭉텅이로 이어진다(실측: ctrl desc 선두 7.5% vs 무작위 50.0%).
    q0 = base.format(pri=0, ord="md5(ctrl)", cond="cover_url is null") + f" order by ord limit {take}"
    # pri1(줄거리) = 최신 발행 우선. 확보율이 발행연도에 강하게 비례(실측 120건):
    #   2020년대 93% / 2010년대 78% / 2000년대 39% / 1990년대 0%
    #   16.2만권 전체는 39일이지만 2010년 이후 12.7만권이 성과의 89%(10.5만건)를 차지한다
    #   → 최신순이면 열흘이면 2020년대(약 3.8만건)가 끝나 체감이 훨씬 빠르다.
    # pub_year는 text에 '1996-' 같은 값도 있어 4자리만 뽑고, 9999-연도로 뒤집어 오름차순 정렬키를 만든다
    # (연도 없으면 9999 = 맨 뒤). 같은 연도 안에서는 md5로 섞는다.
    ORD1 = ("lpad((9999 - coalesce(nullif(substring(pub_year from '[0-9]{4}'),'')::int, 0))::text, 4, '0')"
            " || md5(ctrl)")
    q1 = (base.format(pri=1, ord=ORD1, cond="cover_url is not null and cover_url<>'' and description is null")
          + f" order by ord limit {take}")
    inner = q1 if desc_only else f"({q0}) union all ({q1})"
    res = json.loads(sql(f"select * from ({inner}) u order by pri, ord limit {take}", timeout=180))
    n0 = sum(1 for r in res if r["pri"] == 0)
    print(f"[covers-paper-aladin] 대상 {len(res):,}건 (표지 {n0:,} + 줄거리 {len(res)-n0:,}) / 알라딘 예산 {budget:,}회")
    hit = miss = dhit = dmiss = 0; buf = []
    def flush():
        if not buf: return
        try: sql("; ".join(buf))
        except Exception as e: print(f"  flush 실패({len(buf)}건): {e}")
        buf.clear()
    for r in res:
        if _aladin_calls >= budget:
            print(f"  예산 소진 — 남은 건은 내일 재실행")
            break
        # Book 타깃 1회만. eBook 재조회는 실측 0/111 성공 = 순수 낭비인데 예산의 절반을 먹었다
        # (미보유 ISBN이 대부분이라 '실패=2호출'이 되어 처리량이 반토막났음. 2026-08-09)
        cov, dsc = aladin_cover_isbn(r["isbn"], order=("Book",))
        if r["pri"] == 1:
            # 표지는 이미 있다 — 줄거리만 채운다. 덮어쓰지 않도록 cover_url은 손대지 않는다.
            # 실패도 ''로 남겨 내일 같은 책을 또 조회하지 않게 한다(앱은 ''를 falsy로 처리).
            buf.append(f"update semyung_tulip set description={esc(dsc or '')}, "
                       f"updated_at=now() where ctrl={esc(r['ctrl'])}")
            if dsc: dhit += 1
            else:   dmiss += 1
        elif cov:
            extra = f", description={esc(dsc)}" if dsc else ""
            buf.append(f"update semyung_tulip set cover_url={esc(cov)}{extra}, updated_at=now() where ctrl={esc(r['ctrl'])}")
            hit += 1
        else:
            buf.append(f"update semyung_tulip set cover_url='', updated_at=now() where ctrl={esc(r['ctrl'])}")
            miss += 1
        if len(buf) >= 100: flush()
        n = hit + miss + dhit + dmiss
        if n % 200 == 0: print(f"  {n:,}/{len(res):,} (표지 {hit}/{hit+miss} · 줄거리 {dhit}/{dhit+dmiss})")
        time.sleep(0.15)
    flush()
    print(f"[covers-paper-aladin] 완료 — 표지 {hit:,}(실패 {miss:,}) / 줄거리 {dhit:,}(없음 {dmiss:,}), "
          f"알라딘 호출 {_aladin_calls:,}회")

TARGET_WHERE = {   # 임베딩 대상: 전자책 전부 + 종이책 단행본(m)·학위논문(t)·미분류('') — 연간물/DVD/지도 제외
    "ebook": "kind='ebook'",
    "paper": "kind='paper' and mat_type in ('m','t','')",
}

def embed_books(limit=None, target="ebook"):
    """임베딩 재생성(P3): title+author+publisher(+description)를 text-embedding-3-small로.
    OpenAI 키 = hwik-web/.env OPENAI_API_KEY. 100건/요청 배치, 저장은 40행/SQL."""
    okey = None
    envp = os.path.join(os.path.expanduser("~"), "Desktop", "hwik-web", ".env")
    for line in open(envp, encoding="utf-8", errors="replace"):
        m = re.match(r"\s*OPENAI_API_KEY\s*=\s*(\S+)", line)
        if m: okey = m.group(1).strip().strip("\"'")
    if not okey: sys.exit("OPENAI_API_KEY 없음 (hwik-web/.env)")
    res = json.loads(sql("select ctrl, title, author, publisher, description from semyung_tulip "
                         f"where {TARGET_WHERE[target]} and embedding is null order by ctrl"
                         + (f" limit {limit}" if limit else ""), timeout=300))
    print(f"[embed:{target}] 대상 {len(res):,}건")
    done = 0
    for i in range(0, len(res), 100):
        chunk = res[i:i+100]
        texts = []
        for r in chunk:
            t = re.sub(r"\s*\[전자책\]\s*", " ", r["title"] or "").strip()
            parts = [t, r["author"] or "", r["publisher"] or ""]
            if r.get("description"): parts.append((r["description"] or "")[:400])
            texts.append(" / ".join(p for p in parts if p)[:1500] or "무제")
        body = json.dumps({"model": "text-embedding-3-small", "input": texts}).encode()
        try:
            d = json.loads(http("https://api.openai.com/v1/embeddings", data=body, headers={
                "Authorization": "Bearer " + okey, "Content-Type": "application/json"}, timeout=120))
            embs = [x["embedding"] for x in d["data"]]
        except Exception as e:
            print(f"  임베딩 실패(batch {i}): {e} — 20초 후 재시도"); time.sleep(20)
            try:
                d = json.loads(http("https://api.openai.com/v1/embeddings", data=body, headers={
                    "Authorization": "Bearer " + okey, "Content-Type": "application/json"}, timeout=120))
                embs = [x["embedding"] for x in d["data"]]
            except Exception as e2:
                print(f"  batch {i} 재실패: {e2} — 건너뜀(재실행 시 회수)"); continue
        for j in range(0, len(chunk), 40):
            stmts = []
            for r, emb, tx in zip(chunk[j:j+40], embs[j:j+40], texts[j:j+40]):
                vec = "[" + ",".join("%.6f" % v for v in emb) + "]"
                stmts.append(f"update semyung_tulip set embedding='{vec}'::vector, embed_text={esc(tx)} where ctrl={esc(r['ctrl'])}")
            try: sql("; ".join(stmts))
            except Exception as e: print(f"  저장 실패({len(stmts)}행): {e}")
        done += len(chunk)
        if done % 1000 < 100: print(f"  {done:,}/{len(res):,}")
        time.sleep(0.2)
    print(f"[embed:{target}] 완료 {done:,}건")
    # 인덱스 재빌드 없음 — 부분 인덱스 2개(idx_tulip_emb_ebook=ivfflat, idx_tulip_emb_paper=HNSW)가
    # insert 시 자동 유지됨. 초기 빌드는 pg_cron(_tulip_idx_ebook/_tulip_idx_paper)이 담당했음.
    # (전량 재빌드가 필요해지면: 마이크로 인스턴스라 Mgmt API 120s·메모리 한계 → pg_cron + 병렬OFF 경로로)

def covers_paper(limit=None):
    """종이책 표지 일괄: 도서관 OPAC과 동일 소스 — /openapi/thumbnail(미문서화, 네이버 책DB 프록시).
    ISBN 배치 50개/POST, apikey·쿠키 불필요(2026-08-06 실측). 네이버 미보유는 null 유지 → tulip-cover(알라딘 lazy) 몫."""
    # reg_date desc: 데일리에서 limit을 걸면 신착부터 — 옛 미보유분을 매일 재조회하지 않음
    res = json.loads(sql(
        "select ctrl, isbn from semyung_tulip where kind='paper' and isbn is not null "
        "and cover_url is null order by reg_date desc, ctrl desc"
        + (f" limit {limit}" if limit else ""), timeout=300))
    print(f"[covers-paper] 대상 {len(res):,}건 (배치 50)")
    done = hit = 0; buf = []
    def flush():
        if not buf: return
        try: sql("; ".join(buf))
        except Exception as e: print(f"  flush 실패({len(buf)}건): {e}")
        buf.clear()
    for i in range(0, len(res), 50):
        chunk = res[i:i+50]
        payload = json.dumps([{"id": r["ctrl"], "isbn": r["isbn"], "sysdiv": "CAT", "ctrl": r["ctrl"]}
                              for r in chunk]).encode()
        try:
            d = json.loads(http(f"{TULIP}/thumbnail", data=payload,
                                headers={"Content-Type": "application/json"}, timeout=45))
        except Exception as e:
            print(f"  batch {i} 실패: {e} — 5초 후 계속"); time.sleep(5); continue
        for jo in (d.get("data") or []):
            th = jo.get("thumbnail")
            if not th: continue
            url = norm_url(th.get("largeUrl") or th.get("smallUrl") or "")
            if not url: continue
            buf.append(f"update semyung_tulip set cover_url={esc(url)}, updated_at=now() where ctrl={esc(jo.get('ctrl') or jo.get('id'))}")
            hit += 1
        if len(buf) >= 100: flush()
        done += len(chunk)
        if done % 5000 < 50: print(f"  {done:,}/{len(res):,} (표지 {hit:,})")
        time.sleep(0.3)
    flush()
    print(f"[covers-paper] 완료 — 조회 {done:,} / 표지 채움 {hit:,} ({(hit*100//max(done,1))}%)")

def inherit_old():
    """구 semyung_books → semyung_tulip 표지·줄거리 이식 (P4 삭제 전 1회, enrich 완료 후 실행).
    barcode=brcd 동일키 매칭 — 오매칭 위험 0. YES24 구 표지는 DRMContent 경로(조립 L{brcd}.jpg와 다름),
    표본 30/30 실이미지·GIF placeholder 0 확인(2026-08-06). 이식으로 알라딘 배치가 잔여분만으로 줄어듦."""
    # 481MB 원본 직접 조인은 statement timeout → 필요한 컬럼만 뽑은 스테이징으로 (embedding TOAST 회피)
    print("[inherit] 스테이징:", sql(
        "drop table if exists _mig_books; "
        "create table _mig_books as select brcd, nullif(description,'') description, "
        "nullif(cover,'') cover from semyung_books; "
        "create index on _mig_books(brcd)", timeout=300)[:80] or "OK")
    # 23k행 일괄 UPDATE는 인덱스 갱신(GIN trgm 등) 부담으로 statement timeout → 끝자리 10분할
    for d in "0123456789":
        r = sql("update semyung_tulip t set description=b.description, updated_at=now() "
                "from _mig_books b where t.barcode=b.brcd and t.kind='ebook' "
                f"and right(t.barcode,1)='{d}' "
                "and coalesce(t.description,'')='' and b.description is not null", timeout=300)
        print(f"[inherit] 줄거리 {d}:", (r or "OK")[:60])
        time.sleep(0.3)
    for d in "0123456789":
        r = sql("update semyung_tulip t set cover_url=b.cover, updated_at=now() "
                "from _mig_books b where t.barcode=b.brcd and t.vendor='yes24' "
                f"and right(t.barcode,1)='{d}' "
                "and coalesce(t.cover_url,'')='' and b.cover like 'http%'", timeout=300)
        print(f"[inherit] YES24 표지 {d}:", (r or "OK")[:60])
        time.sleep(0.3)
    print("[inherit] 스테이징 정리:", sql("drop table if exists _mig_books")[:40] or "OK")
    # 교보 표지는 바코드 조립분이 이미 채워짐(실측 9/9) — 이식 불필요. 잔여 null은 covers-yes24(알라딘) 몫
    res = json.loads(sql("select vendor, count(*) n, count(nullif(cover_url,'')) cv, "
                         "count(nullif(description,'')) ds from semyung_tulip where kind='ebook' group by vendor"))
    print("[inherit] 결과:", res)

def run_daily():
    """신착 증분: last_max_ctrl+1부터 위로, 연속 30개 빈 번호면 종료"""
    st = json.loads(sql("select last_max_ctrl from semyung_sync_state where id=1"))
    last = int(st[0]["last_max_ctrl"])
    if last == 0:
        sys.exit("last_max_ctrl=0 — 먼저 --full 후 --set-max 로 기준점을 세팅하세요")
    print(f"[daily] CTRL {last} 위로 탐색")
    n = last + 1; misses = 0; found = []
    while misses < 30:
        try:
            xml = tulip("bookinfo", verb="all", cid="CAT%012d" % n)
        except Exception:
            time.sleep(2); continue
        t = re.search(r"<title><!\[CDATA\[(.*?)\]\]>", xml)
        if t and t.group(1).strip():
            misses = 0
            title = t.group(1).strip()
            au = re.search(r"<author><!\[CDATA\[(.*?)\]\]>", xml)
            pb = re.search(r"<publisher><!\[CDATA\[(.*?)\]\]>", xml)
            py = re.search(r"<publisher_year><!\[CDATA\[(.*?)\]\]>", xml)
            ind = re.search(r"<input_date><!\[CDATA\[(.*?)\]\]>", xml)
            isbns = [x.strip() for x in re.findall(r"<isbn>([^<]*)</isbn>", xml) if re.search(r"\d{9}", x)]
            kind = "ebook" if ("[전자책]" in title or "E-BOOK" in xml) else "paper"
            ctrl = "%012d" % n
            stext = " ".join(x for x in [title, au.group(1).strip() if au else "", pb.group(1).strip() if pb else ""] if x)
            sql("insert into semyung_tulip (ctrl,kind,title,author,publisher,pub_year,isbn,reg_date,search_text) "
                f"values ({esc(ctrl)},{esc(kind)},{esc(title)},{esc(au.group(1).strip() if au else '')},"
                f"{esc(pb.group(1).strip() if pb else '')},{esc(py.group(1).strip() if py else '')},"
                f"{esc(isbns[0].split()[0] if isbns else None)},{esc(ind.group(1).strip() if ind else '')},{esc(stext)}) "
                "on conflict (ctrl) do update set title=excluded.title, updated_at=now()")
            found.append((n, title[:30]))
            last = n
        else:
            misses += 1
        n += 1
        time.sleep(0.3)
    sql(f"update semyung_sync_state set last_max_ctrl={last}, last_run_at=now(), "
        f"last_result={esc('신착 %d건' % len(found))} where id=1")
    print(f"[daily] 신착 {len(found)}건, last_max_ctrl={last}")
    for n, t in found[:20]: print(f"    {n} {t}")

def set_max():
    # ⚠️ 정상 시퀀스(000000nnnnnn, 10억 미만)의 최대만 기준점으로.
    # 일부 특수자료는 130712160126 같은 timestamp형 ctrl(2013 배치)이라
    # 단순 max로 잡으면 신착 순회가 엉뚱한 번호에서 시작해 새 책을 못 잡음.
    res = json.loads(sql("select max(ctrl::bigint) as m from semyung_tulip "
                         "where ctrl::bigint < 1000000000"))
    m = res[0]["m"] or 0
    sql(f"update semyung_sync_state set last_max_ctrl={m}, last_run_at=now(), "
        f"last_result='set-max' where id=1")
    print(f"last_max_ctrl = {m} (정상 시퀀스 최대)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", action="store_true"); ap.add_argument("--full", action="store_true")
    ap.add_argument("--enrich-ebook", action="store_true"); ap.add_argument("--enrich-limit", type=int)
    ap.add_argument("--covers-yes24", action="store_true"); ap.add_argument("--covers-limit", type=int)
    ap.add_argument("--covers-budget", type=int, default=4500)
    ap.add_argument("--embed-ebook", action="store_true"); ap.add_argument("--embed-paper", action="store_true")
    ap.add_argument("--embed-limit", type=int)
    ap.add_argument("--daily", action="store_true"); ap.add_argument("--set-max", action="store_true")
    ap.add_argument("--inherit", action="store_true")
    ap.add_argument("--covers-paper", action="store_true")
    ap.add_argument("--covers-paper-aladin", action="store_true")
    ap.add_argument("--desc-only", action="store_true",
                    help="표지는 있고 줄거리만 없는 풀(pri=1)만 처리 — 데일리는 표지 우선이라 이 경로가 늦게 열린다. 검증·수동실행용")
    a = ap.parse_args()
    if a.test: run_sweep(1, "test")
    elif a.full: run_sweep(340, "full")
    elif a.enrich_ebook: enrich_ebooks(a.enrich_limit)
    elif a.covers_yes24: covers_yes24(a.covers_limit, a.covers_budget)
    elif a.embed_ebook: embed_books(a.embed_limit, "ebook")
    elif a.embed_paper: embed_books(a.embed_limit, "paper")
    elif a.daily: run_daily()
    elif a.set_max: set_max()
    elif a.inherit: inherit_old()
    elif a.covers_paper: covers_paper(a.covers_limit)
    elif a.covers_paper_aladin: covers_paper_aladin(a.covers_limit, a.covers_budget, a.desc_only)
    else: ap.print_help()

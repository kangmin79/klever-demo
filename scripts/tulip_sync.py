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
import sys, io, os, re, json, time, argparse, ssl
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

def sql(query):
    body = json.dumps({"query": query}).encode()
    return http(MGMT, data=body, headers={
        "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})

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
    return c

def _desc(it):
    d = re.sub(r"<[^>]+>", " ", it.get("description", "") or "")
    return re.sub(r"\s+", " ", d).strip()[:1200]

def aladin_cover_isbn(isbn, order=("Book", "eBook")):
    """ISBN 직조회 — 오매칭 없음. 전자책은 order=("eBook","Book")로 호출 절약. 반환 (cover, desc)"""
    for st in order:
        items = aladin("ItemLookUp", itemIdType="ISBN13", ItemId=isbn, SearchTarget=st)
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

def embed_ebooks(limit=None):
    """전자책 임베딩 재생성(P3): title+author+publisher(+description)를 text-embedding-3-small로.
    OpenAI 키 = hwik-web/.env OPENAI_API_KEY. 100건/요청 배치, 저장은 40행/SQL."""
    okey = None
    envp = os.path.join(os.path.expanduser("~"), "Desktop", "hwik-web", ".env")
    for line in open(envp, encoding="utf-8", errors="replace"):
        m = re.match(r"\s*OPENAI_API_KEY\s*=\s*(\S+)", line)
        if m: okey = m.group(1).strip().strip("\"'")
    if not okey: sys.exit("OPENAI_API_KEY 없음 (hwik-web/.env)")
    res = json.loads(sql("select ctrl, title, author, publisher, description from semyung_tulip "
                         "where kind='ebook' and embedding is null order by ctrl"
                         + (f" limit {limit}" if limit else "")))
    print(f"[embed] 대상 {len(res):,}건")
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
    print(f"[embed] 완료 {done:,}건")
    # ivfflat은 전량 적재 후 재빌드해야 centroid 품질이 나옴 (기본 maintenance_work_mem 32MB로는 부족 → 상향)
    try:
        print("[embed] ivfflat 재빌드:", sql(
            "set maintenance_work_mem='256MB'; drop index if exists idx_tulip_emb; "
            "create index idx_tulip_emb on semyung_tulip "
            "using ivfflat (embedding vector_cosine_ops) with (lists=100)")[:100])
    except Exception as e:
        print(f"[embed] 인덱스 실패(검색은 seq scan으로도 동작, 나중 재시도 가능): {e}")

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
    ap.add_argument("--embed-ebook", action="store_true"); ap.add_argument("--embed-limit", type=int)
    ap.add_argument("--daily", action="store_true"); ap.add_argument("--set-max", action="store_true")
    a = ap.parse_args()
    if a.test: run_sweep(1, "test")
    elif a.full: run_sweep(340, "full")
    elif a.enrich_ebook: enrich_ebooks(a.enrich_limit)
    elif a.covers_yes24: covers_yes24(a.covers_limit, a.covers_budget)
    elif a.embed_ebook: embed_ebooks(a.embed_limit)
    elif a.daily: run_daily()
    elif a.set_max: set_max()
    else: ap.print_help()

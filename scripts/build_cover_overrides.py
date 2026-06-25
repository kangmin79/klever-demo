# 표지 안전망 — 세명대 큐레이션 책 표지를 검사해 placeholder(GIF/초소형 '이미지 준비중')면
# 알라딘 실표지(cover200)로 교체한 books/cover_overrides.json 생성. 앱이 brcd로 적용.
# 소스: 라이브 베스트/신착(semyung-best Edge Fn) + 하드코딩 SEMYUNG_BEST. 매일 빌드 권장.
# 사용: python scripts/build_cover_overrides.py
import re, json, ssl, time, urllib.request, urllib.parse, os

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30.BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc"
AL = os.environ.get("ALADIN_TTBKEY", "ttbbgtrfvcdewsx771056001")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get(u, headers=None):
    h = {"User-Agent": UA}; h.update(headers or {})
    return urllib.request.urlopen(urllib.request.Request(u, headers=h), timeout=25, context=ctx).read()

def get_text(u, headers=None):
    return get(u, headers).decode("utf-8", "replace")

# 하드코딩 SEMYUNG_BEST(앱과 동기화) — brcd, 제목, 저자(매칭 가드용)
HARDCODED = [
    ("4808954682152", "작별하지 않는다", "한강"), ("4801190090019", "우리가 빛의 속도로 갈 수 없다면", "김초엽"),
    ("4808954622035", "살인자의 기억법", "김영하"), ("4808954646079", "바깥은 여름", "김애란"),
    ("4808954681179", "밝은 밤", "최은영"), ("4808972753698", "용의자 X의 헌신", "히가시노 게이고"),
    ("4470894", "고래", "천명관"), ("4808982814471", "연금술사", "파울로 코엘료"),
    ("11951396", "미 비포 유", "조조 모예스"), ("4808954640756", "너무 한낮의 연애", "김금희"),
]

def live_books():
    out = []
    for kind in ("best", "new"):
        try:
            d = json.loads(get_text(
                "https://gkujptyfrzqrjrvovbnc.supabase.co/functions/v1/semyung-best?kind=%s" % kind,
                {"apikey": ANON, "Authorization": "Bearer " + ANON}))
            for b in (d.get("books") or []):
                if b.get("brcd") and b.get("title"):
                    out.append((str(b["brcd"]), b["title"], b.get("cover", ""), b.get("author", "")))
        except Exception as e:
            print("live %s ERR %s" % (kind, e))
    return out

def semyung_cover_url(brcd):
    return "https://ebook.semyung.ac.kr/upload/20213/content/ebook/%s/L%s.jpg" % (brcd, brcd)

def is_placeholder(cover_url):
    """표지가 placeholder인지: 표지없음 / GIF(준비중).
    ⚠️ 신호는 GIF만. 크기 기준 금지 — 실표지도 6KB로 작을 수 있어 오판함(예: '고래' 6.4KB JPEG는 실표지).
    ⚠️ 접근 실패(세명대 차단/404 등)는 placeholder로 보지 않음 → 오답표지 사고 방지."""
    if not cover_url:
        return True                 # 표지 URL 자체가 없음 = 교체 대상
    if cover_url.startswith("//"):
        cover_url = "https:" + cover_url
    try:
        data = get(cover_url)
    except Exception:
        return False                # 접근 실패 → 원본 유지(교체 안 함)
    return data[:4] == b"GIF8"      # '이미지 준비중' placeholder는 .jpg로 위장한 GIF (실표지는 JPEG/PNG)

def _key(s):
    return re.sub(r"[\s,:·\-—~()\[\]]+", "", (s or "")).lower()

def aladin_cover(title, author):
    # 제목+저자로 검색 → 결과 제목·저자가 기대와 맞을 때만 표지 채택(엉뚱한 책 방지)
    base = re.split(r"[:\[(]", title)[0].strip() or title.strip()
    q = urllib.parse.quote((base + " " + (author or "")).strip())
    try:
        h = get_text("https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=%s&Query=%s&QueryType=Keyword"
                     "&MaxResults=3&output=js&Version=20131101" % (AL, q))
        items = json.loads(h).get("item") or []
    except Exception:
        return ""
    tkey = _key(base); akey = _key(author)
    for it in items:
        it_t = _key(it.get("title", "")); it_a = _key(it.get("author", ""))
        title_ok = tkey and (tkey in it_t or it_t.startswith(tkey[:6]))
        author_ok = (not akey) or (akey[:3] in it_a)
        if title_ok and author_ok:
            c = (it.get("cover", "") or "").replace("\\/", "/").replace("/coversum/", "/cover200/")
            if c:
                return c
    return ""  # 확신 없으면 교체 안 함(placeholder 유지가 오답표지보다 안전)

def main():
    # 수집: brcd -> (title, known_cover, author)
    books = {}
    for brcd, title, cover, author in live_books():
        books[brcd] = (title, cover, author)
    for brcd, title, author in HARDCODED:
        books.setdefault(brcd, (title, semyung_cover_url(brcd), author))

    overrides = {}
    ph = 0
    for brcd, (title, cover, author) in books.items():
        use = cover or semyung_cover_url(brcd)
        if is_placeholder(use):
            ac = aladin_cover(title, author)
            if ac:
                overrides[brcd] = ac; ph += 1
                print("[PLACEHOLDER→알라딘] %s  %s / %s" % (brcd, title, author))
            else:
                print("[PLACEHOLDER·확신매칭없음] %s  %s / %s" % (brcd, title, author))
        time.sleep(0.1)
    out_path = os.path.join(HERE, "books", "cover_overrides.json")
    json.dump(overrides, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("\n총 %d권 검사 / placeholder 교체 %d → %s" % (len(books), ph, out_path))

if __name__ == "__main__":
    main()

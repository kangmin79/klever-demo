# 세명대 전자도서관 신착(최근 6개월 발행분) → Supabase public.semyung_new 적재.
# 소스: ebook.semyung.ac.kr 카탈로그 contentList.ink (기본정렬=발행일 내림차순, 로그인/봇체크 없음).
# 사용: SUPABASE_SERVICE_ROLE=... python build_semyung_new.py   (또는 인자로 키 전달)
# 매일 1회 자동 실행 권장(GitHub Actions/cron). 멱등 upsert(brcd PK).
import re, os, sys, json, urllib.request, datetime

REF = "gkujptyfrzqrjrvovbnc"
SVC = os.environ.get("SUPABASE_SERVICE_ROLE") or (sys.argv[1] if len(sys.argv) > 1 else "")
if not SVC:
    sys.exit("SUPABASE_SERVICE_ROLE 환경변수 또는 인자로 service_role 키 필요")
CUTOFF = (datetime.date.today() - datetime.timedelta(days=183)).isoformat()  # 약 6개월
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
RFR = "https://ebook.semyung.ac.kr/elibrary-front/main/main.ink"
BASE = "https://ebook.semyung.ac.kr/elibrary-front/content/contentList.ink?cttsDvsnCode=001&lbryCode=20213&pageIndex=%d"


def fetch(p):
    req = urllib.request.Request(BASE % p, headers={"User-Agent": UA, "Referer": RFR})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def parse(h):
    books = re.findall(r'(<li>(?:(?!<li>).)*?class="img".*?</li>\s*</ul>.*?</li>)', h, re.S)
    rows = []
    for b in books:
        brcd = re.search(r"fnContentClick\(this, '\d+', '(\d+)'", b)
        if not brcd:
            continue
        bc = brcd.group(1)
        tit = re.search(r'<li class="tit"><a[^>]*>([^<]+)</a>', b)
        wr = re.search(r'<li class="writer">(.*?)</li>', b, re.S)
        store = re.search(r'<span class="store">([^<]+)</span>', b)
        txt = re.search(r'<li class="txt">(.*?)</li>', b, re.S)
        author = pub = date = ""
        if wr:
            m = re.match(r"(.*?)<span>(.*?)</span>(.*)", wr.group(1), re.S)
            if m:
                author = m.group(1).strip()
                pub = m.group(2).strip()
                date = re.sub(r"<[^>]+>", "", m.group(3)).strip()
        rows.append(dict(
            brcd=bc, title=(tit.group(1).strip() if tit else ""), author=author,
            publisher=pub, pub_date=date, store=(store.group(1).strip() if store else ""),
            cover="https://ebook.semyung.ac.kr/upload/20213/content/ebook/%s/L%s.jpg" % (bc, bc),
            detail="https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd=" + bc,
            summary=(re.sub(r"\s+", " ", txt.group(1)).strip()[:500] if txt else ""), kind="전자책"))
    return rows


def main():
    all_rows, p = [], 1
    while p <= 30:
        rows = parse(fetch(p))
        if not rows:
            break
        keep = [r for r in rows if r["pub_date"] and r["pub_date"] >= CUTOFF]
        all_rows += keep
        last = rows[-1]["pub_date"]
        print("page %d: %d books, last pubDate %s, kept %d" % (p, len(rows), last, len(keep)))
        if last < CUTOFF:
            break
        p += 1

    seen = {}
    for r in all_rows:
        seen[r["brcd"]] = r
    final = list(seen.values())
    print("TOTAL kept (cutoff %s): %d" % (CUTOFF, len(final)))

    data = json.dumps(final, ensure_ascii=False).encode("utf-8")
    url = "https://%s.supabase.co/rest/v1/semyung_new?on_conflict=brcd" % REF
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SVC, "Authorization": "Bearer " + SVC, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        print("UPSERT:", resp.status)
    except urllib.error.HTTPError as e:
        print("UPSERT ERR", e.code, e.read().decode()[:300])


if __name__ == "__main__":
    main()

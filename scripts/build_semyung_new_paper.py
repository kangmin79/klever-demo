# 세명대 OPAC 종이책 신착(newbook/list 전체) → Supabase public.semyung_new (kind=종이책).
# 소스: lib.semyung.ac.kr/newbook/list?pn=N&page_scale=100 (입고 최신순, 로그인/봇체크 없음).
# 표지: ISBN13 → 알라딘 ItemLookUp. reckey(CATTOT)를 brcd PK로 사용.
# 사용: SUPABASE_SERVICE_ROLE=... ALADIN_TTBKEY=... python build_semyung_new_paper.py
# 매일 1회 자동 실행 권장. 멱등 upsert.
import re, os, sys, json, time, urllib.request

REF = "gkujptyfrzqrjrvovbnc"
SVC = os.environ.get("SUPABASE_SERVICE_ROLE") or (sys.argv[1] if len(sys.argv) > 1 else "")
AL = os.environ.get("ALADIN_TTBKEY") or (sys.argv[2] if len(sys.argv) > 2 else "ttbbgtrfvcdewsx771056001")
if not SVC:
    sys.exit("SUPABASE_SERVICE_ROLE 필요")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
LIST = "https://lib.semyung.ac.kr/newbook/list?pn=%d&page_scale=100"


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")


def parse(h):
    rows = []
    for li in re.findall(r'<li class="(?:odd|even)">.*?</li>', h, re.S):
        ct = re.search(r"callThumbnail\('\d+','([0-9A-Za-z]*)','CAT','(\d+)'\)", li)
        if not ct:
            continue
        isbn, reckey = ct.group(1), "CATTOT" + ct.group(2)
        tit = re.search(r"<dt><a[^>]*><span>([^<]+)</span>", li)
        au = re.search(r"저자 :</span>\s*(.*?)\s*</dd>", li, re.S)
        pub = re.search(r"발행처 :</span>\s*(.*?)\s*</dd>", li, re.S)
        yr = re.search(r"발행년도 :</span>\s*([0-9]{4})", li)
        clean = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip() if s else ""
        rows.append(dict(reckey=reckey, isbn13=isbn,
            title=(tit.group(1).strip() if tit else ""),
            author=clean(au.group(1)) if au else "",
            publisher=clean(pub.group(1)) if pub else "",
            year=yr.group(1) if yr else "",
            detail="https://lib.semyung.ac.kr/search/detail/" + reckey))
    return rows


def aladin_cover(isbn):
    if not isbn:
        return ""
    url = ("https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=%s&itemIdType=ISBN13&ItemId=%s"
           "&output=js&Version=20131101" % (AL, isbn))
    try:
        d = json.loads(get(url))
        cov = (d.get("item") or [{}])[0].get("cover", "") or ""
        return re.sub(r"/cover/", "/cover200/", cov)
    except Exception:
        return ""


def main():
    seen = {}
    pn = 1
    while pn <= 30:
        rows = parse(get(LIST % pn))
        if not rows:
            break
        for r in rows:
            seen[r["reckey"]] = r
        print("pn=%d: %d books (누적 %d)" % (pn, len(rows), len(seen)))
        if len(rows) < 100:
            break
        pn += 1
    books = list(seen.values())

    out, nocov = [], 0
    for i, r in enumerate(books):
        cov = aladin_cover(r["isbn13"])
        if not cov:
            nocov += 1
        out.append(dict(brcd=r["reckey"], isbn13=r["isbn13"], title=r["title"], author=r["author"],
            publisher=r["publisher"], pub_year=r["year"], pub_date="", cover=cov, store="",
            detail=r["detail"], summary="", kind="종이책"))
        time.sleep(0.12)
    print("TOTAL 종이책 %d (표지 없음 %d)" % (len(out), nocov))

    data = json.dumps(out, ensure_ascii=False).encode("utf-8")
    url = "https://%s.supabase.co/rest/v1/semyung_new?on_conflict=brcd" % REF
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SVC, "Authorization": "Bearer " + SVC, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        print("UPSERT:", urllib.request.urlopen(req, timeout=60).status)
    except urllib.error.HTTPError as e:
        print("ERR", e.code, e.read().decode()[:300])


if __name__ == "__main__":
    main()

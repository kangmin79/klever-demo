# 우리 학교 대출 랭킹 = 세명대 OPAC 종이책 실대출(최근 1년) → Supabase public.semyung_loan_rank.
# 소스: lib.semyung.ac.kr/statistics/popularloanList?category=1,2,3 (단행본만=게임/비도서 제외, 실제 대출횟수).
# 표지: 제목 → 알라딘 ItemSearch(Title). reckey(CATTOT)=brcd PK.
# 사용: SUPABASE_SERVICE_ROLE=... ALADIN_TTBKEY=... python build_semyung_loan_rank.py
import re, os, sys, json, html, time, datetime, urllib.request, urllib.parse

REF = "gkujptyfrzqrjrvovbnc"
SVC = os.environ.get("SUPABASE_SERVICE_ROLE") or (sys.argv[1] if len(sys.argv) > 1 else "")
AL = os.environ.get("ALADIN_TTBKEY") or (sys.argv[2] if len(sys.argv) > 2 else "ttbbgtrfvcdewsx771056001")
if not SVC:
    sys.exit("SUPABASE_SERVICE_ROLE 필요")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
PERIOD = 365


def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")


def aladin(title):
    q = urllib.parse.quote(re.split(r"[:\[(]", title)[0].strip())
    u = ("https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=%s&Query=%s&QueryType=Title"
         "&MaxResults=1&output=js&Version=20131101" % (AL, q))
    try:
        it = (json.loads(get(u)).get("item") or [{}])[0]
        cov = re.sub(r"/cover(sum|)/", "/cover200/", it.get("cover", "") or "")
        return it.get("isbn13", "") or "", cov
    except Exception:
        return "", ""


def main():
    today = datetime.date.today()
    dtf = (today - datetime.timedelta(days=PERIOD)).strftime("%Y%m%d")
    dtt = today.strftime("%Y%m%d")
    url = "https://lib.semyung.ac.kr/statistics/popularloanList?category=1,2,3&dtf=%s&dtt=%s" % (dtf, dtt)
    h = get(url)
    rows = []
    for tr in re.findall(r'<tr>\s*<td class="num">.*?</tr>', h, re.S):
        g = lambda p: (re.search(p, tr, re.S).group(1).strip() if re.search(p, tr, re.S) else "")
        title = html.unescape(g(r'class="title"><a[^>]*>([^<]+)'))
        brcd = g(r"/search/detail/(CATTOT\d+)")
        if not (title and brcd):
            continue
        rows.append(dict(rank=int(g(r'class="num">(\d+)') or 0), title=title,
            author=html.unescape(re.sub(r"\s+", " ", g(r'class="author">(.*?)</td>'))),
            publisher=html.unescape(g(r'class="publisher">(.*?)</td>')),
            pub_year=g(r'class="publisher_year">(\d{4})'),
            loan_count=int(g(r'class="count">(\d+)') or 0), brcd=brcd,
            detail="https://lib.semyung.ac.kr/search/detail/" + brcd,
            kind="종이책", period_days=PERIOD))
    print("랭킹 %d권 (%s~%s)" % (len(rows), dtf, dtt))

    nocov = 0
    for r in rows:
        r["isbn13"], r["cover"] = aladin(r["title"])
        if not r["cover"]:
            nocov += 1
        time.sleep(0.12)
    print("표지 없음 %d" % nocov)

    data = json.dumps(rows, ensure_ascii=False).encode("utf-8")
    u = "https://%s.supabase.co/rest/v1/semyung_loan_rank?on_conflict=brcd" % REF
    req = urllib.request.Request(u, data=data, method="POST", headers={
        "apikey": SVC, "Authorization": "Bearer " + SVC, "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        print("UPSERT:", urllib.request.urlopen(req, timeout=60).status)
    except urllib.error.HTTPError as e:
        print("ERR", e.code, e.read().decode()[:300])


if __name__ == "__main__":
    main()

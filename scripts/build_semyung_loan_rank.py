# 우리 학교 대출 랭킹 = 세명대 OPAC 종이책 실대출(최근 6개월) + 지난달 대비 순위변동 → public.semyung_loan_rank.
# 소스: lib.semyung.ac.kr/statistics/popularloanList?category=1,2,3 (단행본만=게임/비도서 제외, 실제 대출횟수).
#  - 표시 랭킹/대출수 = 최근 6개월(182일). 30일은 소규모대학 대출수 너무 적음(1위 3회) → 6개월로.
#  - 변동(prev_rank) = '한 달 전 시점의 6개월 순위'와 비교 → "지난달 대비" ▲▼/NEW.
# 표지·ISBN·줄거리: brcd(CATTOT+ctrl) → semyung_tulip(ctrl) 조인(11/9). reckey(CATTOT)=brcd PK.
#   11/9 전환 배경: 알라딘 OpenAPI가 2026-10-30 전면 종료(errorCode 999, 새 주소 없음). 11/2·11/9 실행이 빈 응답을
#   그대로 upsert해 랭킹 50권 표지·ISBN을 ''로 덮어썼다. 실측 11/9: 182일 랭킹 86권 중 84권이 소장목록과 ctrl 일치,
#   83권 표지 보유 → 알라딘 없이 더 잘 채워진다. 조인에 없으면 기존 값을 유지(빈 값으로 덮지 않음).
# 사용: SUPABASE_SERVICE_ROLE=... python build_semyung_loan_rank.py
import re, os, sys, json, html, time, datetime, urllib.request, urllib.parse

REF = "gkujptyfrzqrjrvovbnc"
SVC = os.environ.get("SUPABASE_SERVICE_ROLE") or (sys.argv[1] if len(sys.argv) > 1 else "")
if not SVC:
    sys.exit("SUPABASE_SERVICE_ROLE 필요")
REST = "https://%s.supabase.co/rest/v1" % REF
RH = {"apikey": SVC, "Authorization": "Bearer " + SVC}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
WINDOW = 182  # 표시 랭킹 = 최근 6개월
SHIFT = 30    # 변동 비교 = 한 달 전 시점의 6개월
BASE = "https://lib.semyung.ac.kr/statistics/popularloanList?category=1,2,3&dtf=%s&dtt=%s"


def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")


def parse(h):
    out = []
    for tr in re.findall(r'<tr>\s*<td class="num">.*?</tr>', h, re.S):
        g = lambda p: (re.search(p, tr, re.S).group(1).strip() if re.search(p, tr, re.S) else "")
        title = html.unescape(g(r'class="title"><a[^>]*>([^<]+)'))
        brcd = g(r"/search/detail/(CATTOT\d+)")
        if not (title and brcd):
            continue
        out.append(dict(rank=int(g(r'class="num">(\d+)') or 0), title=title, brcd=brcd,
            author=html.unescape(re.sub(r"\s+", " ", g(r'class="author">(.*?)</td>'))),
            publisher=html.unescape(g(r'class="publisher">(.*?)</td>')),
            pub_year=g(r'class="publisher_year">(\d{4})'),
            loan_count=int(g(r'class="count">(\d+)') or 0)))
    return out


def rest_get(path):
    req = urllib.request.Request(REST + path, headers=dict(RH, **{"User-Agent": UA}))
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def tulip_lookup(brcds):
    """brcd 목록 → {brcd: {isbn, cover_url, description}} (semyung_tulip.ctrl = brcd의 숫자 부분)."""
    out = {}
    ctrl_of = {b: re.sub(r"\D", "", b) for b in brcds}
    ctrls = sorted(set(c for c in ctrl_of.values() if c))
    found = {}
    for part in chunks(ctrls, 60):
        rows = rest_get("/semyung_tulip?select=ctrl,isbn,cover_url,description&ctrl=in.(%s)" % ",".join(part))
        for r in rows:
            found[r["ctrl"]] = r
    for b, c in ctrl_of.items():
        if c in found:
            out[b] = found[c]
    return out


def existing_rank(brcds):
    """이미 저장된 랭킹 행의 isbn13·cover·description — 조인에 없을 때 지우지 않고 유지하기 위해."""
    out = {}
    for part in chunks(sorted(set(brcds)), 60):
        rows = rest_get("/semyung_loan_rank?select=brcd,isbn13,cover,description&brcd=in.(%s)" % ",".join(part))
        for r in rows:
            out[r["brcd"]] = r
    return out


def main():
    today = datetime.date.today()
    ymd = lambda days: (today - datetime.timedelta(days=days)).strftime("%Y%m%d")
    cur = parse(get(BASE % (ymd(WINDOW), ymd(0))))
    prev = parse(get(BASE % (ymd(WINDOW + SHIFT), ymd(SHIFT))))  # 한 달 전 시점의 6개월
    prev_rank = {r["brcd"]: r["rank"] for r in prev}
    print("최근6개월 %d권 (지난달 대비, NEW %d)" % (len(cur), sum(1 for r in cur if r["brcd"] not in prev_rank)))

    nocov = 0; nodesc = 0; from_tulip = 0
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    brcds = [r["brcd"] for r in cur]
    tul = tulip_lookup(brcds)
    old = existing_rank(brcds)
    for r in cur:
        t = tul.get(r["brcd"]) or {}
        o = old.get(r["brcd"]) or {}
        # 우선순위: 소장목록(semyung_tulip) → 기존 저장값 → ''. 빈 값으로 덮어쓰지 않는다(11/2 사고 방지).
        r["isbn13"] = (t.get("isbn") or "") or (o.get("isbn13") or "")
        r["cover"] = (t.get("cover_url") or "") or (o.get("cover") or "")
        r["description"] = (o.get("description") or "") or (t.get("description") or "")[:1000]
        if t: from_tulip += 1
        r["kind"] = "종이책"; r["period_days"] = WINDOW
        r["prev_rank"] = prev_rank.get(r["brcd"])  # None = NEW
        r["detail"] = "https://lib.semyung.ac.kr/search/detail/" + r["brcd"]
        # merge-duplicates 업서트는 payload에 없는 컬럼은 안 건드린다 — updated_at을 안 보내면
        # 이미 있던 brcd(대부분)는 8/4 최초 삽입 시각에 영원히 멈춰 있어 "갱신이 죽었나" 오판하게 된다(8/19 발견).
        r["updated_at"] = now_iso
        if not r["cover"]:
            nocov += 1
        if not r["description"]:
            nodesc += 1
    print("소장목록 일치 %d/%d · 표지 없음 %d · 줄거리 없음 %d" % (from_tulip, len(cur), nocov, nodesc))

    data = json.dumps(cur, ensure_ascii=False).encode("utf-8")
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

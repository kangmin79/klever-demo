# -*- coding: utf-8 -*-
"""교보(MLSS)가 보내준 세명대 전자책 메타 파일(xlsx) → semyung_tulip 구멍 메우기.

2026-08-25 첫 파일: 세명대학교_전자책_메타정보_20260822.xlsx (23,813종, 사용중지 제외).
컬럼: NO·상품번호(=우리 barcode)·도서명·저자명·출판사·출간일·copy수·컨텐츠구분(001=전자책)·공급사(KB/YS)·표지URL·간략소개

하는 일 (전부 멱등 — 다시 돌려도 안전):
  A. 바코드로 맞는 전자책 행 전부: ebook_copies(도서관이 산 부수)·ebook_meta_at(메타에서 확인한 날) 기록
     → "1권 남음" 배지를 '총부수≥2'로 좁힐 때 쓰는 재료. 지금까진 부수를 몰랐다.
  B. 바코드 없는 전자책 행 중 **엄격 매칭**(정규화 제목 유일 + 저자 성 + 출판사 앞 2자)만 바코드·공급사·뷰어주소·표지 연결
     → 검색에서 나와도 빌릴 수 없던 책이 빌릴 수 있게 된다. 느슨한 일치는 연결하지 않는다(틀린 바코드 = 남의 책 대출).
  C. 줄거리 없는 행 → 메타 간략소개(HTML 제거)로. 표지 없는 행 → 메타 표지 URL로.
     → solsup_pool 은 줄거리 없는 전자책을 'gated'로 묶어 두므로, 채우면 추천 풀에 들어갈 수 있다.
     ⚠️ 줄거리를 채운 행은 임베딩이 제목만으로 만들어진 옛것이라 `tulip_sync.py --reembed --reembed-kind ebook` 을 뒤이어 돌릴 것.
  D. 우리 표엔 있는데 메타에 없는 바코드(=사용중지) → ebook_copies=0 (빌릴 수 없는 책 표시. 행은 지우지 않는다 — 기록이 참조한다)

건드리지 않는 것: 제목·저자·출판사(도서관 목록이 원본) / 이미 있는 줄거리·표지 / 권별(1-8권) 메타만 있고 도서관 레코드가 없는 책(합성 ctrl 금지)

사용:
  python scripts/meta_fill_ebook.py --xlsx "D:\\다운로드\\세명대학교_전자책_메타정보_20260822.xlsx" --dry
  python scripts/meta_fill_ebook.py --xlsx ... --one 000000320932      # 한 행만 실제 적용(검증용)
  python scripts/meta_fill_ebook.py --xlsx ... --apply
쓰기 = Supabase Management API SQL (tulip_sync.py와 동일 경로·토큰).
"""
import sys, os, re, json, html, argparse, datetime, collections
# stdout UTF-8 재래핑은 tulip_sync 가 import 시점에 한다 — 여기서 또 감싸면 먼저 감싼 객체가 버려지며 버퍼를 닫아 print가 죽는다(8/25)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import urllib.request
import openpyxl
from tulip_sync import sql, esc   # 같은 토큰·같은 이스케이프 규칙

SB = "https://gkujptyfrzqrjrvovbnc.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrdWpwdHlmcnpxcmpydm92Ym5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNjI0MDcsImV4cCI6MjA5NTczODQwN30."
        "BphB9N1xjfOgrGCPiqwFQNbwotu1HW7fBTDl4sdQSTc")
VENDOR = {"KB": "kyobo", "YS": "yes24"}

def rest(q):
    r = urllib.request.Request(f"{SB}/rest/v1/{q}", headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
    return json.load(urllib.request.urlopen(r, timeout=120))

def rest_all(q):
    out, off = [], 0
    while True:
        d = rest(f"{q}&limit=1000&offset={off}")
        out += d; off += 1000
        if len(d) < 1000: return out

# ---------- 메타 읽기 ----------
def load_meta(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]; rows = ws.iter_rows(values_only=True); next(rows)
    meta = {}
    for r in rows:
        if r[1] is None: continue
        b = str(r[1]).strip()
        meta[b] = {"title": str(r[2] or "").strip(), "author": str(r[3] or ""), "pub": str(r[4] or "").strip(),
                   "date": str(r[5] or ""), "copies": int(r[6] or 1), "kind": str(r[7] or ""), "vendor": str(r[8] or ""),
                   "cover": str(r[9] or "").strip(), "desc": str(r[10] or "")}
    return meta

def clean_desc(d):
    d = d.replace("_x000D_", "\n")
    d = re.sub(r"<br\s*/?>|</p>|</div>", "\n", d, flags=re.I)
    d = html.unescape(re.sub(r"<[^>]+>", "", d))
    d = re.sub(r"\s+", " ", d).strip()          # 한 문단으로 (Mgmt API 제어문자 금지 + 기존 줄거리도 한 문단)
    return d[:2000]

# ---------- 매칭 ----------
norm = lambda s: re.sub(r"[^0-9a-z가-힣]", "", re.sub(r"\[전자책\]|\(전자책\)|=.*$|/.*$|:.*$", "", s or "").lower())
def surname(a):
    a = re.sub(r"[<>]", "", (a or "")).split(">")[0].split(",")[0].split("/")[0].replace(" 저", "").strip()
    return a[:3]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--one", default="", help="이 ctrl 한 행만 실제 적용")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    meta = load_meta(a.xlsx)
    today = datetime.date.today().isoformat()
    print(f"메타 {len(meta):,}종 (전자책 001 = {sum(1 for m in meta.values() if m['kind']=='001'):,})")

    ours = rest_all("semyung_tulip?select=ctrl,barcode,title,author,publisher,cover_url,description,vendor&kind=eq.ebook")
    print(f"우리 전자책 행 {len(ours):,} (바코드 있음 {sum(1 for r in ours if r['barcode']):,})")
    stmts = []          # (단계, ctrl, sql)

    # A. 부수·확인일 — 바코드로 맞는 전부
    a_n = 0
    for r in ours:
        m = meta.get(r["barcode"] or "")
        if not m: continue
        stmts.append(("A", r["ctrl"], f"update semyung_tulip set ebook_copies={m['copies']}, ebook_meta_at='{today}' where ctrl={esc(r['ctrl'])}"))
        a_n += 1

    # B. 바코드 없는 행 ← 엄격 매칭
    by_title = collections.defaultdict(list)
    for r in ours:
        if not r["barcode"]: by_title[norm(r["title"])].append(r)
    have = {r["barcode"] for r in ours if r["barcode"]}
    b_n = 0; b_skip = collections.Counter()
    for b, m in meta.items():
        if m["kind"] != "001" or b in have: continue
        hits = by_title.get(norm(m["title"]), [])
        if not hits: b_skip["제목 불일치(권별·미등록)"] += 1; continue
        if len(hits) > 1: b_skip["제목 중복"] += 1; continue
        h = hits[0]
        s = surname(m["author"])
        if not (s and s in (h["author"] or "")): b_skip["저자 불일치"] += 1; continue
        if not (m["pub"] and m["pub"][:2] in (h["publisher"] or "")): b_skip["출판사 불일치"] += 1; continue
        sets = [f"barcode={esc(b)}", f"vendor={esc(VENDOR.get(m['vendor']))}",
                f"viewer_url={esc('http://ebook.semyung.ac.kr:82/content_check.asp?barcode=' + b)}",
                f"ebook_copies={m['copies']}", f"ebook_meta_at='{today}'", "updated_at=now()"]
        if not (h["cover_url"] or "").startswith("http") and m["cover"].startswith("http"): sets.append(f"cover_url={esc(m['cover'])}")
        d = clean_desc(m["desc"])
        if not (h["description"] or "").strip() and len(d) >= 20: sets.append(f"description={esc(d)}")
        stmts.append(("B", h["ctrl"], f"update semyung_tulip set {', '.join(sets)} where ctrl={esc(h['ctrl'])} and barcode is null"))
        b_n += 1

    # C. 줄거리·표지 — 바코드 있는 행
    c_desc = c_cov = 0
    for r in ours:
        m = meta.get(r["barcode"] or "")
        if not m: continue
        sets = []
        d = clean_desc(m["desc"])
        if not (r["description"] or "").strip() and len(d) >= 20: sets.append(f"description={esc(d)}"); c_desc += 1
        if not (r["cover_url"] or "").startswith("http") and m["cover"].startswith("http"): sets.append(f"cover_url={esc(m['cover'])}"); c_cov += 1
        if sets: stmts.append(("C", r["ctrl"], f"update semyung_tulip set {', '.join(sets)}, updated_at=now() where ctrl={esc(r['ctrl'])}"))

    # D. 사용중지 — 우리 바코드가 메타에 없음
    d_rows = [r for r in ours if r["barcode"] and r["barcode"] not in meta]
    for r in d_rows:
        stmts.append(("D", r["ctrl"], f"update semyung_tulip set ebook_copies=0, ebook_meta_at='{today}', updated_at=now() where ctrl={esc(r['ctrl'])}"))

    print(f"A 부수 기록 {a_n:,} | B 바코드 연결 {b_n} (제외: {dict(b_skip)}) | C 줄거리 {c_desc}·표지 {c_cov} | D 사용중지 {len(d_rows)}: "
          + ", ".join(r['title'][:14] for r in d_rows))
    if a.dry: return

    sql("alter table semyung_tulip add column if not exists ebook_copies int, add column if not exists ebook_meta_at date")
    if a.one:
        todo = [s for s in stmts if s[1] == a.one]
        print(f"--one {a.one}: {len(todo)}문 실행"); [print("   ", st[0], st[2][:160]) for st in todo]
        for _, _, q in todo: sql(q)
        return
    if not a.apply: print("(--apply 또는 --one 없음 — 아무것도 쓰지 않음)"); return
    # 단계 순서대로, 100문씩
    for step in "ABCD":
        qs = [q for s, _, q in stmts if s == step]
        for i in range(0, len(qs), 100):
            sql("; ".join(qs[i:i + 100]), timeout=120)
        print(f"  {step}: {len(qs):,}문 완료")

if __name__ == "__main__":
    main()

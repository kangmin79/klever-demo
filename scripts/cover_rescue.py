# -*- coding: utf-8 -*-
"""표지 구제 — 원본 주소가 죽은(0바이트 마커) 책을 ISBN으로 다른 출처에서 다시 받아 채운다.

    python -u scripts\\cover_rescue.py --kinds ebook          # 오늘 실패한 전자책 구제
    python -u scripts\\cover_rescue.py --kinds paper --limit 500

왜(2026-08-16): 전자책 표지 2.3만 장 미러링에서 48건이 실패 — 세명대 전자도서관 서버에서
    파일이 사라진 것(자존감 수업 등). 종이책 쌍둥이(같은 ISBN)는 0건이라 그 길은 없고,
    정보나루 → 알라딘 순으로 ISBN 재조회가 유일한 구제 경로.
방식: 로컬 0바이트 마커 중 kind 일치 + ISBN13 있는 것 → d4l_book(제목 대조 가드) → aladin_cover_isbn
    → 얻은 URL로 fetch_convert → 로컬 저장 → 스토리지 업로드 → mirror_pushed 기록.
    ⚠️semyung_tulip.cover_url은 갱신하지 않는다(cover_mirror 규율: 출처는 안 지움. 그리고 임베딩 행
    UPDATE 0.45초/행 함정). 서빙은 규약 주소(covers/<ctrl>.webp)라 컬럼 없이도 화면에 바로 뜬다.
"""
import sys, os, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t
import cover_mirror as m

def run(kinds="ebook", limit=None):
    kind_cond = "kind='paper' and mat_type='m'" if kinds == "paper" else f"kind='{kinds}'"
    # 0바이트 마커 = 시도했으나 실패. 폴더가 21만 개라 os.scandir로 한 번만 훑는다.
    zero = set()
    with os.scandir(m.LOCAL_DIR) as it:
        for e in it:
            if e.name.endswith(".webp") and e.stat().st_size == 0:
                zero.add(e.name[:-5])
    print(f"[rescue] 로컬 실패 마커 {len(zero):,}개")
    if not zero: return
    # 어느 kind인지 + ISBN은 DB에서 (마커 ctrl만 IN으로 — 수천 개면 나눠서)
    ctrls = sorted(zero)
    rows = []
    for i in range(0, len(ctrls), 2000):
        chunk = ",".join(f"'{c}'" for c in ctrls[i:i+2000])
        rows += json.loads(t.sql(
            f"select ctrl, isbn, title from semyung_tulip where {kind_cond} and ctrl in ({chunk}) "
            "and isbn ~ '^[0-9]{13}$'", timeout=120))
    if limit: rows = rows[:limit]
    print(f"[rescue] {kinds} 대상(ISBN13 보유) {len(rows):,}건")
    ok = miss = 0
    for r in rows:
        title = t.clean_title(r["title"]) if hasattr(t, "clean_title") else r["title"]
        cov, src = "", ""
        try:
            cov, _ = t.d4l_book(r["isbn"], expect_title=title); src = "정보나루"
        except t.D4LLimit:
            print("  정보나루 한도 — 알라딘만으로 계속"); cov = ""
        if not cov:
            try:
                cov, _ = t.aladin_cover_isbn(r["isbn"], order=("eBook", "Book") if kinds == "ebook" else ("Book", "eBook"),
                                            expect_title=title); src = "알라딘"
            except t.AladinLimit:
                print("  알라딘 한도 — 중단"); break
        if not cov:
            miss += 1; print(f"  ✗ {r['ctrl']} {r['title'][:30]} — 어디에도 없음"); continue
        data, why = m.fetch_convert(cov)
        if not data:
            miss += 1; print(f"  ✗ {r['ctrl']} {r['title'][:30]} — {src} 주소는 있으나 {why}"); continue
        path = os.path.join(m.LOCAL_DIR, r["ctrl"] + ".webp")
        with open(path, "wb") as f: f.write(data)
        up = m.upload(r["ctrl"], data)
        if up:
            t.sql(f"insert into mirror_pushed (ctrl) values ({t.esc(r['ctrl'])}) on conflict do nothing", timeout=30)
        ok += 1
        print(f"  ✓ {r['ctrl']} {r['title'][:30]} ← {src} ({len(data)//1024}KB){'' if up else ' [업로드 실패]'}")
    print(f"[rescue] 완료 — 구제 {ok} / 실패 {miss}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kinds", default="ebook")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    run(a.kinds, a.limit)

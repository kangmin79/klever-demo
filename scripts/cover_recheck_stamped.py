# -*- coding: utf-8 -*-
"""'표지 없음' 도장(cover_url='') 찍힌 종이책을 알라딘 ISBN으로 재조회 — 놓친 표지 회수.

    python -u scripts\\cover_recheck_stamped.py --limit 100     # 표본(히트율 측정)
    python -u scripts\\cover_recheck_stamped.py --budget 4500   # 하루치(알라딘 한도 5,000 안)

왜(2026-08-16): 큐레이션 '하루 25쪽 독서습관'이 활자표지 — DB엔 cover_url=''(미보유 도장)인데 알라딘엔 표지가 있었다.
    8/13 정보나루 한도 오인 사고 잔재·일시 실패가 영구 도장으로 남은 케이스. 한국어+ISBN13 도장 4,693권이 후보.
방식: 도장+kor+ISBN13 → aladin_cover_isbn(제목 대조) → 있으면 fetch_convert→로컬→스토리지→mirror_pushed
    + cover_url 갱신(재도장 방지 — 이건 본표 UPDATE지만 히트분만이라 소량). 없으면 recheck_at 대신
    로컬 파일 0바이트 마커로 '재확인 완료' 표시(다음 실행에서 건너뜀 — 본표 UPDATE 회피).
"""
import sys, os, json, argparse, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t
import cover_mirror as m

def run(limit=None, budget=4500):
    have = set(os.listdir(m.LOCAL_DIR))          # 성공/실패 마커 둘 다 = 이미 다뤘음
    rows, last = [], ""
    while True:
        page = json.loads(t.sql(
            "select ctrl, isbn, title from semyung_tulip where kind='paper' and mat_type='m' and cover_url='' "
            f"and lang='kor' and isbn ~ '^[0-9]{{13}}$' and ctrl > '{last}' order by ctrl limit 3000", timeout=120))
        if not page: break
        last = page[-1]["ctrl"]
        rows += [r for r in page if (r["ctrl"] + ".webp") not in have]
    take = min(limit or budget, budget)
    rows = rows[:take]
    print(f"[recheck] 미확인 후보 {len(rows):,}건 (이번에 {take:,}까지)")
    ok = miss = 0; t0 = time.time(); hits = []
    for i, r in enumerate(rows, 1):
        try:
            cov, _ = t.aladin_cover_isbn(r["isbn"], expect_title=t.clean_title(r["title"]))
        except t.AladinLimit:
            print("  알라딘 한도 — 중단"); break
        path = os.path.join(m.LOCAL_DIR, r["ctrl"] + ".webp")
        data = None
        if cov:
            data, _ = m.fetch_convert(cov)
        with open(path, "wb") as f: f.write(data or b"")
        if data:
            if m.upload(r["ctrl"], data):
                t.sql(f"insert into mirror_pushed (ctrl) values ({t.esc(r['ctrl'])}) on conflict do nothing", timeout=30)
            hits.append((r["ctrl"], cov)); ok += 1
        else:
            miss += 1
        if i % 200 == 0: print(f"  {i:,}/{len(rows):,} 회수 {ok:,} 없음 {miss:,} {i/max(1,time.time()-t0):.1f}건/초")
    # cover_url 갱신 — 히트분만(재도장·재조회 방지). 임베딩 행이라 느리니 50건씩.
    for j in range(0, len(hits), 50):
        chunk = hits[j:j+50]
        vals = ",".join(f"({t.esc(c)},{t.esc(u)})" for c, u in chunk)
        try:
            t.sql(f"update semyung_tulip s set cover_url=v.u from (values {vals}) v(c,u) where s.ctrl=v.c", timeout=120)
        except Exception as e:
            print("  cover_url 갱신 실패:", str(e)[:80])
    print(f"[recheck] 완료 — 회수 {ok:,} / 여전히 없음 {miss:,} / {(time.time()-t0)/60:.1f}분")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int); ap.add_argument("--budget", type=int, default=4500)
    a = ap.parse_args(); run(a.limit, a.budget)

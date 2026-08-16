# -*- coding: utf-8 -*-
"""전자책 표지 미러에 barcode 별칭 만들기 — covers/<ctrl>.webp 를 covers/<barcode>.webp 로도 서빙.

    python -u scripts\\cover_alias_ebook.py            # 전량(이미 있는 별칭은 건너뜀)
    python -u scripts\\cover_alias_ebook.py --limit 50

왜(2026-08-16): 화면(큐레이션·검색·상세)은 전자책을 ctrl이 아니라 전자도서관 barcode('sm-'+brcd)로 부른다.
    미러 파일명은 ctrl이라 화면이 주소를 조립할 수 없었다 → 전자책은 미러가 있어도 못 쓰는 상태.
    barcode는 전자책 23,017권 중 23,016에 있고 파일명 안전([0-9A-Za-z_-]).
방식: 로컬 <ctrl>.webp(0바이트 제외) → 스토리지 <barcode>.webp 업로드(x-upsert). 추적은 mirror_pushed에
    'bc:'+barcode 로 기록(좁은 표 INSERT — 본표 UPDATE 금지 규율 유지).
"""
import sys, os, json, argparse, time
import concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t
import cover_mirror as m

def run(limit=None):
    done = set()
    last = ""
    while True:
        rows = json.loads(t.sql(f"select ctrl from mirror_pushed where ctrl > '{last}' and ctrl like 'bc:%' order by ctrl limit 20000", timeout=60))
        if not rows: break
        done.update(r["ctrl"][3:] for r in rows); last = rows[-1]["ctrl"]
    pairs = []
    lastc = ""
    while True:
        page = json.loads(t.sql(
            "select ctrl, barcode from semyung_tulip where kind='ebook' and barcode ~ '^[0-9A-Za-z_-]+$' "
            f"and ctrl > '{lastc}' order by ctrl limit 5000", timeout=120))
        if not page: break
        lastc = page[-1]["ctrl"]
        for r in page:
            if r["barcode"] in done: continue
            p = os.path.join(m.LOCAL_DIR, r["ctrl"] + ".webp")
            if os.path.exists(p) and os.path.getsize(p) > 0:
                pairs.append((r["ctrl"], r["barcode"]))
    if limit: pairs = pairs[:limit]
    print(f"[alias] 별칭 만들 전자책 {len(pairs):,}건 (이미 완료 {len(done):,})")
    ok = fail = 0; t0 = time.time()
    def one(pr):
        ctrl, bc = pr
        try:
            with open(os.path.join(m.LOCAL_DIR, ctrl + ".webp"), "rb") as f: data = f.read()
            return bc, m.upload(bc, data)
        except Exception:
            return bc, False
    for i in range(0, len(pairs), 200):
        chunk = pairs[i:i+200]
        got = []
        ex = cf.ThreadPoolExecutor(max_workers=8)
        futs = [ex.submit(one, p) for p in chunk]
        try:
            for f in cf.as_completed(futs, timeout=400): got.append(f.result())
        except cf.TimeoutError: pass
        ex.shutdown(wait=False, cancel_futures=True)
        good = [bc for bc, o in got if o]
        ok += len(good); fail += len(chunk) - len(good)
        if good:
            vals = ",".join(f"({t.esc('bc:' + bc)})" for bc in good)
            try: t.sql(f"insert into mirror_pushed (ctrl) values {vals} on conflict do nothing", timeout=60)
            except Exception as e: print("  기록 실패:", str(e)[:80])
        if (i // 200) % 15 == 0:
            print(f"  [alias] {i+len(chunk):,}/{len(pairs):,} (성공 {ok:,} 실패 {fail:,}) {(i+len(chunk))/max(1,time.time()-t0):.1f}건/초")
    print(f"[alias] 완료 — 성공 {ok:,} / 실패 {fail:,} / {(time.time()-t0)/60:.0f}분")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int)
    run(ap.parse_args().limit)

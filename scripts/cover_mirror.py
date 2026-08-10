# -*- coding: utf-8 -*-
"""표지 자체 저장(미러링) — 남의 CDN 주소를 우리 스토리지 실물로.

    python -u scripts\\cover_mirror.py --setup           # 버킷·컬럼 준비(1회)
    python -u scripts\\cover_mirror.py --limit 120       # 파일럿
    python -u scripts\\cover_mirror.py --budget 60000    # 대량(하루치)
    python -u scripts\\cover_mirror.py --verify 8        # 서빙 검증(공개 URL 실물)

왜: 종이책 표지 93%가 네이버 CDN 핫링크 — 막히는 날 17만 권이 빈칸이 된다(우리 손 밖).
    네이버는 책 검색 API를 2026-07-31 이미 종료(신호 실재). 8/11 표지 백필 종료로
    주소 집합이 확정돼 지금이 미러링 적기.

방식: 원본 다운로드 → 최대 600px WEBP q85(장당 ~40-60KB, 전체 ~8-10GB) → Supabase Storage 'covers'
     (600px = 3배 밀도 폰의 상세화면(110pt)까지 선명. 원본이 더 작으면 확대하지 않고 그대로)
     → cover_local 컬럼에 파일명 기록. ⚠️cover_url(출처)은 절대 지우지 않는다(재수집 키).
     실패는 cover_local='' 마킹(재시도 방지). 서빙: /storage/v1/object/public/covers/<ctrl>.webp

판정 규율(전부 겪은 것): 200 응답≠이미지 — 매직바이트(JPEG/PNG/GIF/WEBP)+2KB 미만 컷,
     noimg 플레이스홀더 컷. 변환 실패는 ''로 마킹하고 다음으로.
"""
import sys, os, io, json, re, time, argparse, threading
import concurrent.futures as cf
import urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t
from PIL import Image

PROJECT = "gkujptyfrzqrjrvovbnc"
SB = f"https://{PROJECT}.supabase.co"
BUCKET = "covers"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 BookstarMirror/1.0"}

_srv = None
def service_key():
    global _srv
    if _srv: return _srv
    d = json.loads(t.http(f"https://api.supabase.com/v1/projects/{PROJECT}/api-keys",
                          headers={"Authorization": "Bearer " + t.TOKEN}))
    for k in d:
        if k.get("name") == "service_role": _srv = k["api_key"]; return _srv
    sys.exit("service_role 키를 찾지 못함")

def setup():
    # 공개 버킷 (이미 있으면 409 무시)
    try:
        t.http(f"{SB}/storage/v1/bucket", data=json.dumps(
            {"id": BUCKET, "name": BUCKET, "public": True}).encode(),
            headers={"Authorization": "Bearer " + service_key(), "Content-Type": "application/json"})
        print("버킷 생성됨")
    except urllib.error.HTTPError as e:
        print("버킷:", e.code, e.read().decode()[:80])
    t.sql("alter table semyung_tulip add column if not exists cover_local text")
    print("cover_local 컬럼 OK")

def fetch_convert(url):
    """다운로드→검증→300px WEBP. 반환 (webp_bytes|None, 사유)"""
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=25, context=t.CTX) as r:
            b = r.read()
    except Exception as e:
        return None, f"다운로드 실패 {type(e).__name__}"
    if len(b) < 2000: return None, f"너무 작음 {len(b)}B"
    magic_ok = b[:2] == b"\xff\xd8" or b[:4] == b"\x89PNG" or b[:3] == b"GIF" or b[:4] == b"RIFF"
    if not magic_ok: return None, "이미지 아님"
    try:
        im = Image.open(io.BytesIO(b)).convert("RGB")
        im.thumbnail((600, 900))          # 큰 것만 줄인다 — 작은 원본은 확대하지 않음
        out = io.BytesIO()
        im.save(out, "WEBP", quality=85, method=4)
        return out.getvalue(), ""
    except Exception as e:
        return None, f"변환 실패 {type(e).__name__}"

def upload(ctrl, data):
    req = urllib.request.Request(f"{SB}/storage/v1/object/{BUCKET}/{ctrl}.webp", data=data,
        headers={"Authorization": "Bearer " + service_key(),
                 "Content-Type": "image/webp", "x-upsert": "true"}, method="POST")
    with urllib.request.urlopen(req, timeout=40, context=t.CTX) as r:
        return r.status in (200, 201)

def run(limit=None, budget=60000, kinds="paper"):
    kind_cond = "kind='paper' and mat_type='m'" if kinds == "paper" else f"kind='{kinds}'"
    take = min(limit or budget, budget)
    rows = json.loads(t.sql(
        "select ctrl, cover_url from semyung_tulip "
        f"where {kind_cond} and cover_url like 'https%' and cover_local is null "
        f"order by md5(ctrl) limit {take}", timeout=120))
    print(f"[mirror] 대상 {len(rows):,}건 (예산 {budget:,})")
    ok = fail = 0; done = 0; t0 = time.time()
    buf = []          # (ctrl, local) — 성공은 'ctrl.webp', 실패는 ''
    lock = threading.Lock()

    def flush():
        if not buf: return
        vals = ",".join(f"({t.esc(c)},{t.esc(l)})" for c, l in buf)
        try:
            t.sql("update semyung_tulip x set cover_local=v.l, updated_at=now() "
                  f"from (values {vals}) as v(c,l) where x.ctrl=v.c", timeout=120)
        except Exception as e:
            print(f"  DB 기록 실패({len(buf)}건): {str(e)[:100]}")
        buf.clear()

    def one(r):
        data, why = fetch_convert(r["cover_url"])
        if data is None:
            return r["ctrl"], "", why
        try:
            if upload(r["ctrl"], data): return r["ctrl"], r["ctrl"] + ".webp", ""
            return r["ctrl"], "", "업로드 실패"
        except Exception as e:
            return r["ctrl"], "", f"업로드 {type(e).__name__}"

    BATCH = 100
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        with cf.ThreadPoolExecutor(max_workers=10) as ex:
            out = list(ex.map(one, chunk))
        for ctrl, local, why in out:
            if local: ok += 1
            else: fail += 1
            buf.append((ctrl, local))
        flush()
        done += len(chunk)
        if done % 1000 < BATCH:
            rate = done / max(1, time.time() - t0)
            print(f"  {done:,}/{len(rows):,} (성공 {ok:,} 실패 {fail:,}) {rate:.1f}건/초")
    print(f"[mirror] 완료 — 성공 {ok:,} / 실패 {fail:,} / {time.time()-t0:.0f}초")

def verify(n=8):
    rows = json.loads(t.sql(
        "select ctrl, cover_local from semyung_tulip "
        f"where cover_local is not null and cover_local<>'' order by md5(ctrl) limit {n}"))
    good = 0
    for r in rows:
        url = f"{SB}/storage/v1/object/public/{BUCKET}/{r['cover_local']}"
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20, context=t.CTX) as x:
                b = x.read()
            is_webp = b[:4] == b"RIFF" and b[8:12] == b"WEBP"
            print(f"  {'✓' if is_webp else '✗'} {r['cover_local']:<20} {len(b):>7,}B {'WEBP' if is_webp else '?'}")
            good += is_webp
        except Exception as e:
            print(f"  ✗ {r['cover_local']} {type(e).__name__}")
    print(f"서빙 검증 {good}/{len(rows)}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--budget", type=int, default=60000)
    ap.add_argument("--kinds", default="paper")
    ap.add_argument("--verify", type=int, nargs="?", const=8)
    a = ap.parse_args()
    if a.setup: setup()
    elif a.verify is not None: verify(a.verify)
    else: run(a.limit, a.budget, a.kinds)

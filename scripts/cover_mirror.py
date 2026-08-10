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
import sys, os, io, json, re, time, argparse, threading, socket, functools
import concurrent.futures as cf
import urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t
from PIL import Image

socket.setdefaulttimeout(30)                       # 어떤 소켓도 30초 이상 안 기다림
print = functools.partial(print, flush=True)       # 스케줄 실행에서 로그가 버퍼에 갇히지 않게

PROJECT = "gkujptyfrzqrjrvovbnc"
SB = f"https://{PROJECT}.supabase.co"
BUCKET = "covers"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 BookstarMirror/1.0"}
# 로컬 마스터 사본(사장님 지시 8/11): 클라우드와 별개로 PC에도 실물 보관 — 재적재·재점검의 원천
LOCAL_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "북스타", "데이터", "표지")

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
    """페이지 단위(1,500)로 뽑아 처리한다.
    ⚠️6만 행 통짜 SELECT는 Mgmt API에서 수 분 걸리고(6MB), 8/11 첫 대량 실행이 여기서
    한참 침묵했다. cover_local이 채워지며 다음 SELECT가 자연히 다음 페이지가 된다(오프셋 불필요).
    ⚠️응답 없는 다운로드 하나가 전체를 물고 늘어진 정지 사고(2,414에서 스톱) →
    배치에 마감시간을 두고, 시간 내 못 끝낸 항목은 실패 처리 후 전진한다."""
    kind_cond = "kind='paper' and mat_type='m'" if kinds == "paper" else f"kind='{kinds}'"
    total_take = min(limit or budget, budget)
    ok = fail = done = 0; t0 = time.time()

    def flush(buf):
        if not buf: return
        vals = ",".join(f"({t.esc(c)},{t.esc(l)})" for c, l in buf)
        try:
            t.sql("update semyung_tulip x set cover_local=v.l, updated_at=now() "
                  f"from (values {vals}) as v(c,l) where x.ctrl=v.c", timeout=120)
        except Exception as e:
            print(f"  DB 기록 실패({len(buf)}건): {str(e)[:100]}")

    os.makedirs(LOCAL_DIR, exist_ok=True)

    def one(r):
        data, why = fetch_convert(r["cover_url"])
        if data is None:
            return r["ctrl"], "", why
        # PC 사본 먼저(공짜 — 어차피 손에 든 바이트), 업로드 실패해도 로컬은 남는다
        try:
            with open(os.path.join(LOCAL_DIR, r["ctrl"] + ".webp"), "wb") as f:
                f.write(data)
        except Exception:
            pass
        try:
            if upload(r["ctrl"], data): return r["ctrl"], r["ctrl"] + ".webp", ""
            return r["ctrl"], "", "업로드 실패"
        except Exception as e:
            return r["ctrl"], "", f"업로드 {type(e).__name__}"

    PAGE, BATCH = 1500, 150
    WORKERS = 24        # 실측: 10개=2.2건/초(업로드가 긴 다리). 대역폭보다 왕복 대기가 지배라 늘릴수록 붙는다
    while done < total_take:
        page = json.loads(t.sql(
            "select ctrl, cover_url from semyung_tulip "
            f"where {kind_cond} and cover_url like 'https%' and cover_local is null "
            f"limit {min(PAGE, total_take - done)}", timeout=120))
        if not page:
            print("[mirror] 남은 대상 없음 — 전체 완료"); break
        for i in range(0, len(page), BATCH):
            chunk = page[i:i + BATCH]
            got = {}
            ex = cf.ThreadPoolExecutor(max_workers=WORKERS)
            futs = {ex.submit(one, r): r["ctrl"] for r in chunk}
            try:
                for f in cf.as_completed(futs, timeout=180):       # 배치 마감 3분
                    ctrl, local, why = f.result()
                    got[ctrl] = local
            except cf.TimeoutError:
                pass                                                # 못 끝낸 놈은 아래서 실패 처리
            # wait=False: 멈춘 스레드를 기다리지 않고 전진 (소켓 30초 컷이 뒤에서 정리)
            ex.shutdown(wait=False, cancel_futures=True)
            buf = []
            for r in chunk:
                local = got.get(r["ctrl"])
                if local is None: local = ""                        # 마감 초과 = 실패 마킹(다음날 재시도 안 함)
                if local: ok += 1
                else: fail += 1
                buf.append((r["ctrl"], local))
            flush(buf)
            done += len(chunk)
            if done % 1000 < BATCH:
                rate = done / max(1, time.time() - t0)
                left = total_take - done
                print(f"  {done:,}/{total_take:,} (성공 {ok:,} 실패 {fail:,}) {rate:.1f}건/초 · 남은 {left:,}")
    print(f"[mirror] 완료 — 성공 {ok:,} / 실패 {fail:,} / {(time.time()-t0)/60:.0f}분")

def pull_storage():
    """스토리지에는 있는데 PC에 없는 표지를 내려받아 로컬 사본을 맞춘다.
    (로컬 저장 기능이 나중에 붙어서, 그 전에 올라간 분량 회수용 — 우리 버킷이라 빠르고 공짜)"""
    os.makedirs(LOCAL_DIR, exist_ok=True)
    rows = json.loads(t.sql(
        "select cover_local from semyung_tulip where cover_local is not null and cover_local<>''",
        timeout=120))
    need = [r["cover_local"] for r in rows
            if not os.path.exists(os.path.join(LOCAL_DIR, r["cover_local"]))]
    print(f"[pull] 스토리지 {len(rows):,}장 중 로컬에 없는 것 {len(need):,}장")
    def grab(name):
        try:
            req = urllib.request.Request(f"{SB}/storage/v1/object/public/{BUCKET}/{name}", headers=UA)
            with urllib.request.urlopen(req, timeout=30, context=t.CTX) as r:
                b = r.read()
            if b[:4] == b"RIFF":
                with open(os.path.join(LOCAL_DIR, name), "wb") as f: f.write(b)
                return True
        except Exception:
            pass
        return False
    ok = 0
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        for good in ex.map(grab, need):
            ok += good
    print(f"[pull] 회수 {ok:,}/{len(need):,}")

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
    ap.add_argument("--pull-storage", action="store_true")
    a = ap.parse_args()
    if a.setup: setup()
    elif a.verify is not None: verify(a.verify)
    elif a.pull_storage: pull_storage()
    else: run(a.limit, a.budget, a.kinds)

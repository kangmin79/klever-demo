# -*- coding: utf-8 -*-
"""교보 공급 전자책의 '웹뷰어 허용 여부' 판정 → semyung_tulip.app_only / webviewer_checked_at 갱신.

배경(2026-11-16): 출판사가 웹뷰어를 불허한 책(교보 판정 webViewrYsno=N)은 폰에서 교보 선택창 → 교보문고
디지털도서관 앱으로 넘어간다(사장님 캡처 "앱 업데이트·권한 화면"). 표본 300권 중 2권(0.7%). 사장님 결정 =
"이런 책은 나오지 않게". app_only=true 면 학생 화면에서 숨긴다(semyung_tulip RLS tulip_public_read:
app_only=false, 큐레이션 함수 curate 는 후보에서 제거).

판정 = ebook.semyung.ac.kr 선택창(mobileViewIf) 쿠키 하나로 checkSupplyWebViewerInfo.xml 호출(책마다 선택창
안 열어도 됨). 학교 서버 부담: 0.3초 간격, 쿠키 150건마다 갱신. 학교 서버는 해외 IP 차단 → Vultr 중계서버에서만 돈다.

사용:
  python3 scripts/kyobo_webviewer_check.py                # 미판정 전부(처음엔 ~12,700권 ≈ 1.5시간)
  python3 scripts/kyobo_webviewer_check.py --limit 300    # 일부만
  --recheck-days 30: app_only=true 로 판정된 책은 30일 지나면 다시 본다(출판사가 허용으로 바꾸면 복귀)
쓰기 = bx_exec_sql RPC(service_role, tulip_sync.py 와 같은 경로). 결과 True 가 아닌 응답(빈 응답·False)은 갱신하지
않는다(다음 주에 다시 봄). 연속 20건 빈 응답이면 학교 서버 장애로 보고 중단(exit 2).
"""
import sys, io, os, re, json, time, argparse, ssl, base64
import urllib.request, urllib.parse, http.cookiejar

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
EB = "https://ebook.semyung.ac.kr/elibrary-front"
LBRY = "20213"
PROJECT = "gkujptyfrzqrjrvovbnc"
RPC = f"https://{PROJECT}.supabase.co/rest/v1/rpc/bx_exec_sql"
ENV_PATH = os.path.join(os.path.expanduser("~"), "Desktop", "hwik-web", ".env")
# 선택창을 열 때 쓰는 학번·바코드(판정 자체는 학번과 무관 — 세션을 만들기 위한 값). 테스트 계정.
SESSION_HAKBUN = os.environ.get("KB_CHECK_HAKBUN", "20149410")
SESSION_BRCD = "4801188862291"

def _jwt_ref(tok):
    try:
        p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p)).get("ref")
    except Exception: return None

def find_service_key():
    cands = []
    for n in ("SUPABASE_SERVICE_ROLE", "BOOKSTAR_SERVICE_ROLE", "SUPABASE_SERVICE_ROLE_KEY"):
        if os.environ.get(n): cands.append(os.environ[n].strip().strip("\"'"))
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8", errors="replace"):
            m = re.match(r"\s*(SUPABASE_SERVICE_ROLE|BOOKSTAR_SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(\S+)", line)
            if m: cands.append(m.group(2).strip().strip("\"'"))
    for k in cands:
        if _jwt_ref(k) == PROJECT: return k
    sys.exit("키 없음: 북스타 service_role 키(SUPABASE_SERVICE_ROLE_KEY) — 환경변수 또는 ~/Desktop/hwik-web/.env")

KEY = find_service_key()

def sql(q, timeout=120):
    body = json.dumps({"q": q}).encode()
    req = urllib.request.Request(RPC, data=body, headers={
        "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "User-Agent": "BookstarSync/1.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return json.loads(r.read().decode("utf-8", "replace"))

class School:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar), urllib.request.HTTPSHandler(context=CTX))
        self.new_session()
    def new_session(self):
        self.jar.clear()
        u = base64.b64encode(SESSION_HAKBUN.encode()).decode()
        url = f"{EB}/frontapi/mobileViewIf.ink?libraryCode={LBRY}&barcode={SESSION_BRCD}&user_id={u}&device=android"
        try:
            with self.op.open(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r: r.read()
        except Exception as e:
            print("[session] 선택창 열기 실패:", e)
    def judge(self, brcd):
        """→ 'Y'(웹뷰어 허용) / 'N'(불허=앱 전용) / None(판정 못 받음)"""
        url = f"{EB}/process/checkSupplyWebViewerInfo.xml?lbryCode={LBRY}&brcd={urllib.parse.quote(brcd)}"
        try:
            with self.op.open(urllib.request.Request(url, headers={
                "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": f"{EB}/frontapi/mobileViewIf.ink"}), timeout=20) as r:
                x = r.read().decode("utf-8", "replace")
        except Exception:
            return None
        x = x.replace("<![CDATA[", "").replace("]]>", "")
        def tag(t):
            m = re.search(rf"<{t}>([^<]*)</{t}>", x); return (m.group(1).strip() if m else "")
        if tag("result") != "True": return None
        ys = tag("webViewrYsno")
        return ys if ys in ("Y", "N") else None

def targets(limit, recheck_days):
    q = ("select barcode from semyung_tulip where kind='ebook' and vendor='kyobo' and barcode is not null "
         f"and (webviewer_checked_at is null or (app_only and webviewer_checked_at < now() - interval '{int(recheck_days)} days')) "
         f"group by barcode order by min(webviewer_checked_at) nulls first, barcode limit {int(limit)}")
    return [r["barcode"] for r in sql(q)]

def flush(batch):
    if not batch: return
    vals = ",".join("('%s',%s)" % (b.replace("'", ""), "true" if ys == "N" else "false") for b, ys in batch)
    sql(f"update semyung_tulip t set app_only = v.a, webviewer_checked_at = now() from (values {vals}) v(b,a) "
        f"where t.barcode = v.b and t.kind='ebook'")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20000)
    ap.add_argument("--recheck-days", type=int, default=30)
    ap.add_argument("--interval", type=float, default=0.3)
    a = ap.parse_args()
    bl = targets(a.limit, a.recheck_days)
    print(f"[kb-check] 대상 {len(bl)}권 (간격 {a.interval}s)")
    if not bl: return
    sch = School()
    batch, n_ok, n_app, n_unk, empty_run = [], 0, 0, 0, 0
    for i, b in enumerate(bl, 1):
        if i % 150 == 0: sch.new_session()
        ys = sch.judge(b)
        if ys is None:
            n_unk += 1; empty_run += 1
            if empty_run >= 20: print("[kb-check] 연속 20건 판정 실패 — 학교 서버 장애로 보고 중단"); flush(batch); sys.exit(2)
            time.sleep(3); sch.new_session(); continue
        empty_run = 0; n_ok += 1
        if ys == "N": n_app += 1; print(f"  앱 전용: {b}")
        batch.append((b, ys))
        if len(batch) >= 200: flush(batch); batch = []
        if i % 500 == 0: print(f"[kb-check] {i}/{len(bl)} 판정 {n_ok} · 앱전용 {n_app} · 미판정 {n_unk}")
        time.sleep(a.interval)
    flush(batch)
    tot = sql("select count(*) n from semyung_tulip where app_only")[0]["n"]
    print(f"[kb-check] 끝: 판정 {n_ok} · 이번 앱전용 {n_app} · 미판정 {n_unk} · DB app_only 합계 {tot}")

if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""semyung_tulip 적재 감사 — "채워졌나"가 아니라 "제대로 채워졌나"를 본다.

    python -u scripts\\audit_tulip.py                # 전체
    python -u scripts\\audit_tulip.py --since 2026-08-09T18:30   # 그 이후 갱신분만(UTC)
    python -u scripts\\audit_tulip.py --sample 40    # 표지 실물검사 표본수
    python -u scripts\\audit_tulip.py --cross 60     # 오매칭 교차검증 표본수(정보나루 호출)

검사 3종
  A 형식 : 표지 URL·줄거리 문자열의 구조적 결함 (전량, SQL만 — 비용 0)
  B 실물 : 표지 주소가 진짜 이미지를 주나 (표본, 매직바이트·크기·해시중복)
  C 교차 : 도서관 제목 vs 정보나루 제목 — ISBN으로 물어본 게 '그 책'이 맞나 (표본)

⚠️왜 이렇게 보나 (전부 실제로 당한 것들)
  · 200 응답 ≠ 진짜 이미지 — 교보 바코드 표지 18건이 전부 같은 19,708B 플레이스홀더였다(8/6)
  · 중복 줄거리는 그 자체론 정상 — 시리즈 공통 설명이다(삼국지 120권). '제목이 서로 무관한'
    중복만 오염이다(8/10, 한국 근대단편 99권에 슬리피 할로우 오디오북 안내가 들어가 있었다)
  · 낱말로 쓰레기를 판정하지 말 것 — '절판·배송·이벤트'는 멀쩡한 책소개에 흔히 나온다.
    130건을 눈으로 확인하고서야 진짜 쓰레기가 2종뿐임을 알았다
  · 서버 updated_at은 UTC. KST 구간은 -9시간
"""
import sys, os, json, re, ssl, urllib.request, hashlib, collections, difflib, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
OK_DOMAIN = ("bookthumb-phinf.pstatic.net", "shopping-phinf.pstatic.net",
             "comicthumb-phinf.pstatic.net", "image.aladin.co.kr",
             "lib.semyung.ac.kr", "ebook.semyung.ac.kr")

def head(s): print("\n" + "=" * 70 + f"\n{s}\n" + "=" * 70)
def one(q):  return json.loads(t.sql(q))[0]

def audit_format(where):
    head("A. 형식 검사 (전량)")
    dom_ok = " and ".join(f"cover_url not like 'https://{d}/%'" for d in OK_DOMAIN)
    checks = [
        ("표지: 이중 스킴",          "cover_url ~ 'https?://.*https?://'"),
        ("표지: 공백/제어문자",      "cover_url ~ '[[:space:]]'"),
        ("표지: noimg 플레이스홀더", "cover_url ilike '%noimg%'"),
        ("표지: http(비보안)",       "cover_url like 'http://%'"),
        ("표지: 허용 도메인 밖",     f"cover_url is not null and cover_url<>'' and {dom_ok}"),
        ("줄거리: HTML 엔티티",      "description ~ '&(lt|gt|amp|quot|#[0-9]+);'"),
        ("줄거리: HTML 태그",        "description ~ '</?(b|i|p|br|div|span|strong|em|a|img)[ >]'"),
        ("줄거리: 제어문자",         "description ~ '[\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f]'"),
        ("줄거리: 판매 안내문",      "description like '%해외주문원서%'"
                                     " or (description like '★ 책의 특징 ★%' and length(description)<200)"),
        ("줄거리 = 제목과 동일",     "description<>'' and description=title"),
    ]
    bad = 0
    for name, cond in checks:
        n = int(one(f"select count(*) c from semyung_tulip where {where} and ({cond})")["c"])
        bad += n
        print(f"  {'✗' if n else '○'} {name:<24} {n:>7,}")
    print(f"  → 형식 결함 합계 {bad:,}건")
    return bad

def audit_mismatch(where, top=400):
    """같은 줄거리를 공유하는데 제목이 서로 무관 = 엉뚱한 책 설명"""
    head("A-2. 오염 의심 — 같은 줄거리 + 무관한 제목")
    rows = json.loads(t.sql(f"""
        select count(*) n, min(left(description,80)) d, string_agg(left(title,40),'⟂') 제목들
        from semyung_tulip where {where} and description is not null and length(description)>40
        group by md5(description) having count(*)>=3 order by count(*) desc limit {top}"""))
    def toks(s):
        s = re.sub(r"\[[^\]]*\]", " ", s); s = re.sub(r"[0-9]+", " ", s)
        return {w for w in re.sub(r"[^0-9A-Za-z가-힣]", " ", s).split() if len(w) >= 2}
    sus = []
    for r in rows:
        titles = [x for x in r["제목들"].split("⟂") if x.strip()]
        if len(titles) >= 3 and not set.intersection(*[toks(x) for x in titles]):
            sus.append((int(r["n"]), r["d"], titles))
    print(f"  3권 이상 공유 그룹 {len(rows)}개 중, 제목에 공통 단어가 없는 그룹 {len(sus)}개")
    for n, d, titles in sorted(sus, key=lambda x: -x[0])[:8]:
        print(f"    ×{n:<4} {d[:66]}")
        print(f"          {' ┃ '.join(titles[:4])}")
    print("  ※ 시리즈 공통 설명이면 정상이다. 제목이 정말 무관한 것만 오염으로 볼 것")
    return sus

def audit_images(where, n=40):
    head(f"B. 표지 실물 검사 (표본 {n})")
    rows = json.loads(t.sql(f"""
        select title, cover_url from semyung_tulip
        where {where} and cover_url is not null and cover_url<>'' order by md5(ctrl) limit {n}"""))
    sizes, hashes, bad = [], collections.Counter(), []
    for r in rows:
        try:
            with urllib.request.urlopen(urllib.request.Request(
                    r["cover_url"], headers={"User-Agent": "BookstarAudit/1.0"}), timeout=20, context=CTX) as x:
                b = x.read()
            if not (b[:2] == b"\xff\xd8" or b[:4] == b"\x89PNG") or len(b) < 2000:
                bad.append((r["title"][:34], f"{x.status} {len(b)}B {b[:4]!r}"))
            else:
                sizes.append(len(b)); hashes[hashlib.md5(b).hexdigest()] += 1
        except Exception as e:
            bad.append((r["title"][:34], f"실패 {type(e).__name__}"))
    if sizes:
        print(f"  진짜 이미지 {len(sizes)}/{len(rows)} · 크기 {min(sizes):,}~{max(sizes):,}B "
              f"(중앙 {sorted(sizes)[len(sizes)//2]:,}B)")
    rep = [c for c in hashes.values() if c > 1]
    print(f"  같은 그림이 2권 이상: {len(rep)}건 {'← 플레이스홀더 의심' if rep else '(없음 = 정상)'}")
    for tt, why in bad[:8]: print(f"    ✗ {tt} — {why}")
    return len(bad)

def audit_cross(where, n=60):
    head(f"C. 오매칭 교차검증 — 도서관 제목 vs 정보나루 제목 (표본 {n})")
    def norm(s):
        s = re.sub(r"\[[^\]]*\]", " ", str(s or "")); s = re.sub(r"[=:/].*$", " ", s)
        return re.sub(r"[^0-9A-Za-z가-힣]", "", s).lower()
    rows = json.loads(t.sql(f"""
        select isbn, title from semyung_tulip
        where {where} and description is not null and description<>'' and isbn is not null and isbn<>''
        order by md5(ctrl) limit {n}"""))
    same = diff = err = 0; bad = []
    for r in rows:
        c = re.sub(r"[^0-9Xx]", "", r["isbn"] or "")
        try:
            d = json.loads(t.http(f"https://data4library.kr/api/srchDtlList"
                                  f"?authKey={t.D4L_KEY}&isbn13={c}&format=json", timeout=25))
        except Exception:
            err += 1; continue
        resp = d.get("response") or {}
        if str(resp.get("errCode") or ""): err += 1; continue
        det = resp.get("detail") or []
        bk = (det[0] or {}).get("book") if det else None
        if not bk: err += 1; continue
        a, b = norm(r["title"]), norm(bk.get("bookname"))
        ratio = difflib.SequenceMatcher(None, a, b).ratio()
        if a and b and (a in b or b in a or ratio >= 0.75): same += 1
        else: diff += 1; bad.append((r["title"][:36], str(bk.get("bookname"))[:36], round(ratio, 2)))
    tot = same + diff
    if not tot:
        print(f"  ⚠️대조 0건 (조회불가 {err}) — 정보나루 일 한도 소진일 가능성이 크다. 다른 날 재실행할 것")
        return None
    print(f"  대조 {tot}건(조회불가 {err}) — 일치 {same} / 불일치 {diff} = 일치율 {same*100/tot:.1f}%")
    for x, y, rr in bad[:8]:
        print(f"    ✗ 도서관「{x}」 vs 정보나루「{y}」 (유사도 {rr})")
    return same * 100 / tot

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="", help="UTC 시각 이후 갱신분만 (예 2026-08-09T18:30)")
    ap.add_argument("--sample", type=int, default=40)
    ap.add_argument("--cross", type=int, default=60)
    ap.add_argument("--kind", default="", help="paper | ebook (기본=둘 다)")
    a = ap.parse_args()
    w = ["true"]
    if a.since: w.append(f"updated_at >= timestamptz '{a.since}+00'")
    if a.kind:  w.append(f"kind='{a.kind}'")
    where = " and ".join(w)
    print(f"대상: {where}")
    print(f"총 행수: {int(one(f'select count(*) c from semyung_tulip where {where}')['c']):,}")
    audit_format(where); audit_mismatch(where)
    audit_images(where, a.sample)
    if a.cross: audit_cross(where, a.cross)
    print("\n완료 — ○/✓ 만 있으면 건강. ✗는 눈으로 확인한 뒤에만 손댈 것")

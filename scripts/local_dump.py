# -*- coding: utf-8 -*-
"""서지·줄거리 로컬 마스터 사본 — Supabase 전체를 PC 폴더로 (사장님 지시 8/11).

    python -u scripts\\local_dump.py

결과: Desktop\\북스타\\데이터\\서지\\
    종이책.jsonl / 전자책.jsonl / 기타.jsonl   (한 줄 = 책 한 권, 전 텍스트 컬럼)
    _요약.txt                                  (권수·채움률·덤프 시각)

- 임베딩 벡터는 제외(3.5GB, 재생성 $0.3이라 백업 가치 낮음). 그 외 전부.
- 매일 표지 미러 직후 자동 실행(cover_mirror.bat) — 항상 어제자 사본이 PC에 있게.
- 이 파일들이 있으면 클라우드가 통째로 사라져도 재적재 가능(줄거리 재수집 8일을 아낌).
"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tulip_sync as t

OUT = os.path.join(os.path.expanduser("~"), "Desktop", "북스타", "데이터", "서지")
COLS = ("ctrl,kind,title,author,publisher,pub_year,isbn,call_no,class_no,lang,mat_type,"
        "reg_date,vendor,barcode,viewer_url,cover_url,cover_local,description,crema,crema_url")

def dump():
    os.makedirs(OUT, exist_ok=True)
    files = {
        "paper_m": ("종이책.jsonl", "kind='paper' and mat_type='m'"),
        "ebook":   ("전자책.jsonl", "kind='ebook'"),
        "etc":     ("기타.jsonl",   "kind='paper' and mat_type<>'m'"),
    }
    stats = {}
    for key, (fname, cond) in files.items():
        path = os.path.join(OUT, fname)
        tmp = path + ".tmp"
        n = 0; last = ""
        t0 = time.time()
        with open(tmp, "w", encoding="utf-8") as f:
            while True:   # ctrl 커서 페이지네이션 — 통짜 SELECT 금지(8/11 정지 사고 교훈)
                rows = json.loads(t.sql(
                    f"select {COLS} from semyung_tulip where {cond} "
                    f"and ctrl > '{last}' order by ctrl limit 4000", timeout=120))
                if not rows: break
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
                n += len(rows); last = rows[-1]["ctrl"]
        os.replace(tmp, path)   # 다 쓰고 나서 바꿔치기 — 중간 실패로 반쪽 파일 안 남게
        mb = os.path.getsize(path) / 1e6
        stats[fname] = (n, mb)
        print(f"  {fname:<12} {n:>8,}권 {mb:>7.1f}MB ({time.time()-t0:.0f}초)")
    with open(os.path.join(OUT, "_요약.txt"), "w", encoding="utf-8") as f:
        f.write(f"덤프 시각: {time.strftime('%Y-%m-%d %H:%M')}\n")
        for fname, (n, mb) in stats.items():
            f.write(f"{fname}: {n:,}권 / {mb:.1f}MB\n")
        f.write("표지 실물: ..\\표지\\ (ctrl.webp)\n임베딩: 제외(재생성 $0.3)\n")
    print("[dump] 완료 →", OUT)

if __name__ == "__main__":
    dump()

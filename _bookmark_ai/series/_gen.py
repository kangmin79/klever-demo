# -*- coding: utf-8 -*-
# 완독 책갈피 시리즈 파일럿 — 책마다 1장, 동일 레이아웃 + 작품 분위기 색
import os

key = None
with open(r"C:\Users\강동욱\Desktop\hwik-web\.env", encoding="utf-8") as f:
    for line in f:
        if line.startswith("GEMINI_API_KEY="):
            key = line.strip().split("=", 1)[1]
            break
assert key

from google import genai
client = genai.Client(api_key=key)
MODEL = "gemini-3.1-flash-image-preview"

OUT = r"C:\Users\강동욱\Desktop\klever_demo\_bookmark_ai\series"
os.makedirs(OUT, exist_ok=True)

# 시리즈 공통 템플릿 — 레이아웃 완전 고정, 색·모티프만 책마다 교체
TEMPLATE = (
    "Professional product photograph of ONE premium paper bookmark hang tag, front view, perfectly "
    "centered and vertical, floating on a plain light warm-gray studio background with a single soft "
    "drop shadow. Nothing else in frame. "
    "FIXED LAYOUT (identical every time): tall narrow tag (1:3.2 ratio), small metal eyelet at top "
    "center with a short black elastic loop cord, bottom edge cut as a ribbon swallowtail notch. "
    "The top quarter of the tag is a geometric tile pattern of tiny flat book and bookmark-ribbon "
    "icons in small squares. The body below carries the book title in elegant vertical Korean serif "
    "type running down the center, with the author name in smaller vertical type beside it, and at "
    "the very bottom a tiny gold diamond mark. Render Korean text accurately. "
    "SERIES BRAND: warm gold #e8c46b accents, ivory cream #f5efe2, deep navy #1b2438 as recurring "
    "chords. Minimal, elegant, high resolution, no watermark, no extra text. "
    "THIS BOOK: "
)

BOOKS = {
    "unsu":    "Title '운수 좋은 날', author '현진건'. Body color: muted rainy slate-blue, title in warm gold. "
               "Tile pattern mixes slate blue, rain gray, gold and cream. Mood: a rainy day in 1920s Seoul.",
    "memil":   "Title '메밀꽃 필 무렵', author '이효석'. Body color: deep moonlit indigo, title in ivory white. "
               "Tile pattern mixes indigo, lavender white, gold and cream. Mood: buckwheat flowers under moonlight.",
    "gamja":   "Title '감자', author '김동인'. Body color: earthy terracotta brown, title in cream. "
               "Tile pattern mixes terracotta, ochre, olive and cream. Mood: earthy rural hardship.",
    "samryong":"Title '벙어리 삼룡이', author '나도향'. Body color: deep night navy, title in warm gold. "
               "Tile pattern mixes navy, teal, moon yellow and cream. Mood: quiet night, a crescent moon.",
}

for slug, spec in BOOKS.items():
    out_path = os.path.join(OUT, slug + ".png")
    if os.path.exists(out_path):
        print("skip", slug)
        continue
    print("generating", slug, "...", flush=True)
    try:
        resp = client.models.generate_content(model=MODEL, contents=TEMPLATE + spec)
        saved = False
        for cand in (resp.candidates or []):
            for part in (cand.content.parts or []):
                data = getattr(getattr(part, "inline_data", None), "data", None)
                if data:
                    raw = data if isinstance(data, (bytes, bytearray)) else __import__("base64").b64decode(data)
                    with open(out_path, "wb") as f:
                        f.write(raw)
                    print("  saved", len(raw), "bytes")
                    saved = True
                    break
            if saved:
                break
        if not saved:
            print("  NO IMAGE:", str(resp)[:200])
    except Exception as e:
        print("  FAIL", slug, repr(e))

print("done")

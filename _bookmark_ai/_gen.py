# -*- coding: utf-8 -*-
# 북스타 책갈피 목업 — Nano Banana 2 (gemini-3.1-flash-image-preview)
import os, sys, io

key = None
with open(r"C:\Users\강동욱\Desktop\hwik-web\.env", encoding="utf-8") as f:
    for line in f:
        if line.startswith("GEMINI_API_KEY="):
            key = line.strip().split("=", 1)[1]
            break
assert key, "no key"

from google import genai
client = genai.Client(api_key=key)
MODEL = "gemini-3.1-flash-image-preview"

OUT = r"C:\Users\강동욱\Desktop\klever_demo\_bookmark_ai"
os.makedirs(OUT, exist_ok=True)

BRAND = ("Brand palette: deep navy #1b2438, warm gold #e8c46b, ivory cream #f5efe2, "
         "accents of muted teal and terracotta. The brand name is '참나루' (Korean, serif) "
         "with small latin caption 'BOOKSTAR'. Render the Korean text 참나루 accurately.")

PROMPTS = {
    "01_studio_pair": (
        "Professional product mockup photograph of two premium paper bookmark hang tags "
        "floating diagonally on a light warm-gray studio background, soft drop shadows. "
        "Each tag is tall and narrow (bookmark proportion) with a metal eyelet at the top "
        "and a black elastic loop cord, bottom edge cut as a ribbon swallowtail notch. "
        "LEFT tag: ivory cream body, elegant deep-navy vertical serif text '참나루' running down the tag, "
        "tiny caption 'BOOKSTAR'. RIGHT tag: deep navy body, gold vertical serif text '참나루'. "
        "The top quarter of both tags carries a playful geometric tile pattern of tiny book and "
        "bookmark-ribbon icons in gold, teal, terracotta, navy and cream squares. "
        + BRAND +
        " Minimal, elegant, high resolution, no watermark."
    ),
    "02_desk_qr": (
        "Professional lifestyle product photograph: a cream paper bookmark hang tag lying on a warm "
        "wooden library checkout desk beside a small stack of hardcover books and a date stamp. "
        "The bookmark back shows a crisp printed QR code in deep navy, above it short Korean headline "
        "'오늘 빌린 책, 퀴즈로 완독 인증!' in bold navy sans-serif, below the QR a tiny url 'bookstar.co.kr', "
        "and a deep navy footer band with small gold text '참나루'. Top edge has a colorful tile pattern "
        "strip of tiny book icons. " + BRAND +
        " Shallow depth of field, soft window light, cozy academic library mood, no watermark."
    ),
    "03_in_book": (
        "Cozy lifestyle photograph: a deep navy bookmark hang tag with gold vertical serif Korean text "
        "'참나루' and a colorful book-icon tile pattern at its top, tucked inside a thick open hardcover "
        "classic novel on a reading table in a university library, black loop cord draping over the pages. "
        "Warm afternoon light, blurred bookshelves in the background. " + BRAND +
        " Shallow depth of field, elegant, no watermark."
    ),
}

for name, prompt in PROMPTS.items():
    out_path = os.path.join(OUT, name + ".png")
    if os.path.exists(out_path):
        print("skip", name)
        continue
    print("generating", name, "...", flush=True)
    try:
        resp = client.models.generate_content(model=MODEL, contents=prompt)
        saved = False
        for cand in (resp.candidates or []):
            for part in (cand.content.parts or []):
                data = getattr(getattr(part, "inline_data", None), "data", None)
                if data:
                    raw = data if isinstance(data, (bytes, bytearray)) else __import__("base64").b64decode(data)
                    with open(out_path, "wb") as f:
                        f.write(raw)
                    print("  saved", out_path, len(raw), "bytes")
                    saved = True
                    break
            if saved:
                break
        if not saved:
            print("  NO IMAGE in response:", str(resp)[:300])
    except Exception as e:
        print("  FAIL", name, repr(e))

print("done")

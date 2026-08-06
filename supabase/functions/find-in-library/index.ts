// 북스타 — "이 책, 내 주변 도서관에서 찾기" (정보나루 라이브)
// 입력: { isbn, lat?, lng?, region?, limit? }
//   - isbn 필수. lat/lng 있으면 그 좌표 기준 거리순, 없으면 region 중심 기준.
//   - region(시도코드) 없으면 lat/lng 가장 가까운 시도로 자동 판정.
// 흐름: libSrchByBook(책 소장 도서관 목록+좌표) → 거리 계산·정렬 → 상위 N개 bookExist(대출가능 여부)
// 시크릿(env): DATA4LIB_KEY
const KEY = Deno.env.get("DATA4LIB_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// 정보나루 시도 코드 + 중심 좌표 (lat/lng → 가장 가까운 시도 판정 / region 중심 fallback)
const REGIONS: Record<string, { name: string; lat: number; lng: number }> = {
  "11": { name: "서울", lat: 37.5665, lng: 126.9780 },
  "21": { name: "부산", lat: 35.1796, lng: 129.0756 },
  "22": { name: "대구", lat: 35.8714, lng: 128.6014 },
  "23": { name: "인천", lat: 37.4563, lng: 126.7052 },
  "24": { name: "광주", lat: 35.1595, lng: 126.8526 },
  "25": { name: "대전", lat: 36.3504, lng: 127.3845 },
  "26": { name: "울산", lat: 35.5384, lng: 129.3114 },
  "29": { name: "세종", lat: 36.4800, lng: 127.2890 },
  "31": { name: "경기", lat: 37.4138, lng: 127.5183 },
  "32": { name: "강원", lat: 37.8228, lng: 128.1555 },
  "33": { name: "충북", lat: 36.6357, lng: 127.4917 },
  "34": { name: "충남", lat: 36.5184, lng: 126.8000 },
  "35": { name: "전북", lat: 35.7175, lng: 127.1530 },
  "36": { name: "전남", lat: 34.8679, lng: 126.9910 },
  "37": { name: "경북", lat: 36.4919, lng: 128.8889 },
  "38": { name: "경남", lat: 35.4606, lng: 128.2132 },
  "39": { name: "제주", lat: 33.4996, lng: 126.5312 },
};

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestRegion(lat: number, lng: number): string {
  let best = "11", bd = Infinity;
  for (const [code, r] of Object.entries(REGIONS)) {
    const d = haversine(lat, lng, r.lat, r.lng);
    if (d < bd) { bd = d; best = code; }
  }
  return best;
}

function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? m[1].trim() : "";
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await r.text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const isbn = String(body.isbn || "").replace(/[^0-9Xx]/g, "");
    if (!isbn) return json({ error: "isbn 필요" }, 400);
    const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 12);
    const hasLoc = typeof body.lat === "number" && typeof body.lng === "number";

    // region 결정: 명시 > 좌표로 자동판정 > 서울
    let region = String(body.region || "");
    if (!REGIONS[region]) region = hasLoc ? nearestRegion(body.lat, body.lng) : "11";
    // 거리 기준점: 좌표 우선, 없으면 region 중심
    const refLat = hasLoc ? body.lat : REGIONS[region].lat;
    const refLng = hasLoc ? body.lng : REGIONS[region].lng;

    // 책의 정확한 KDC(서가 분류) — srchDtlList를 병렬로 미리 호출
    const detailP = fetchText(
      `http://data4library.kr/api/srchDtlList?authKey=${KEY}&isbn13=${isbn}&loaninfoYN=N`,
    ).catch(() => "");

    // 시군구 한정(예: "순천") — region은 시도까지만 지원하므로 주소 문자열로 필터
    const city = String(body.city || "").trim();

    // 1) libSrchByBook — 최대 3페이지(300개)까지 후보 수집
    const raw: any[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const qs = new URLSearchParams({
        authKey: KEY, isbn, region, pageNo: String(pageNo), pageSize: "100",
      });
      const xml = await fetchText(`http://data4library.kr/api/libSrchByBook?${qs}`);
      if (pageNo === 1) total = Number(field(xml, "numFound")) || 0;
      const blocks = [...xml.matchAll(/<lib>([\s\S]*?)<\/lib>/g)].map((m) => m[1]);
      for (const b of blocks) {
        raw.push({
          libCode: field(b, "libCode"),
          name: field(b, "libName"),
          address: field(b, "address"),
          tel: field(b, "tel"),
          lat: parseFloat(field(b, "latitude")),
          lng: parseFloat(field(b, "longitude")),
          homepage: field(b, "homepage"),
          operatingTime: field(b, "operatingTime"),
        });
      }
      if (blocks.length < 100) break;
    }

    // 2) 시군구 필터 적용 → 거리 기준점 결정 → 거리 계산·정렬
    let libs = city ? raw.filter((l) => (l.address || "").includes(city)) : raw;
    const areaTotal = city ? libs.length : total;
    // 좌표 없을 때: 시군구 한정이면 그 도서관들 중심, 아니면 시도 중심
    let rLat = refLat, rLng = refLng;
    if (!hasLoc && city) {
      const pts = libs.filter((l) => isFinite(l.lat) && isFinite(l.lng));
      if (pts.length) {
        rLat = pts.reduce((a, l) => a + l.lat, 0) / pts.length;
        rLng = pts.reduce((a, l) => a + l.lng, 0) / pts.length;
      }
    }
    libs = libs.map((l) => ({
      ...l,
      distance: (isFinite(l.lat) && isFinite(l.lng)) ? haversine(rLat, rLng, l.lat, l.lng) : null,
    }));
    libs.sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
    const top = libs.slice(0, limit);

    // 3) 상위 N개만 대출가능 여부 확인 (bookExist 병렬)
    await Promise.all(top.map(async (l) => {
      try {
        const xml = await fetchText(
          `http://data4library.kr/api/bookExist?authKey=${KEY}&libCode=${l.libCode}&isbn13=${isbn}`,
        );
        l.hasBook = field(xml, "hasBook") === "Y";
        const la = field(xml, "loanAvailable");
        l.loanAvailable = la === "Y" ? true : la === "N" ? false : null;
      } catch { l.hasBook = null; l.loanAvailable = null; }
    }));

    // 서가 분류(KDC) 파싱
    const detailXml = await detailP;
    const kdc = field(detailXml, "class_no");
    const kdcName = field(detailXml, "class_nm");

    return json({
      isbn,
      region,
      regionName: REGIONS[region].name,
      city: city || null,
      kdc: kdc || null,           // 예: "813.6"
      kdcName: kdcName || null,   // 예: "문학 > 한국문학 > 소설"
      usedLocation: hasLoc,
      total: areaTotal,  // 한정 지역(시군구 있으면 그것, 없으면 시도) 전체 소장 도서관 수
      count: top.length,
      libraries: top.map((l) => ({
        ...l,
        distance: l.distance == null ? null : Math.round(l.distance * 10) / 10, // km, 소수1
      })),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

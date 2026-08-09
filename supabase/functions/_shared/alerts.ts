// 북스타 — 알림 판단 엔진 (순수 함수, 네트워크·DB 없음 → 단위테스트 가능)
//
// "앱을 열어야만 아는 것"을 앱 밖으로 내보내는 규칙을 여기 한 곳에 모은다.
// 화면(사이드바 배지·내 도서관)과 푸시가 같은 판단을 쓰도록 우선순위도 동일하게 맞췄다.
//   연체 > 예약도착 > 반납 당일 > 내일 > 3일 전
// 하루 한 통만 보낸다 — 급한 것 하나를 고르고 나머지는 "외 n권"으로 접는다.
// (여러 통을 쏘면 알림을 꺼버린다. 끄면 그 뒤로는 아무것도 전할 수 없다)

export interface AlertLoan {
  title: string;
  due: string;          // "2026.08.24" | "20260824" | ""
  kind: "paper" | "ebook";
}
export interface AlertResv {
  title: string;
  arrived: boolean;     // 예약서가비치(0008) = 도착
  waitDate?: string;    // 이때까지 안 찾으면 자동취소 + 예약정지
}
export interface AlertMsg {
  key: string;          // 같은 내용 재발송 방지용(날짜 포함 → 하루 한 번)
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** "2026.08.24" / "20260824" → Date(0시). 못 읽으면 null */
export function parseDue(s: string): Date | null {
  const t = String(s || "").replace(/[^0-9]/g, "");
  if (t.length !== 8) return null;
  const d = new Date(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  return isNaN(d.getTime()) ? null : d;
}

/** 오늘(KST 기준) 자정. 엣지 런타임은 UTC라 그냥 쓰면 하루가 밀린다. */
export function todayKST(now = Date.now()): Date {
  const k = new Date(now + 9 * 3600 * 1000);
  return new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
}

/** 반납일까지 남은 날. 음수면 연체. 날짜를 못 읽으면 null */
export function dday(due: string, today = todayKST()): number | null {
  const d = parseDue(due);
  if (!d) return null;
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const fmt = (s: string) => {
  const d = parseDue(s);
  return d ? `${d.getMonth() + 1}월 ${d.getDate()}일` : "";
};
// 제목이 길면 알림 미리보기에서 뒤가 잘려 정작 상태를 못 본다 — 제목을 먼저 줄인다
const cut = (s: string, n = 22) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const andMore = (n: number) => (n > 1 ? ` 외 ${n - 1}권` : "");

/** 오늘 이 학생에게 보낼 알림 하나. 보낼 게 없으면 null. */
export function buildAlert(loans: AlertLoan[], resvs: AlertResv[], today = todayKST()): AlertMsg | null {
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const withD = loans
    .map((l) => ({ ...l, d: dday(l.due, today) }))
    .filter((l) => l.d !== null) as (AlertLoan & { d: number })[];
  const sortD = (a: { d: number }, b: { d: number }) => a.d - b.d;   // 급한 순

  // ① 연체 — 연체료·이용정지가 걸린 문제라 해결될 때까지 매일 알린다
  const over = withD.filter((l) => l.d < 0).sort(sortD);
  if (over.length) {
    return {
      key: `${ymd}|overdue|${over.length}|${over[0].title}`,
      title: "반납이 늦어지고 있어요",
      body: `「${cut(over[0].title)}」 ${-over[0].d}일 연체${andMore(over.length)}`,
      url: "/app#mylib", tag: "bx-overdue",
    };
  }

  // ② 예약 도착 — 3일 안에 안 찾으면 자동취소 + 예약정지라 찾아갈 때까지 매일
  const arrived = resvs.filter((r) => r.arrived);
  if (arrived.length) {
    const w = arrived[0].waitDate ? ` · ${fmt(arrived[0].waitDate)}까지 찾아가세요` : "";
    return {
      key: `${ymd}|arrived|${arrived.length}|${arrived[0].title}`,
      title: "예약한 책이 도착했어요",
      body: `「${cut(arrived[0].title)}」${andMore(arrived.length)}${w}`,
      url: "/app#mylib", tag: "bx-arrived",
    };
  }

  // ③ 반납 임박 — 당일 / 내일 / 3일 전에만. 매일 보내면 알림을 꺼버린다
  for (const [d, title, when] of [
    [0, "오늘까지 반납이에요", "오늘까지"],
    [1, "내일까지 반납이에요", "내일까지"],
    [3, "반납일이 사흘 남았어요", "3일 남음"],
  ] as [number, string, string][]) {
    const hit = withD.filter((l) => l.d === d);
    if (!hit.length) continue;
    const eb = hit[0].kind === "ebook";
    return {
      key: `${ymd}|due${d}|${hit.length}|${hit[0].title}`,
      title,
      body: `「${cut(hit[0].title)}」${andMore(hit.length)} · ${when}${eb ? " (전자책은 앱에서 연장·반납)" : ""}`,
      url: "/app#mylib", tag: "bx-due",
    };
  }

  return null;
}

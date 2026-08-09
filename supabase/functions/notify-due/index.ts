// 북스타 — 반납임박·연체·예약도착 알림 배치 (하루 1회, 아침)
//
// 지금까지 학생은 "앱을 열어야만" 반납일을 알 수 있었다(사이드바 배지). 이 함수가 그 반대다 —
// 앱을 안 열어도 도서관을 매일 대신 확인해서, 알림을 켠 학생에게만 웹푸시로 알린다.
//
// 한 학생당: 포털 연계값 → lib 세션 → ①종이책 대출(myloan) ②예약(myreserve) ③전자책 대출
// 을 읽고, 판단은 _shared/alerts.ts(순수함수, 단위테스트 있음)에 맡긴다. 하루 한 통만.
//
// GET/POST ?key=<SEMYUNG_ADMIN_KEY>       → 실제 발송
//          &dry=1                          → 발송 없이 "무엇을 보낼지"만 반환(검증용)
//          &sid=<sid>                      → 한 학생만
//          &force=1                        → 오늘 보낼 게 없어도 확인용 알림 1건(배선 점검용)
import { listActive, markFail, markSent, type PushRow } from "../_shared/push_store.ts";
import { loadSessionAny, touchSession } from "../_shared/sso_store.ts";
import { listEbookLoans, personalSession } from "../_shared/semyung_session.ts";
import { items, tulip, tulipErr } from "../_shared/tulip_api.ts";
import { type AlertLoan, type AlertResv, buildAlert } from "../_shared/alerts.ts";
import { sendPush } from "../_shared/push.ts";

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

interface Gathered { loans: AlertLoan[]; resvs: AlertResv[]; notes: string[] }

/** 학생 1명의 오늘 상태를 도서관에서 읽어 온다. 일부가 실패해도 나머지로 판단한다. */
async function gather(schoolNo: string, portalUserId: string, liidHint: string): Promise<Gathered> {
  const loans: AlertLoan[] = [];
  const resvs: AlertResv[] = [];
  const notes: string[] = [];

  // 전자도서관 개인세션은 liid도 같이 준다 — 저장된 liid가 낡았을 수 있어 이 값을 우선한다
  let liid = liidHint;
  try {
    const ps = await personalSession({ school_no: schoolNo, portal_user_id: portalUserId });
    liid = ps.liid || liid;
    for (const e of await listEbookLoans(ps.eb)) {
      loans.push({ title: e.title, due: e.dueDate, kind: "ebook" });
    }
  } catch (e) {
    notes.push("ebook:" + String(e).slice(0, 80));
  }

  if (liid) {
    // 종이책 대출
    try {
      const { data } = await tulip("myloan", { uid: liid, verb: "list" });
      const err = tulipErr(data);
      if (err) notes.push("myloan err " + err);
      else {
        for (const it of items(data?.result ?? data)) {
          loans.push({ title: String(it.title || ""), due: String(it.return_plan_date || ""), kind: "paper" });
        }
      }
    } catch (e) { notes.push("myloan:" + String(e).slice(0, 80)); }

    // 예약 — 0008(예약서가비치)이 '도착'. 3일 안에 안 찾으면 자동취소 + 예약정지
    try {
      const { data } = await tulip("myreserve", { uid: liid, verb: "list", page: "1" });
      const err = tulipErr(data);
      if (err) notes.push("myreserve err " + err);
      else {
        for (const it of items(data?.result ?? data)) {
          resvs.push({
            title: String(it.title || ""),
            arrived: String(it.reservation_staus ?? it.reservation_status ?? "") === "0008",
            waitDate: String(it.wait_date || ""),
          });
        }
      }
    } catch (e) { notes.push("myreserve:" + String(e).slice(0, 80)); }
  } else {
    notes.push("liid 없음");
  }

  return { loans, resvs, notes };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const admin = Deno.env.get("SEMYUNG_ADMIN_KEY") || "";
    if (!admin || url.searchParams.get("key") !== admin) return json({ ok: false, error: "권한이 없습니다" }, 403);
    const dry = url.searchParams.get("dry") === "1";
    const force = url.searchParams.get("force") === "1";
    const onlySid = url.searchParams.get("sid") || "";

    let subs = await listActive();
    if (onlySid) subs = subs.filter((s) => s.sid === onlySid);

    // 같은 학생이 여러 브라우저를 켜 뒀을 수 있다 — 도서관 조회는 학생당 1회만 하고 기기 전부에 보낸다
    const bySid = new Map<string, PushRow[]>();
    for (const s of subs) {
      const a = bySid.get(s.sid) || [];
      a.push(s);
      bySid.set(s.sid, a);
    }

    const report: unknown[] = [];
    let sent = 0, skipped = 0, failed = 0;

    for (const [sid, rows] of bySid) {
      const ses = await loadSessionAny(sid);
      if (!ses?.school_no || !ses?.portal_user_id) {
        for (const r of rows) if (!dry) await markFail(r.endpoint, r.fail_count, false);
        report.push({ sid, skip: "연계값 없음", devices: rows.length });
        failed += rows.length;
        continue;
      }

      const g = await gather(ses.school_no, ses.portal_user_id, ses.liid || "");
      // force = 배선 점검용. 반납일이 임박한 책이 없는 날에도 알림이 실제로 도착하는지 확인해야 하는데,
      // 그걸 기다리려면 며칠씩 걸린다. 중복방지 키에 시각을 넣어 몇 번이고 다시 보낼 수 있게 한다.
      const msg = buildAlert(g.loans, g.resvs) ?? (force
        ? {
          key: `force|${Date.now()}`, title: "알림 배선 점검",
          body: `지금 빌린 책 ${g.loans.length}권 · 기다리는 책 ${g.resvs.length}권 — 이 알림이 보이면 정상이에요`,
          url: "/app#mylib", tag: "bx-test",
        }
        : null);
      // 도서관 조회가 실제로 됐다는 뜻 → 세션 만료를 뒤로 민다(앱을 안 열어도 연동이 유지되게)
      if (!dry && (g.loans.length || g.resvs.length || !g.notes.length)) await touchSession(sid);

      const line: Record<string, unknown> = {
        sid, devices: rows.length, loans: g.loans.length, resvs: g.resvs.length,
        alert: msg ? { title: msg.title, body: msg.body, key: msg.key } : null,
      };
      if (g.notes.length) line.notes = g.notes;

      if (!msg) { skipped += rows.length; report.push(line); continue; }

      const results: string[] = [];
      for (const r of rows) {
        if (r.last_key === msg.key) { results.push("중복생략"); skipped++; continue; }   // 하루 두 번 울리지 않게
        if (dry) { results.push("dry"); continue; }
        const res = await sendPush(r, { title: msg.title, body: msg.body, tag: msg.tag, url: msg.url });
        if (res.ok) { await markSent(r.endpoint, msg.key); results.push("발송"); sent++; }
        else { await markFail(r.endpoint, r.fail_count, res.gone); results.push(`실패 ${res.status} ${res.body}`); failed++; }
      }
      line.results = results;
      report.push(line);
    }

    return json({ ok: true, dry, students: bySid.size, devices: subs.length, sent, skipped, failed, report });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 200);
  }
});

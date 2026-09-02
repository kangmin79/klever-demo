// JS 지도 — index.html 메인 <script> 블록을 ═══ 구역 주석 기준으로 표로 만들고,
// 파일 분리 때 깨질 수 있는 "최상위 즉시실행문"을 전수 나열한다 (2026-09-02 S4)
//
//   node scripts/smoke/js_map.mjs [--file=index.html]
//
// 출력 1) 구역표: 구역명 | 시작줄 | 끝줄 | 줄수
// 출력 2) 최상위 즉시실행문: 함수 정의·리터럴 대입이 아닌, 파싱 즉시 실행되는 문장(호출·addEventListener·if·for 등)
//         → 파일이 갈리면 "뒤 파일의 함수"를 부르는 순간 ReferenceError. 전부 js/99-boot.js 후보.
//         선언(const/let/var)이라도 우변에 호출이 있으면 같이 표시(호출 대상이 뒤 파일이면 위험).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const FILE = argv.file || 'index.html';
const html = fs.readFileSync(path.join(ROOT, FILE), 'utf8').replace(/\r\n/g, '\n');
const lines = html.split('\n');

// 가장 긴 인라인 <script> 블록 = 메인 앱 코드
let best = null;
const re = /<script>\n([\s\S]*?)\n<\/script>/g; let m;
while ((m = re.exec(html))) {
  const startLine = html.slice(0, m.index).split('\n').length; // <script> 줄 번호
  const n = m[1].split('\n').length;
  if (!best || n > best.n) best = { code: m[1], startLine, n };
}
if (!best) { console.error('메인 <script> 블록을 못 찾음'); process.exit(2); }
const codeFirstLine = best.startLine + 1;           // 코드 첫 줄의 html 줄번호
const codeLastLine = codeFirstLine + best.n - 1;
console.log(`메인 스크립트: ${FILE} ${codeFirstLine}~${codeLastLine}행 (${best.n}줄)\n`);

// ── 1) 구역표 ──
const secs = [];
for (let i = codeFirstLine; i <= codeLastLine; i++) {
  const ln = lines[i - 1];
  // 학생 화면은 ═══, 관리자 화면(admin/index.html)은 ===== 구역 주석 (S8-2)
  if (/^(\/\*|\/\/)\s*[═=]{3,}/.test(ln)) {
    // 3줄형(/* ═══\n 제목\n ═══ */) 또는 1줄형(/* ═══ 제목 ═══ */)
    let title = ln.replace(/^(\/\*|\/\/)\s*[═=]+\s*/, '').replace(/\s*[═=]+\s*\*?\/?\s*$/, '').trim();
    if (!title) title = (lines[i] || '').trim();
    secs.push({ title: title.slice(0, 60), start: i });
  }
}
secs.forEach((s, k) => { s.end = k + 1 < secs.length ? secs[k + 1].start - 1 : codeLastLine; s.n = s.end - s.start + 1; });
console.log('| # | 구역 | 시작 | 끝 | 줄수 |\n|---|---|---|---|---|');
secs.forEach((s, k) => console.log(`| ${k + 1} | ${s.title} | ${s.start} | ${s.end} | ${s.n} |`));

// ── 2) 최상위 즉시실행문 ──
let ast;
try { ast = acorn.parse(best.code, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
catch (e) { console.error('파싱 실패:', e.message); process.exit(2); }
const secOf = ln => { const s = secs.find(x => ln >= x.start && ln <= x.end); return s ? s.title.slice(0, 28) : '(구역 전)'; };
const src = (node) => best.code.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 90);
const hasCall = (node) => { let f = false; (function walk(n) { if (!n || typeof n.type !== 'string' || f) return; if (n.type === 'CallExpression' || n.type === 'NewExpression') { f = true; return; } if (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') return; for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); } })(node); return f; };

const exec = [], declCall = [];
for (const st of ast.body) {
  const ln = codeFirstLine + st.loc.start.line - 1;
  if (st.type === 'FunctionDeclaration') continue;
  if (st.type === 'VariableDeclaration') {
    if (st.declarations.some(d => d.init && hasCall(d.init))) declCall.push({ ln, kind: st.kind, src: src(st) });
    continue;
  }
  exec.push({ ln, kind: st.type, src: src(st) });
}
console.log(`\n### 최상위 즉시실행문 ${exec.length}개 (파일 분리 시 99-boot 후보 · 뒤 파일 함수를 부르면 깨짐)\n| 줄 | 구역 | 종류 | 내용 |\n|---|---|---|---|`);
exec.forEach(e => console.log(`| ${e.ln} | ${secOf(e.ln)} | ${e.kind.replace('Statement', '')} | \`${e.src.replace(/\|/g, '\\|')}\` |`));
console.log(`\n### 우변에 호출이 있는 최상위 선언 ${declCall.length}개 (호출 대상이 뒤 파일이면 위험)\n| 줄 | 구역 | 내용 |\n|---|---|---|`);
declCall.forEach(e => console.log(`| ${e.ln} | ${secOf(e.ln)} | \`${e.src.replace(/\|/g, '\\|')}\` |`));

// 함수 수·전역 선언 수 요약
const fn = ast.body.filter(s => s.type === 'FunctionDeclaration').length;
const vars = ast.body.filter(s => s.type === 'VariableDeclaration').reduce((a, s) => a + s.declarations.length, 0);
console.log(`\n요약: 최상위 함수 ${fn}개 · 최상위 변수 ${vars}개 · 즉시실행문 ${exec.length}개 · 호출 포함 선언 ${declCall.length}개`);

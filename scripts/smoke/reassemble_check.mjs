// 재조립 검증 — "분리한 CSS/JS를 원래 자리에 도로 붙이면 원본과 바이트 동일한가" (2026-09-02 S1)
//
//   node scripts/smoke/reassemble_check.mjs --ref=<git 커밋>   [--file=index.html]
//
// 규칙(분리 세션 S2·S4~S6이 지켜야 하는 약속 — 이 약속을 지키면 이 스크립트가 합격을 판정한다):
//   · <link rel="stylesheet" href="css/xxx.css?b=…">  한 줄  ⇐  원본의  <style>\n{파일 내용}</style>  블록
//   · <script src="js/xxx.js?b=…"></script>  한 줄(또는 연속 여러 줄)  ⇐  원본의  <script>\n{파일들 이어붙임}</script>  블록
//     - 연속된 js/ script 줄은 하나의 원본 <script> 블록으로 합쳐진다 (한 블록을 여러 파일로 나눈 경우)
//     - 파일 내용은 원본에서 잘라낸 그대로(끝 개행 포함). 한 글자도 바꾸지 않는다
//   · css/ · js/ 아래 파일만 인라인 대상. 다른 <script src>(classics_*.js 등)는 원본에도 src였으므로 그대로 둔다
//   · 비교 전 정규화: APP_BUILD 값과 ?b=… 캐시버전은 커밋마다 훅이 바꾸므로 고정 토큰으로 치환
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const REF = argv.ref;
const FILE = argv.file || 'index.html';
if (!REF) { console.error('사용법: --ref=<원본 커밋> [--file=index.html]'); process.exit(2); }

const norm = s => s
  .replace(/APP_BUILD = '[0-9a-z]+'/g, "APP_BUILD = '@BUILD@'")
  .replace(/\?b=[0-9a-z]+/g, '?b=@BUILD@')
  .replace(/\r\n/g, '\n');

const original = execSync(`git show ${REF}:${FILE.replace(/\\/g, '/')}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const current = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const dir = path.dirname(path.join(ROOT, FILE));

const lines = current.split('\n');
const out = [];
let inlined = [];
for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  const css = ln.match(/^\s*<link rel="stylesheet" href="((?:\.\.\/)?css\/[^"?]+)(?:\?b=[0-9a-z]+)?">\s*$/);
  if (css) {
    const body = fs.readFileSync(path.join(dir, css[1]), 'utf8');
    // 원본 모양: <style>⏎ 내용… ⏎</style> — 파일 끝 개행이 곧 </style> 앞 개행
    out.push('<style>'); out.push((body.endsWith('\n') ? body : body + '\n') + '</style>');
    inlined.push(css[1]); continue;
  }
  const js = ln.match(/^\s*<script src="((?:\.\.\/)?js\/[^"?]+)(?:\?b=[0-9a-z]+)?"><\/script>\s*$/);
  if (js) {
    // 연속된 js/ 줄을 한 블록으로
    let bodies = [fs.readFileSync(path.join(dir, js[1]), 'utf8')]; inlined.push(js[1]);
    while (i + 1 < lines.length) {
      const nx = lines[i + 1].match(/^\s*<script src="((?:\.\.\/)?js\/[^"?]+)(?:\?b=[0-9a-z]+)?"><\/script>\s*$/);
      if (!nx) break;
      bodies.push(fs.readFileSync(path.join(dir, nx[1]), 'utf8')); inlined.push(nx[1]); i++;
    }
    const joined = bodies.join('');
    out.push('<script>'); out.push((joined.endsWith('\n') ? joined : joined + '\n') + '</script>');
    continue;
  }
  out.push(ln);
}
const rebuilt = out.join('\n');

const A = norm(original).split('\n'), B = norm(rebuilt).split('\n');
let firstDiff = -1;
for (let i = 0; i < Math.max(A.length, B.length); i++) { if (A[i] !== B[i]) { firstDiff = i; break; } }

console.log(`재조립 검증 — ${FILE} vs ${REF}`);
console.log(`  인라인한 파일: ${inlined.length ? inlined.join(', ') : '(없음)'}`);
console.log(`  원본 ${A.length}줄 / 재조립 ${B.length}줄`);
if (firstDiff < 0) { console.log('  ✔ 바이트 동일 (정규화 후)'); process.exit(0); }
console.log(`  ✘ ${firstDiff + 1}번째 줄부터 다름`);
console.log('    원본  : ' + JSON.stringify((A[firstDiff] || '').slice(0, 140)));
console.log('    재조립: ' + JSON.stringify((B[firstDiff] || '').slice(0, 140)));
process.exit(1);

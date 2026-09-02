// JS 분리 도구 — index.html의 인라인 <script> 블록에서 지정 줄 범위를 잘라 js/ 파일로 옮기고
// 그 자리에 <script src="js/…?b=BUILD"></script> 를 남긴다. (2026-09-02 S4. S5·S6도 같은 도구)
//
//   node scripts/smoke/split_js.mjs --spec=<json 파일>
//   spec: { "file":"index.html", "blocks":[ { "scriptOpen":9753, "scriptClose":9828,
//            "parts":[ {"from":9754,"to":9827,"out":"js/90-ai-recommend.js"} ] } ] }
//   · scriptOpen/scriptClose = <script> / </script> 줄번호. parts 는 그 사이를 빈틈없이 덮어야 함(검증함)
//   · 줄번호는 실행 전 원본 기준. 여러 블록은 아래→위 순으로 처리해 번호가 안 밀리게 한다
//   · 잘라낸 내용은 한 글자도 바꾸지 않는다(끝 개행 포함). 합격 판정은 reassemble_check 가 한다
//   · "srcBase":"../" (S8-2 admin/index.html 용) — out 은 repo 루트 기준 경로, src 속성엔 이 접두어를 붙인다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
if (!argv.spec) { console.error('사용법: --spec=<json>'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(argv.spec, 'utf8'));
const FILE = path.join(ROOT, spec.file || 'index.html');
const raw = fs.readFileSync(FILE, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(EOL);
const build = (raw.match(/\?b=([0-9a-z]+)/) || [, '000000a'])[1];

const blocks = [...spec.blocks].sort((a, b) => b.scriptOpen - a.scriptOpen); // 아래부터
for (const b of blocks) {
  if (lines[b.scriptOpen - 1].trim() !== '<script>') throw new Error(`${b.scriptOpen}행이 <script> 가 아님: ${lines[b.scriptOpen - 1]}`);
  if (lines[b.scriptClose - 1].trim() !== '</script>') throw new Error(`${b.scriptClose}행이 </script> 가 아님: ${lines[b.scriptClose - 1]}`);
  const parts = [...b.parts].sort((x, y) => x.from - y.from);
  let cur = b.scriptOpen + 1;
  for (const p of parts) { if (p.from !== cur) throw new Error(`빈틈/겹침: ${cur}행부터여야 하는데 ${p.from}`); cur = p.to + 1; }
  if (cur !== b.scriptClose) throw new Error(`마지막 part 끝(${cur - 1})이 </script> 바로 앞(${b.scriptClose - 1})이 아님`);
  const srcLines = [];
  for (const p of parts) {
    const body = lines.slice(p.from - 1, p.to).join(EOL) + EOL;
    const outPath = path.join(ROOT, p.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath)) throw new Error(`이미 있음: ${p.out}`);
    fs.writeFileSync(outPath, body, 'utf8');
    srcLines.push(`<script src="${spec.srcBase || ''}${p.out}?b=${build}"></script>`);
    console.log(`${p.out} ← ${p.from}~${p.to}행 (${p.to - p.from + 1}줄, ${Buffer.byteLength(body)}B)`);
  }
  lines.splice(b.scriptOpen - 1, b.scriptClose - b.scriptOpen + 1, ...srcLines);
}
fs.writeFileSync(FILE, lines.join(EOL), 'utf8');
console.log(`${spec.file || 'index.html'} → ${lines.length}줄`);

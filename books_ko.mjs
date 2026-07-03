import fs from 'fs';
const koRaw=fs.readFileSync('_6593_trans.txt','utf8').split(/\r?\n/);
const ko=koRaw.map(l=>l.trim());
const en=JSON.parse(fs.readFileSync('_6593_en_chapters.json','utf8'));
// explicit 제N권 markers
const gwon={}; for(let i=0;i<ko.length;i++){ const m=ko[i].match(/^제\s*(\d+)\s*권$/); if(m) gwon[+m[1]]=i; }
console.log('explicit 제N권:', Object.entries(gwon).map(([k,v])=>`${k}권@${v}`).join(' '));
// English book start chapter titles (ch1 of each book) for anchoring missing books
const enBookCh1={}; en.forEach(c=>{ if(c.chap===1) enBookCh1[c.book]=c.title; });
for(let b=1;b<=18;b++) console.log(`EN B${b}.1: ${enBookCh1[b].slice(0,70)}`);

/* 28-maktab: server funksiyalari uchun umumiy yordamchilar (api/_lib.js: bu fayl o'zi alohida manzil bo'lmaydi) */
const PROJECT = 'maktab-49da5';
const API_KEY = 'AIzaSyCyY4iguO742_S9Io843WK5GGHZFSYDPOc';   // Firebase veb-kalit: ochiq ma'lumot, maxfiy emas
const ORIGIN = 'https://28maktab.uz';
const OWNER = 'idrizmedia@gmail.com';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const CATS = { yangilik: 'Yangilik', tadbir: 'Tadbir', yutuq: 'Yutuq', elon: "E'lon" };
const MON = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktyabr', 'noyabr', 'dekabr'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fdate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : '';
}

/* Yangilik matni: **qalin**, *kursiv*, "## sarlavha", "- ro'yxat", [matn](https://havola). Hammasi avval xavfsiz qilinadi. */
function fmtBody(t) {
  const toks = [];
  const keep = function (h) { toks.push(h); return '\u0000' + (toks.length - 1) + '\u0000'; };
  let s = esc(t);
  s = s.replace(/\[([^\]\n]{1,120})\]\((https:\/\/[^\s)]+)\)/g, function (_, a, u) {
    return keep('<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + a + '</a>');
  });
  s = s.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
    return keep('<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + u + '</a>');
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>');
  const out = []; let list = false, para = [];
  const flush = function () { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const endList = function () { if (list) { out.push('</ul>'); list = false; } };
  s.split('\n').forEach(function (line) {
    const l = line.trim(); let m;
    if (!l) { flush(); endList(); return; }
    if ((m = /^##\s+(.+)$/.exec(l))) { flush(); endList(); out.push('<h3>' + m[1] + '</h3>'); return; }
    if ((m = /^[-•]\s+(.+)$/.exec(l))) { flush(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + m[1] + '</li>'); return; }
    endList(); para.push(l);
  });
  flush(); endList();
  return out.join('').replace(/\u0000(\d+)\u0000/g, function (_, i) { return toks[+i]; });
}
function plain(t, max) {
  let s = String(t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/^##\s+/gm, '')
    .replace(/^[-•]\s+/gm, '• ').replace(/\*([^*\n]+)\*/g, '$1').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (max && s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return s;
}

/* Firestore REST qiymatlarini oddiy JS qiymatiga aylantirish */
function fv(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fv);
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = fv(f[k]); }); return o; }
  return null;
}
function toObj(d) {
  const o = {}; const f = d.fields || {};
  Object.keys(f).forEach(function (k) { o[k] = fv(f[k]); });
  o.id = String(d.name || '').split('/').pop();
  return o;
}
async function getDoc(path, opts) {
  opts = opts || {};
  const mask = (opts.mask || []).map(function (f) { return 'mask.fieldPaths=' + f; }).join('&');
  const r = await fetch(FS + '/' + path + '?' + (mask ? mask + '&' : '') + 'key=' + API_KEY, opts.token ? { headers: { Authorization: 'Bearer ' + opts.token } } : undefined);
  if (!r.ok) return null;
  return toObj(await r.json());
}
/* e'lon qilingan yangiliklar (qoidalar faqat shunday so'rovga ruxsat beradi) */
async function publishedNews(select, limit) {
  const body = { structuredQuery: {
    from: [{ collectionId: 'news' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
    limit: limit || 200 } };
  if (select) body.structuredQuery.select = { fields: select.map(function (p) { return { fieldPath: p }; }) };
  const r = await fetch(FS + ':runQuery?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) return [];
  const rows = await r.json();
  return rows.filter(function (x) { return x.document; }).map(function (x) { return toObj(x.document); })
    .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
}
function videoEmbed(u) {
  u = String(u || '').trim(); let x;
  if ((x = /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/.exec(u)) || (x = /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u)))
    return { src: 'https://www.youtube-nocookie.com/embed/' + x[1], tg: false };
  if ((x = /^https:\/\/t\.me\/([A-Za-z0-9_]{4,32})\/(\d+)/.exec(u))) return { src: 'https://t.me/' + x[1] + '/' + x[2] + '?embed=1&mode=tme', tg: true };
  return null;
}
module.exports = { PROJECT, API_KEY, ORIGIN, OWNER, FS, CATS, esc, fdate, fmtBody, plain, getDoc, publishedNews, videoEmbed, toObj };

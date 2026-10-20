/* 28-maktab: server funksiyalari uchun umumiy yordamchilar (api/_lib.js: bu fayl o'zi alohida manzil bo'lmaydi) */
const PROJECT = 'maktab-49da5';
const API_KEY = 'AIzaSyCyY4iguO742_S9Io843WK5GGHZFSYDPOc';   // Firebase veb-kalit: ochiq ma'lumot, maxfiy emas
const ORIGIN = 'https://28maktab.uz';
const OWNER = 'idrizmedia@gmail.com';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const CATS = { yangilik: 'Yangilik', tadbir: 'Tadbir', yutuq: 'Yutuq', elon: "E'lon" };
const MON = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

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
/* Havola bo'yicha videoni sayt ichida ochish. Qo'llab-quvvatlanadi: YouTube, Vimeo, Rutube, OK.ru, Google Drive,
   Facebook, Instagram, TikTok, Telegram (cheklangan), to'g'ridan-to'g'ri video fayl (.mp4 .webm .ogg .mov .m4v). */
function videoEmbed(u) {
  u = String(u || '').trim(); let x;
  if (!/^https:\/\//i.test(u) || u.length > 400) return null;
  if ((x = /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/.exec(u)) || (x = /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u)))
    return { kind: 'iframe', src: 'https://www.youtube-nocookie.com/embed/' + x[1], cls: '' };
  if ((x = /^https:\/\/(?:www\.)?vimeo\.com\/(?:[^\/?#]+\/)*(\d{6,12})/.exec(u))) return { kind: 'iframe', src: 'https://player.vimeo.com/video/' + x[1], cls: '' };
  if ((x = /^https:\/\/(?:www\.)?rutube\.ru\/(?:video|play\/embed)\/([A-Fa-f0-9]{32})/.exec(u))) return { kind: 'iframe', src: 'https://rutube.ru/play/embed/' + x[1], cls: '' };
  if ((x = /^https:\/\/(?:www\.)?ok\.ru\/video(?:embed)?\/(\d{6,20})/.exec(u))) return { kind: 'iframe', src: 'https://ok.ru/videoembed/' + x[1], cls: '' };
  if ((x = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,80})/.exec(u)) || (x = /^https:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,80})/.exec(u)))
    return { kind: 'iframe', src: 'https://drive.google.com/file/d/' + x[1] + '/preview', cls: '' };
  if (/^https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/.+\/(?:videos|reel)\/|^https:\/\/fb\.watch\//i.test(u))
    return { kind: 'iframe', src: 'https://www.facebook.com/plugins/video.php?show_text=false&href=' + encodeURIComponent(u), cls: '' };
  if ((x = /^https:\/\/(?:www\.)?instagram\.com\/(reel|p|tv)\/([A-Za-z0-9_-]{5,20})/.exec(u))) return { kind: 'iframe', src: 'https://www.instagram.com/' + x[1] + '/' + x[2] + '/embed', cls: 'tall' };
  if ((x = /^https:\/\/(?:www\.)?tiktok\.com\/@[^\/]+\/video\/(\d{8,25})/.exec(u))) return { kind: 'iframe', src: 'https://www.tiktok.com/embed/v2/' + x[1], cls: 'tall' };
  if ((x = /^https:\/\/t\.me\/([A-Za-z0-9_]{4,32})\/(\d+)/.exec(u))) return { kind: 'iframe', src: 'https://t.me/' + x[1] + '/' + x[2] + '?embed=1&mode=tme', cls: 'tg', open: u };
  if (/^https:\/\/[^\s?#]+\.(?:mp4|webm|ogg|mov|m4v)(?:[?#]\S*)?$/i.test(u)) return { kind: 'video', src: u, cls: '' };
  return { kind: 'link', href: u };
}
function videosOf(n) {
  const a = Array.isArray(n.videos) ? n.videos : (n.video ? String(n.video).split(/\s+/) : []);
  return a.map(function (u) { return String(u || '').trim(); }).filter(Boolean).slice(0, 3);
}
function videoHTML(u) {
  const v = videoEmbed(u);
  if (!v) return '';
  if (v.kind === 'link') return '<p><a class="btn out" target="_blank" rel="noopener noreferrer" href="' + esc(v.href) + '">▶ Videoni ko\'rish ↗</a></p>';
  if (v.kind === 'video') return '<div class="vid"><video controls playsinline preload="metadata" src="' + esc(v.src) + '"></video></div>';
  return '<div class="vid ' + v.cls + '"><iframe src="' + esc(v.src) + '" title="Video" loading="lazy" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>' +
    (v.open ? '<p class="vnote">Video ko\'rinmasa: <a href="' + esc(v.open) + '" target="_blank" rel="noopener noreferrer">Telegram\'da ochish ↗</a></p>' : '');
}

/* Ijtimoiy tarmoq belgilari va saytning pastki paneli (server sahifalari uchun) */
const ICONS = {
  telegram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M21.7 3.5 2.9 10.8c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 5c.3-1.3-.5-1.9-1.2-1.5zM8.5 13.3l9.6-6c.5-.3.9-.1.5.2l-7.9 7.1-.3 3.3-1.9-4.6z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"/></svg>'
};
function footerHTML(info) {
  info = info || {};
  const httpsOnly = function (u) { return /^https:\/\//i.test(u || '') ? u : ''; };
  const soc = [['telegram', httpsOnly(info.telegram), 'Telegram'], ['instagram', httpsOnly(info.instagram), 'Instagram'], ['youtube', httpsOnly(info.youtube), 'YouTube']]
    .filter(function (x) { return x[1]; })
    .map(function (x) { return '<a class="soc-a" href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer" aria-label="' + x[2] + '" title="' + x[2] + '">' + ICONS[x[0]] + '</a>'; }).join('');
  const tel = String(info.phone || '').replace(/[^\d+]/g, '');
  const rows = [];
  if (info.address) rows.push('<li>📍 ' + esc(info.address) + '</li>');
  if (tel) rows.push('<li>📞 <a href="tel:' + esc(tel) + '">' + esc(info.phone) + '</a></li>');
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(info.email || '')) rows.push('<li>✉️ <a href="mailto:' + esc(info.email) + '">' + esc(info.email) + '</a></li>');
  if (info.hours) rows.push('<li>🕘 ' + esc(info.hours) + '</li>');
  return '<footer class="ft"><div class="wrap ft-grid"><div><div class="ft-b"><img src="/logo-28.svg" width="46" height="46" alt="28-maktab"><div><b>28-MAKTAB</b><small>TARBIYA · BILIM · KELAJAK</small></div></div>' +
    (soc ? '<div class="soc">' + soc + '</div>' : '') + '</div>' +
    '<div><h4>Sahifalar</h4><ul class="ft-l"><li><a href="/">Bosh sahifa</a></li><li><a href="/#/yangiliklar">Yangiliklar</a></li><li><a href="/#/tadbirlar">Tadbirlar</a></li><li><a href="/#/jamoa">Jamoa</a></li><li><a href="/#/jadval">Jadval</a></li><li><a href="/#/aloqa">Aloqa</a></li></ul></div>' +
    '<div><h4>Aloqa</h4>' + (rows.length ? '<ul class="ft-l">' + rows.join('') + '</ul>' : '<ul class="ft-l"><li><a href="/#/aloqa">Aloqa ma\'lumotlari</a></li></ul>') + '</div></div>' +
    '<div class="ft-bot"><div class="wrap"><span>© ' + new Date().getFullYear() + ' 28-maktab. Barcha huquqlar himoyalangan.</span><span class="ft-legal"><a href="/#/shartlar">Foydalanish shartlari</a><a href="/#/maxfiylik">Maxfiylik siyosati</a></span></div></div></footer>';
}

/* Sayt rangini tanlash (ochiq sahifa bilan bir xil, tanlov brauzerda saqlanadi) */
const TH = [{"n": "Moviy", "navy": "#0F3D7A", "blue": "#1A3E8C", "ink": "#0B2447", "soft": "#EEF2FA", "h1": "#0B2F63", "h2": "#0F3D7A", "h3": "#1A3E8C", "glow": "#1c5aa8"}, {"n": "Yashil", "navy": "#0B6B4A", "blue": "#0F8A5F", "ink": "#062E22", "soft": "#E8F6EF", "h1": "#064D35", "h2": "#0B6B4A", "h3": "#0F8A5F", "glow": "#1FA97A"}, {"n": "Binafsha", "navy": "#4A2FA5", "blue": "#5B3FD1", "ink": "#1D1250", "soft": "#F0ECFB", "h1": "#321F7A", "h2": "#4A2FA5", "h3": "#5B3FD1", "glow": "#7A5CE6"}, {"n": "Qizil", "navy": "#A3262F", "blue": "#C2303B", "ink": "#3A0E12", "soft": "#FBEBEC", "h1": "#7A1B22", "h2": "#A3262F", "h3": "#C2303B", "glow": "#E0545E"}, {"n": "Zangori", "navy": "#0A6F82", "blue": "#0E8AA0", "ink": "#062F38", "soft": "#E6F5F8", "h1": "#07505E", "h2": "#0A6F82", "h3": "#0E8AA0", "glow": "#25A8C2"}, {"n": "To'q sariq", "navy": "#B4500F", "blue": "#D4660F", "ink": "#3D1F05", "soft": "#FDF0E4", "h1": "#8A3C0B", "h2": "#B4500F", "h3": "#D4660F", "glow": "#F08A35"}, {"n": "Grafit", "navy": "#2D3748", "blue": "#3F4B63", "ink": "#151A24", "soft": "#EEF0F4", "h1": "#1F2531", "h2": "#2D3748", "h3": "#3F4B63", "glow": "#5B6B8C"}];
function themeHead() {
  return '<script>window.__TH=' + JSON.stringify(TH).replace(/</g, '\\u003c') + ';(function(){try{var i=+localStorage.getItem("m28_pub_theme"),t=window.__TH[i];if(i&&t){var s=document.documentElement.style;s.setProperty("--navy",t.navy);s.setProperty("--blue",t.blue);s.setProperty("--ink",t.ink);s.setProperty("--soft",t.soft)}}catch(e){}})();</script>';
}
const THEME_CSS = '#thWrap{position:fixed;right:14px;bottom:14px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px}#thBtn{width:46px;height:46px;border-radius:50%;border:0;background:var(--navy);color:#fff;font-size:21px;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.28)}#thPop{display:none;background:#fff;border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:0 14px 34px rgba(0,0,0,.2);gap:8px;flex-wrap:wrap;max-width:200px}#thPop.on{display:flex}#thPop button{width:30px;height:30px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1.5px var(--line);cursor:pointer;padding:0}#thPop button.on{box-shadow:0 0 0 2.5px var(--gold)}';
function themeWidget() {
  return '<div id="thWrap"><div id="thPop" role="group" aria-label="Sayt rangi">' + TH.map(function (t, i) { return '<button type="button" data-th="' + i + '" title="' + esc(t.n) + '" aria-label="' + esc(t.n) + '" style="background:' + t.navy + '"></button>'; }).join('') + '</div><button type="button" id="thBtn" aria-label="Rang tanlash" title="Sayt rangini tanlang">🎨</button></div>' +
    '<script>(function(){var w=document.getElementById("thWrap"),cur=0;try{cur=+localStorage.getItem("m28_pub_theme")||0}catch(e){}function ap(i){var t=window.__TH[i]||window.__TH[0],s=document.documentElement.style;s.setProperty("--navy",t.navy);s.setProperty("--blue",t.blue);s.setProperty("--ink",t.ink);s.setProperty("--soft",t.soft);try{localStorage.setItem("m28_pub_theme",String(i))}catch(e){}var b=w.querySelectorAll("#thPop button");for(var k=0;k<b.length;k++)b[k].classList.toggle("on",k===i)}ap(cur);w.addEventListener("click",function(e){var b=e.target.closest("[data-th]");if(b){ap(+b.getAttribute("data-th"));return}if(e.target.closest("#thBtn"))document.getElementById("thPop").classList.toggle("on")});document.addEventListener("click",function(e){if(!e.target.closest("#thWrap"))document.getElementById("thPop").classList.remove("on")})})();</script>';
}
/* ===== Server yordamchilari (telegram-webhook, send-parent-notice, monthly-report uchun) =====
   Vercel muhit o'zgaruvchilari: FIREBASE_SERVICE_ACCOUNT_JSON (JSON yoki base64), TELEGRAM_TOKEN yoki TELEGRAM_BOT_TOKEN.
   firebase-admin faqat shu funksiyalar chaqirilganda yuklanadi (ochiq sahifalar sekinlashmaydi). */
let _adm = null;
function adminApp() {
  if (_adm) return _adm;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    /* api/_admin.js (ota-onalar kabineti) bilan bir xil nomlar qabul qilinadi, shunda bitta kalit hamma joyda ishlaydi */
    const NAMES = ['FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_ADMIN_KEY', 'FIREBASE_ADMIN_CREDENTIALS', 'GOOGLE_SERVICE_ACCOUNT', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'SERVICE_ACCOUNT', 'SERVICE_ACCOUNT_JSON', 'FIREBASE_KEY'];
    let sa = null;
    for (const n of NAMES) {
      let raw = String(process.env[n] || '').trim(); if (!raw) continue;
      try { if (raw[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8'); const j = JSON.parse(raw); if (j.client_email && j.private_key) { sa = j; break; } } catch (e) { /* keyingisini sinaymiz */ }
    }
    if (!sa && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) sa = { project_id: PROJECT, client_email: process.env.FIREBASE_CLIENT_EMAIL, private_key: process.env.FIREBASE_PRIVATE_KEY };
    if (!sa) throw new Error('Firebase xizmat kaliti (FIREBASE_SERVICE_ACCOUNT_JSON) sozlanmagan yoki noto\'g\'ri');
    if (sa.private_key) sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  _adm = admin;
  return _adm;
}
function db() { return adminApp().firestore(); }
function adminAuth() { return adminApp().auth(); }
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d; else if (d.length === 13 && d.indexOf('8998') === 0) d = d.slice(1);
  return d;
}
function tgToken() { return process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''; }
async function tgApi(method, payload) {
  if (!tgToken()) console.error('Bot tokeni yo\'q: Vercel da TELEGRAM_TOKEN yoki TELEGRAM_BOT_TOKEN kiriting');
  try {
    const r = await fetch('https://api.telegram.org/bot' + tgToken() + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
    const j = await r.json();
    if (!j.ok) console.error('Telegram ' + method + ' xato:', j.description);   // endi Vercel Logs da ko'rinadi
    return j;
  } catch (e) { console.error('Telegram ' + method + ' tarmoq xatosi:', e); return { ok: false, description: String((e && e.message) || e) }; }
}
async function tgSendDocument(chatId, base64, filename, caption) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  if (caption) fd.append('caption', caption);
  fd.append('document', new Blob([Buffer.from(String(base64).replace(/^data:[^,]*,/, ''), 'base64')], { type: 'application/pdf' }), filename || 'xat.pdf');
  const r = await fetch('https://api.telegram.org/bot' + tgToken() + '/sendDocument', { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'sendDocument xato');
  return j;
}
async function isAdminEmail(email) {
  email = String(email || '').toLowerCase();
  if (!email) return false;
  if (email === OWNER) return true;
  const d = await db().collection('admins').doc(email).get();
  return d.exists;
}

module.exports = { db, adminAuth, normPhone, tgApi, tgSendDocument, isAdminEmail, TH, themeHead, THEME_CSS, themeWidget, PROJECT, API_KEY, ORIGIN, OWNER, FS, CATS, esc, fdate, fmtBody, plain, getDoc, publishedNews, videoEmbed, videosOf, videoHTML, footerHTML, toObj };

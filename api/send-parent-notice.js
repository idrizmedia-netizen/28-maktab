/* 28-maktab: ota-onalar kabineti.
   1) action:"code"   — ota-onaning telefon raqami bo'yicha Telegram botdan bir martalik kod yuboradi
   2) action:"verify" — kod to'g'ri bo'lsa, farzandning davomati va olgan xatlarini BIR MARTA qaytaradi
   Ma'lumot brauzerda saqlanmaydi. Qayta ko'rish uchun yangi kod olinadi. Maxfiy kalitlar faqat Vercel muhit o'zgaruvchilarida. */
const crypto = require('crypto');
const L = require('./_lib.js');
const A = require('./_admin.js');

const KIND = { '': "Ogohlantirish xati", praise: 'Minnatdorchilik xati', invite: "Ota-onalar yig'ilishi taklifnomasi", summon: 'Maktabga chaqiruv xati' };
const WIN = 10 * 60 * 1000, MAX_SENDS = 3, MAX_TRIES = 5, TTL = 5 * 60 * 1000, GAP = 45 * 1000;

function out(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.send(JSON.stringify(obj)); }
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 9) d = '998' + d; else if (d.length === 13 && d.indexOf('8998') === 0) d = d.slice(1); return d; }
function nk(s) { return String(s || '').toLowerCase().replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, ' ').trim(); }
function normCls(c) { return String(c || '').toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-'); }
function secret() { return process.env.PARENT_SECRET || process.env.TELEGRAM_BOT_TOKEN || ''; }
function hmac(msg) { return crypto.createHmac('sha256', secret()).update(msg).digest('hex'); }
function chatIdOf(o) {
  const keys = ['chatId', 'chat_id', 'chat', 'tgChatId', 'telegramId', 'tgId', 'userId', 'user_id'];
  for (let i = 0; i < keys.length; i++) { const v = o[keys[i]]; if (v !== undefined && v !== null && v !== '' && /^-?\d{5,16}$/.test(String(v))) return String(v); }
  return '';
}

/* Telefon raqamiga ulangan Telegram chat (botga /start bosib raqamini ulashgan ota-ona) */
async function findChat(p) {
  for (const id of [p, '+' + p]) { const d = await A.getDoc('telegram_links/' + encodeURIComponent(id)); if (d) { const c = chatIdOf(d); if (c) return c; } }
  for (const f of ['phone', 'phoneNumber', 'tel']) for (const v of [p, '+' + p]) {
    const rows = await A.queryEq('telegram_links', f, v, 3);
    for (let i = 0; i < rows.length; i++) { const c = chatIdOf(rows[i]) || (/^\d{5,16}$/.test(rows[i].id) && rows[i].id !== p ? rows[i].id : ''); if (c) return c; }
  }
  return '';
}

/* Ota-onaning raqami bo'yicha farzandlar: o'quvchilar bazasi + xatlar ro'yxati */
async function loadBase() {
  const [roster, log, attst] = await Promise.all([A.getDoc('adminonly/roster'), A.getDoc('m28letters/m28_log'), A.getDoc('m28letters/m28_attst')]);
  return {
    students: ((roster && roster.data && roster.data.students) || []).filter(Boolean),
    letters: ((log && log.items) || []).filter(Boolean),
    attst: ((attst && attst.items) || []).filter(Boolean)
  };
}
function childrenOf(p, base) {
  const map = {}; const add = function (name, cls) { const k = nk(name) + '|' + normCls(cls); if (name && !map[k]) map[k] = { name: String(name).trim(), cls: String(cls || '').trim() }; };
  base.students.forEach(function (s) { if (normPhone(s.phone) === p) add(s.name, s.cls); });
  base.letters.forEach(function (e) { if (normPhone(e.phone) === p) add(e.name, e.cls); });
  return Object.keys(map).map(function (k) { return map[k]; });
}

function monthsOfYear() {
  const t = new Date(), y = t.getFullYear(), mo = t.getMonth() + 1, start = mo >= 9 ? y : y - 1, out = [];
  for (let yy = start, mm = 9; yy < y || (yy === y && mm <= mo); ) { out.push(yy + '-' + (mm < 10 ? '0' : '') + mm); mm++; if (mm > 12) { mm = 1; yy++; } }
  return out;
}
async function buildData(p, base) {
  const kids = childrenOf(p, base), months = monthsOfYear(), now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const result = [];
  for (const kid of kids) {
    const st = base.attst.filter(function (s) { return nk(s.name) === nk(kid.name) && normCls(s.cls) === normCls(kid.cls); })[0];
    const att = { months: [], tot: { days: 0, abs: 0, sz: 0, kas: 0, sb: 0, tad: 0, kch: 0, pct: null } };
    if (st) {
      const docs = await Promise.all(months.map(function (m) { return A.getDoc('m28letters/m28_att_' + m + '_' + String(st.cls).replace(/[\/\s]/g, '_')); }));
      docs.forEach(function (doc, i) {
        if (!doc || doc.kind !== 'att') return;
        const m = months[i], y = +m.slice(0, 4), mo = +m.slice(5), dim = new Date(y, mo, 0).getDate(), last = m === today ? now.getDate() : dim;
        const a = (doc.a && doc.a[st.id]) || {}, off = doc.off || {}; let days = 0; const absent = [];
        for (let d = 1; d <= last; d++) {
          const isOff = off[d] !== undefined ? !!off[d] : new Date(y, mo - 1, d).getDay() === 0;
          if (isOff) continue; days++;
          const c = a[d]; if (c) { absent.push({ d: d, c: c }); if (c !== 'Kch') { att.tot.abs++; if (c === 'Sz') att.tot.sz++; else if (c === 'Kas') att.tot.kas++; else if (c === 'Sb') att.tot.sb++; else if (c === 'Tad') att.tot.tad++; } else att.tot.kch++; }
        }
        att.tot.days += days; att.months.push({ m: m, days: days, absent: absent });
      });
      if (att.tot.days) att.tot.pct = Math.round(1000 * (1 - att.tot.abs / att.tot.days)) / 10;
    }
    const letters = base.letters.filter(function (e) { return (nk(e.name) === nk(kid.name) && normCls(e.cls) === normCls(kid.cls)) || (normPhone(e.phone) === p && nk(e.name) === nk(kid.name)); })
      .map(function (e) { return { k: e.kind || '', label: KIND[e.kind || ''] || 'Xat', date: e.date || '', reason: String(e.reason || '').slice(0, 600) }; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 60);
    result.push({ name: kid.name, cls: kid.cls, linked: !!st, att: att, letters: letters, warn: letters.filter(function (l) { return !l.k; }).length });
  }
  return result;
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return out(res, 405, { ok: false, error: 'Faqat POST' });
  const body = typeof req.body === 'string' ? (function () { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const action = body.action === 'verify' ? 'verify' : 'code';
  const phone = normPhone(body.phone);
  if (!/^998\d{9}$/.test(phone)) return out(res, 400, { ok: false, status: 'bad_phone', error: "Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67" });
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !secret()) return out(res, 500, { ok: false, status: 'server', error: 'Serverda TELEGRAM_BOT_TOKEN sozlanmagan' });
  try {
    if (!A.creds()) return out(res, 500, { ok: false, status: 'server', error: 'Serverda Firebase Admin kaliti (FIREBASE_SERVICE_ACCOUNT) sozlanmagan' });

    // IP bo'yicha umumiy cheklov
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'x').split(',')[0].trim();
    const ipId = 'ip_' + hmac('ip' + ip).slice(0, 24), now = Date.now();
    const rl = (await A.getDoc('parent_codes/' + ipId)) || {};
    const rlWin = rl.win && now - rl.win < WIN ? rl.win : now, rlCnt = (rl.win && now - rl.win < WIN ? rl.cnt || 0 : 0) + 1;
    await A.setDoc('parent_codes/' + ipId, { win: rlWin, cnt: rlCnt });
    if (rlCnt > 30) return out(res, 429, { ok: false, status: 'too_many', error: "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring." });

    if (action === 'code') {
      const base = await loadBase();
      if (!childrenOf(phone, base).length) return out(res, 200, { ok: false, status: 'no_student' });
      const chat = await findChat(phone);
      if (!chat) return out(res, 200, { ok: false, status: 'not_linked' });
      const cur = (await A.getDoc('parent_codes/p_' + phone)) || {};
      const win = cur.win && now - cur.win < WIN ? cur.win : now, cnt = cur.win && now - cur.win < WIN ? cur.cnt || 0 : 0;
      if (cur.sentAt && now - cur.sentAt < GAP) return out(res, 200, { ok: false, status: 'wait', seconds: Math.ceil((GAP - (now - cur.sentAt)) / 1000) });
      if (cnt >= MAX_SENDS) return out(res, 200, { ok: false, status: 'too_many', error: "Juda ko'p kod so'raldi. 10 daqiqadan keyin qayta urinib ko'ring." });
      const code = String(crypto.randomInt(100000, 1000000));
      const r = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: '🔐 <b>28-maktab</b>: ota-onalar kabineti uchun kirish kodi:\n\n<b>' + code + '</b>\n\nKod 5 daqiqa amal qiladi. Uni hech kimga aytmang. Agar bu so\'rovni siz yubormagan bo\'lsangiz, e\'tibor bermang.', parse_mode: 'HTML' }) });
      const j = await r.json();
      if (!j.ok) return out(res, 200, { ok: false, status: 'send_failed', error: "Kodni Telegram'ga yuborib bo'lmadi. Botni qayta ishga tushiring (/start) va qayta urinib ko'ring." });
      await A.setDoc('parent_codes/p_' + phone, { h: hmac(phone + ':' + code), exp: now + TTL, tries: 0, sentAt: now, win: win, cnt: cnt + 1 });
      return out(res, 200, { ok: true, status: 'sent', expiresIn: TTL / 1000 });
    }

    // verify
    const code = String(body.code || '').replace(/\D/g, '');
    const cur = await A.getDoc('parent_codes/p_' + phone);
    if (!cur || !cur.h || !cur.exp || now > cur.exp) return out(res, 200, { ok: false, status: 'expired', error: 'Kod eskirgan yoki so\'ralmagan. Yangi kod oling.' });
    if ((cur.tries || 0) >= MAX_TRIES) { await A.delDoc('parent_codes/p_' + phone); return out(res, 200, { ok: false, status: 'too_many', error: "Juda ko'p xato urinish. Yangi kod oling." }); }
    const good = code.length === 6 && crypto.timingSafeEqual(Buffer.from(hmac(phone + ':' + code)), Buffer.from(cur.h));
    if (!good) { await A.setDoc('parent_codes/p_' + phone, Object.assign({}, { h: cur.h, exp: cur.exp, sentAt: cur.sentAt || 0, win: cur.win || now, cnt: cur.cnt || 1 }, { tries: (cur.tries || 0) + 1 })); return out(res, 200, { ok: false, status: 'bad_code', left: MAX_TRIES - (cur.tries || 0) - 1, error: "Kod noto'g'ri" }); }
    await A.delDoc('parent_codes/p_' + phone);      // kod faqat bir marta ishlaydi
    const data = await buildData(phone, await loadBase());
    try { await A.setDoc('parent_log/' + now + '_' + phone.slice(-4), { at: now, phone: '+' + phone.slice(0, 5) + '*****' + phone.slice(-2), kids: data.length }); } catch (e) { /* jurnal majburiy emas */ }
    return out(res, 200, { ok: true, status: 'ok', children: data, generatedAt: now });
  } catch (e) {
    return out(res, 500, { ok: false, status: 'server', error: e && e.message === 'NO_ADMIN_KEY' ? 'Serverda Firebase Admin kaliti sozlanmagan' : 'Server xatosi. Birozdan keyin qayta urinib ko\'ring.' });
  }
};

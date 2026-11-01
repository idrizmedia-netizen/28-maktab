'use strict';
/* api/_tasks.js: avtomatik vazifalar (kuniga bir marta, Toshkent vaqti bilan soat 10:00 da ishga tushadi).
 *   taskNews      - rejalashtirilgan yangiliklarni e'lon qiladi (va Telegram kanalga joylaydi)
 *   taskAbsence   - davomatda "kelmadi" deb belgilangan o'quvchilarning ota-onasiga Telegramda xabar yuboradi
 *   taskReminders - ko'rilmagan xatlar haqida ota-onaga eslatma yuboradi
 *   taskBackup    - dushanba kuni hamma ma'lumotning zaxira faylini hisobot raqamiga yuboradi
 * Hammasi sozlamalarga (publicinfo/settings -> data.auto) bo'ysunadi va takror xabar yubormaydi.
 * ctx orqali tashqi dunyo (Firestore, Telegram, vaqt) almashtiriladi, shuning uchun sinab ko'rish mumkin. */
const crypto = require('crypto');
const zlib = require('zlib');
const L = require('./_lib');
const { t, normLang, kindKey } = require('./_i18n');

const DAY = 86400000, TZ_MS = 5 * 3600000;   // Toshkent: UTC+5 (yoz/qish vaqti yo'q)
const clamp = (v, a, b, d) => { v = +v; if (!isFinite(v)) v = d; return v < a ? a : (v > b ? b : v); };
const pad = (n) => String(n).padStart(2, '0');
const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tz(ms) {
  const d = new Date(ms + TZ_MS);
  return { ymd: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), month: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1), day: d.getUTCDate(), dow: d.getUTCDay(), hour: d.getUTCHours() };
}
function dmy(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : String(ymd || ''); }
function normClass(c) {
  c = String(c || '').trim(); if (!c) return c;
  const m = /^(\d{1,2})\s*-?\s*([A-Za-zА-Яа-яЎўҚқҒғҲҳ']+)$/.exec(c);
  return m ? m[1] + '-' + m[2].toUpperCase() : c;
}
function nameKey(s) { return String(s || '').toLowerCase().replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); }
function hash36(s) { let x = 5381; s = String(s); for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
function b64u(s) { return Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const phoneOf = (p) => L.normPhone(p);

/* ---------- tashqi dunyo (almashtiriladigan) ---------- */
function tgToken() { return process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''; }
async function defaultCall(method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + tgToken() + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
  return j.result;
}
async function defaultTgDoc(chatId, buf, filename, caption, mime) {
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  if (caption) fd.append('caption', caption);
  fd.append('document', new Blob([buf], { type: mime || 'application/json' }), filename);
  const r = await fetch('https://api.telegram.org/bot' + tgToken() + '/sendDocument', { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'sendDocument xato');
  return j;
}
async function defaultListAtt(ctx, prefix) {
  const FieldPath = require('firebase-admin').firestore.FieldPath;
  const q = await ctx.db().collection('m28letters').where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', prefix + '\uf8ff').get();
  const out = []; q.forEach((d) => out.push({ id: d.id, data: d.data() })); return out;
}
function makeCtx(over) {
  return Object.assign({ db: L.db, tgApi: L.tgApi, call: defaultCall, tgDoc: defaultTgDoc, listAtt: defaultListAtt, now: Date.now(), origin: L.ORIGIN, _links: {}, _mem: {} }, over || {});
}

/* ---------- umumiy o'qish yordamchilari ---------- */
async function readItems(ctx, docId) {
  const s = await ctx.db().collection('m28letters').doc(docId).get();
  const d = s.exists ? s.data() : null;
  return d && Array.isArray(d.items) ? d.items : [];
}
async function readRoster(ctx) {
  const s = await ctx.db().collection('adminonly').doc('roster').get();
  const d = s.exists ? (s.data().data || {}) : {};
  return { students: Array.isArray(d.students) ? d.students : [], teachers: d.teachers || [], reportPhone: d.reportPhone || '' };
}
function rosterPhone(roster, name, cls) {
  const k = nameKey(name), c = normClass(cls);
  const hit = roster.students.filter((s) => nameKey(s.name) === k && (!c || !s.cls || normClass(s.cls) === c))[0];
  return hit ? phoneOf(hit.phone) : '';
}
async function getSettings(ctx) {
  const s = await ctx.db().collection('publicinfo').doc('settings').get();
  const d = s.exists ? ((s.data() && s.data().data) || {}) : {};
  const a = d.auto || {};
  return {
    rem: { on: !!(a.rem && a.rem.on), days: clamp(a.rem && a.rem.days, 1, 14, 3), max: clamp(a.rem && a.rem.max, 1, 3, 1) },
    bk: { on: !(a.bk && a.bk.on === false) },
    abs: { on: !!(a.abs && a.abs.on), late: !!(a.abs && a.abs.late) },
  };
}
async function linkFor(ctx, phone) {
  if (!phone) return null;
  if (ctx._links[phone] !== undefined) return ctx._links[phone];
  const s = await ctx.db().collection('telegram_links').doc(phone).get();
  const d = s.exists ? s.data() : null;
  ctx._links[phone] = d && d.chatId ? d : null;
  return ctx._links[phone];
}
async function sendMsg(ctx, chatId, text, markup) {
  const p = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (markup) p.reply_markup = markup;
  const r = await ctx.tgApi('sendMessage', p);
  return !!(r && r.ok);
}

/* ---------- 1) ko'rilmagan xatlar uchun eslatma ---------- */
async function loadSeenData(ctx) {
  if (ctx._mem.seen) return ctx._mem.seen;
  const acks = {}, notices = {};
  (await ctx.db().collection('letter_acks').get()).forEach((d) => { acks[d.id] = true; });
  (await ctx.db().collection('notify_log').get()).forEach((d) => { const v = d.data(); notices[d.id] = v; });
  const byQt = {};
  Object.keys(notices).forEach((id) => { const v = notices[id]; if (v && v.qt && v.ackAt) byQt[v.qt] = true; });
  return (ctx._mem.seen = { acks, notices, byQt });
}
function isSeen(S, e) {
  if (e.deliv) return true;                                  // sinf rahbari qo'lda topshirdi / qo'ng'iroq qildi
  if (e.qt && (S.acks[e.qt] || S.byQt[e.qt])) return true;
  if (e.tg && S.notices[e.tg] && S.notices[e.tg].ackAt) return true;
  return false;
}
async function taskReminders(ctx, opts) {
  opts = opts || {};
  const S = await getSettings(ctx);
  const res = { task: 'reminders', on: S.rem.on, sent: 0, wouldSend: 0, noLink: 0, seen: 0, waiting: 0, maxed: 0, errors: 0 };
  if (!S.rem.on && !opts.force) { res.skipped = 'off'; return res; }
  const log = await readItems(ctx, 'm28_log');
  const roster = await readRoster(ctx);
  const now = ctx.now;
  const seenData = await loadSeenData(ctx);
  for (const e of log) {
    if (!e || !e.name) continue;
    const kind = e.kind || '';
    if (kind === 'praise') continue;                       // minnatdorchilik xatiga eslatma kerak emas
    const created = e.at || Date.parse(e.date) || 0;
    const age = (now - created) / DAY;
    if (age > 45) continue;                                // juda eski xatlarga eslatma yuborilmaydi
    if (isSeen(seenData, e)) { res.seen++; continue; }
    if (age < S.rem.days) { res.waiting++; continue; }
    const key = e.qt ? 'q_' + e.qt : 'h_' + hash36(e.id || (e.name + '|' + e.date));
    const rref = ctx.db().collection('letter_reminders').doc(key);
    const rs = await rref.get();
    const r = rs.exists ? rs.data() : { count: 0, lastAt: 0 };
    if ((r.count || 0) >= S.rem.max) { res.maxed++; continue; }
    if (r.lastAt && now - r.lastAt < S.rem.days * DAY) { res.waiting++; continue; }
    const phone = phoneOf(e.phone) || rosterPhone(roster, e.name, e.cls);
    const link = await linkFor(ctx, phone);
    if (!link) { res.noLink++; continue; }
    if (opts.dry) { res.wouldSend++; continue; }
    try {
      let nid = e.tg;
      if (!nid || !seenData.notices[nid]) {
        const nref = ctx.db().collection('notify_log').doc();
        nid = nref.id;
        await nref.set({ phone, name: e.name, cls: e.cls || '', clsKey: normClass(e.cls || ''), date: dmy(e.date), kind, sentBy: 'avto-eslatma', sentAt: now, letterId: e.id || '', qt: e.qt || '', reminder: true });
      }
      const lang = normLang(link.lang), kk = kindKey(kind);
      const who = t(lang, 'child') + ' ' + h(e.name) + (e.cls ? ' (' + t(lang, 'cls_sfx', { c: h(e.cls) }) + ')' : '');
      const reason = e.reason ? t(lang, 'rem_reason', { lb: t(lang, kk + '_reason'), reason: h(e.reason) }) : '';
      const url = e.qt ? ctx.origin + '/platforma#x=' + b64u([e.name, '', '', '', e.date].concat(kind ? [kind] : []).join('\n')) + '&k=' + e.qt : '';
      const text = t(lang, 'rem_text', { who, date: dmy(e.date), kind: t(lang, kk + '_name'), reason, link: url ? t(lang, 'rem_link', { url }) : '' });
      const ok = await sendMsg(ctx, link.chatId, text, { inline_keyboard: [[{ text: t(lang, 'btn_ack'), callback_data: 'ack|' + nid }]] });
      await rref.set({ count: ok ? (r.count || 0) + 1 : (r.count || 0), lastAt: now, firstAt: r.firstAt || now, clsKey: normClass(e.cls || ''), name: e.name, cls: e.cls || '', date: e.date || '', qt: e.qt || '', failed: ok ? 0 : (r.failed || 0) + 1 });
      if (ok) res.sent++; else res.errors++;
    } catch (err) { res.errors++; res.lastError = String((err && err.message) || err).slice(0, 160); }
  }
  return res;
}

/* ---------- 3) davomat -> ota-onaga xabar ---------- */
function isOffDay(rec, dayNum, dow) {
  const v = rec && rec.off ? rec.off[dayNum] : undefined;
  if (v !== undefined) return !!v;
  return dow === 0;
}
async function taskAbsence(ctx, opts) {
  opts = opts || {};
  const S = await getSettings(ctx);
  const res = { task: 'absence', on: S.abs.on, sent: 0, wouldSend: 0, noPhone: 0, noLink: 0, muted: 0, already: 0, errors: 0 };
  if (!S.abs.on && !opts.force) { res.skipped = 'off'; return res; }
  const T0 = tz(ctx.now), T1 = tz(ctx.now - DAY);
  const students = await readItems(ctx, 'm28_attst');
  const byId = {}; students.forEach((s) => { if (s && s.id) byId[s.id] = s; });
  const roster = await readRoster(ctx);
  const codes = ['Sz', 'Kas', 'Sb'].concat(S.abs.late ? ['Kch'] : []);
  for (const T of [T1, T0]) {
    const docs = await ctx.listAtt(ctx, 'm28_att_' + T.month + '_');
    for (const dd of docs) {
      const rec = dd.data || {};
      if (rec.kind !== 'att' || !rec.a) continue;
      if (isOffDay(rec, T.day, new Date(T.ymd + 'T00:00:00Z').getUTCDay())) continue;
      for (const sid of Object.keys(rec.a)) {
        const code = rec.a[sid] && rec.a[sid][T.day];
        if (!code || codes.indexOf(code) < 0) continue;
        const st = byId[sid]; if (!st) continue;
        const dkey = T.ymd + '_' + sid;
        const sref = ctx.db().collection('absence_sent').doc(dkey);
        if ((await sref.get()).exists) { res.already++; continue; }
        const phone = rosterPhone(roster, st.name, st.cls || rec.cls);
        if (!phone) { res.noPhone++; continue; }
        const link = await linkFor(ctx, phone);
        if (!link) { res.noLink++; continue; }
        if (link.muteAbsence) { res.muted++; continue; }
        if (opts.dry) { res.wouldSend++; continue; }
        try {
          const lang = normLang(link.lang);
          const who = t(lang, 'child') + ' <b>' + h(st.name) + '</b>' + ((st.cls || rec.cls) ? ' (' + t(lang, 'cls_sfx', { c: h(st.cls || rec.cls) }) + ')' : '');
          const text = code === 'Kch' ? t(lang, 'abs_late', { who, date: dmy(T.ymd) }) : t(lang, 'abs_text', { who, date: dmy(T.ymd), code: t(lang, 'code_' + code) });
          const ok = await sendMsg(ctx, link.chatId, text);
          await sref.set({ phone, code, at: ctx.now, name: st.name, cls: st.cls || rec.cls || '', ok });
          if (ok) res.sent++; else res.errors++;
        } catch (err) { res.errors++; res.lastError = String((err && err.message) || err).slice(0, 160); }
      }
    }
  }
  return res;
}

/* ---------- 2) haftalik zaxira ---------- */
async function taskBackup(ctx, opts) {
  opts = opts || {};
  const S = await getSettings(ctx), T = tz(ctx.now);
  const res = { task: 'backup', sent: false };
  if (!opts.force) {
    if (!S.bk.on) { res.skipped = 'off'; return res; }
    if (T.dow !== 1) { res.skipped = 'dushanba emas'; return res; }
  }
  const roster = await readRoster(ctx);
  const phone = phoneOf(roster.reportPhone);
  if (!phone) { res.error = "Hisobot raqami kiritilmagan (Sozlamalar → Baza → Hisobot raqami)"; return res; }
  const link = await linkFor(ctx, phone);
  if (!link) { res.error = "Hisobot raqami botga ulanmagan: shu raqam egasi botga /start yozib, raqamini ulashi kerak"; return res; }
  const [log, tlog, sigs, attst, archIdx] = await Promise.all([readItems(ctx, 'm28_log'), readItems(ctx, 'm28_tlog'), readItems(ctx, 'm28_sigs'), readItems(ctx, 'm28_attst'), readItems(ctx, 'm28_arch_idx')]);
  const arch = {};
  for (const a of archIdx) { if (a && a.y) arch[a.y] = await readItems(ctx, 'm28_arch_' + a.y); }
  const att = {};
  (await ctx.listAtt(ctx, 'm28_att_')).forEach((d) => { att[d.id] = d.data; });
  const rs = await ctx.db().collection('adminonly').doc('roster').get();
  const ss = await ctx.db().collection('publicinfo').doc('settings').get();
  const payload = {
    app: '28-maktab', version: 1, at: new Date(ctx.now).toISOString(), by: 'avtomatik',
    log, tlog, sigs, attst, arch, att,
    roster: rs.exists ? (rs.data().data || {}) : {},
    settings: ss.exists ? (ss.data().data || {}) : {},
  };
  let buf = Buffer.from(JSON.stringify(payload), 'utf8'), name = '28-maktab-zaxira-' + T.ymd + '.json', mime = 'application/json';
  if (buf.length > 45 * 1024 * 1024) { buf = zlib.gzipSync(buf); name += '.gz'; mime = 'application/gzip'; }
  res.letters = log.length; res.teacherLetters = tlog.length; res.students = (payload.roster.students || []).length; res.kb = Math.round(buf.length / 1024);
  if (opts.dry) { res.wouldSend = true; return res; }
  const cap = '💾 28-maktab: zaxira nusxa (' + dmy(T.ymd) + ')\nXatlar: ' + log.length + ' · O\'qituvchi xatlari: ' + tlog.length + ' · O\'quvchilar bazasi: ' + res.students +
    '\n\nTiklash: Platforma → Sozlamalar → Zaxira va arxiv → «Zaxiradan qo\'shib tiklash».';
  try { await ctx.tgDoc(link.chatId, buf, name, cap, mime); res.sent = true; } catch (e) { res.error = 'Telegramga yuborib bo\'lmadi: ' + String((e && e.message) || e).slice(0, 140); }
  return res;
}

/* ---------- 7) rejalashtirilgan yangiliklar ---------- */
async function taskNews(ctx, opts) {
  opts = opts || {};
  const T = tz(ctx.now);
  const res = { task: 'news', due: 0, published: 0, tgSent: 0, errors: 0 };
  const q = await ctx.db().collection('news').where('status', '==', 'scheduled').get();
  const due = []; q.forEach((d) => { const n = d.data(); if (String(n.publishAt || '') <= T.ymd) due.push({ id: d.id, n }); });
  res.due = due.length;
  if (opts.dry) return res;
  let channel;
  for (const it of due) {
    try {
      await ctx.db().collection('news').doc(it.id).update({ status: 'published', publishedAt: ctx.now });
      res.published++;
      if (it.n.tgPlan) {
        if (channel === undefined) {
          const info = await ctx.db().collection('publicinfo').doc('maktab').get();
          const ch = info.exists ? String(info.data().tgChannel || '').trim() : '';
          channel = /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,})$/.test(ch) ? ch : '';
        }
        if (channel) {
          const nt = require('./news-telegram');
          const tg = await nt.postToChannel(ctx.call, channel, Object.assign({}, it.n, { status: 'published' }), it.id);
          await ctx.db().collection('news').doc(it.id).update({ tg, tgAt: tg.at });
          res.tgSent++;
        } else res.tgNoChannel = true;
      }
    } catch (err) { res.errors++; res.lastError = String((err && err.message) || err).slice(0, 160); }
  }
  return res;
}

/* ---------- kunlik ishga tushirish ---------- */
async function runDaily(ctx, opts) {
  opts = opts || {};
  const results = [];
  const list = [['news', taskNews], ['absence', taskAbsence], ['reminders', taskReminders], ['backup', taskBackup]];
  for (const [name, fn] of list) {
    try { results.push(await fn(ctx, opts)); } catch (e) { console.error('vazifa xato (' + name + '):', e); results.push({ task: name, error: String((e && e.message) || e).slice(0, 200) }); }
  }
  try { await ctx.db().collection('cron_status').doc('last').set({ at: ctx.now, results, by: opts.by || 'cron' }); } catch (e) { console.warn('cron_status yozilmadi:', e); }
  return results;
}

module.exports = { makeCtx, runDaily, taskNews, taskAbsence, taskReminders, taskBackup, tz, dmy, hash36, normClass, b64u, getSettings };

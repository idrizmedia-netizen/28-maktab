'use strict';
/* api/seen.js: ota-onaning QR orqali «Ko'rdim» tasdig'i.
 *
 * Ochiq sahifa (platforma.html#x=...&k=<belgi>) shu manzilga POST yuboradi:
 *   { t: "<xatning yashirin belgisi (qt)>", act: "check" | "ack" }
 *   check -> { ok, state: "none" | "seen", at, canRsvp, rsvp }
 *   ack   -> tasdiqni letter_acks/<belgi> ga yozadi (bir xat uchun bitta yozuv), { ok, state: "seen", at }
 *   rsvp  -> { v: "yes" | "no", note } "ota-onani chaqirish" va "taklifnoma" xatlarida javob: kelaman / kela olmayman
 *            (javob ham "ko'rdim" hisoblanadi; oxirgi javob saqlanadi)
 *
 * Xavfsizlik:
 *  - belgi tasodifiy 10 belgili qator; faqat xat ro'yxatida (yoki oldingi tasdiqda) bor belgi qabul qilinadi;
 *  - javobda xat haqida hech qanday shaxsiy ma'lumot qaytarilmaydi (faqat holat va vaqt);
 *  - bitta IP dan 10 daqiqada 40 tadan ortiq so'rov qabul qilinmaydi;
 *  - yozishni faqat shu server bajaradi (Firestore qoidalarida letter_acks ga yozish yopiq).
 */
const crypto = require('crypto');
const { db, adminAuth, isAdminEmail, normPhone, tgApi, ORIGIN } = require('./_lib');
const { t: tr, normLang } = require('./_i18n');

const WINDOW_MS = 10 * 60 * 1000, MAX_REQ = 40;

function normClass(c) {
  c = String(c || '').trim(); if (!c) return c;
  const m = /^(\d{1,2})\s*-?\s*([A-Za-zА-Яа-яЎўҚқҒғҲҳ']+)$/.exec(c);
  return m ? m[1] + '-' + m[2].toUpperCase() : c;
}
function out(res, status, obj) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(obj));
}


/* ===== Sinf bo'yicha taklifnomalar (studiya): har bir o'quvchiga alohida belgi, QR orqali «Ko'rdim» =====
 * invite_tok/<belgi> = { mid, name, cls, meet:{...}, createdAt, seenAt, count }  (faqat server yozadi/o'qiydi)
 *   iv_issue  (admin, Bearer ID token) : { mid, meet, items:[{n,c}] } -> { items:[{n,c,t}] }  belgilar HMAC bilan barqaror
 *   iv_status (admin)                  : { mid } -> { items:[{t, seenAt, count}] }
 *   iv_check  (ochiq)                  : { t } -> { name, cls, meet, seen, at }
 *   iv_ack    (ochiq)                  : { t } -> «Ko'rdim» ni yozadi
 */
function ivClip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n); }
function ivSecret() { return process.env.PARENT_SECRET || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || ''; }
function ivToken(mid, n, c) { return crypto.createHmac('sha256', ivSecret()).update(mid + '|' + n + '|' + c).digest('hex').slice(0, 12); }
function ivMeet(m) {
  m = (m && typeof m === 'object') ? m : {};
  return {
    title: ivClip(m.title, 80), date: ivClip(m.date, 20), time: ivClip(m.time, 30), place: ivClip(m.place, 140),
    times: (Array.isArray(m.times) ? m.times : []).slice(0, 6).map((x) => ivClip(x, 80)).filter(Boolean),
    note: ivClip(m.note, 400), sg: ivClip(m.sg, 60),
  };
}
async function ivRate(req) {
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'x').split(',')[0].trim();
  const limRef = db().collection('parent_codes').doc('seen_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24));
  const now = Date.now();
  const ls = await limRef.get();
  let w = ls.exists ? ls.data() : {};
  if (!w.win || now - w.win > WINDOW_MS) w = { win: now, cnt: 0 };
  if ((w.cnt || 0) >= MAX_REQ) return false;
  await limRef.set({ win: w.win, cnt: (w.cnt || 0) + 1 });
  return true;
}
function nameKey(x) { return String(x || '').toLowerCase().replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); }
function ivText(lang, x) {
  const m = x.meet || {};
  const c = String(x.name || '') + (x.cls ? ', ' + tr(lang, 'cls_sfx', { c: x.cls }) : '');
  let s = tr(lang, 'ivt_head') + '\n\n' + tr(lang, 'ivt_line', { c }) + '\n';
  const when = [m.date, m.time].filter(Boolean).join(' · ');
  if (when) s += '\n' + tr(lang, 'ivt_when') + when;
  (m.times || []).forEach((v) => { s += '\n• ' + v; });
  if (m.place) s += '\n' + tr(lang, 'ivt_place') + m.place;
  if (m.note) s += '\n\n' + m.note;
  return s + '\n\n' + tr(lang, 'ivt_ask');
}
async function ivAdmin(req, res, b, act) {
  const m = /^Bearer (.+)$/.exec(String((req.headers && req.headers.authorization) || ''));
  if (!m) { out(res, 401, { error: 'unauthenticated' }); return; }
  let dec;
  try { dec = await adminAuth().verifyIdToken(m[1]); } catch (e) { out(res, 401, { error: 'invalid-token' }); return; }
  const email = String(dec.email || '').toLowerCase();
  if (!dec.email_verified || !(await isAdminEmail(email))) { out(res, 403, { error: 'permission-denied' }); return; }
  let role = 'owner', classes = [];
  const as = await db().collection('admins').doc(email).get();
  if (as.exists) { role = as.data().role || 'full'; classes = Array.isArray(as.data().classes) ? as.data().classes.map(normClass) : []; }
  if (['owner', 'full', 'homeroom'].indexOf(role) < 0) { out(res, 403, { error: 'role-denied' }); return; }
  const clsOk = (c) => role !== 'homeroom' || classes.indexOf(normClass(c)) >= 0;
  const tokQuery = (mid) => db().collection('invite_tok').where('mid', '==', mid).limit(400).get();

  if (act === 'iv_list') {
    const snap = await db().collection('invite_meets').get();
    const meets = [];
    snap.forEach((d) => { const x = d.data(); if (clsOk(x.cls || '')) meets.push(x); });
    meets.sort((p, q) => String(q.date || '').localeCompare(String(p.date || '')) || ((q.createdAt || 0) - (p.createdAt || 0)));
    const list = [];
    for (const x of meets.slice(0, 40)) {
      let total = 0, seen = 0, sent = 0;
      (await tokQuery(x.mid)).forEach((d) => { const y = d.data(); total++; if (y.seenAt) seen++; if (y.sentAt) sent++; });
      list.push({ mid: x.mid, cls: x.cls || '', date: x.date || '', dateTxt: (x.meet && x.meet.date) || '', time: (x.meet && x.meet.time) || '', title: (x.meet && x.meet.title) || '', total, seen, sent, createdAt: x.createdAt || 0 });
    }
    out(res, 200, { ok: true, meets: list });
    return;
  }

  const mid = ivClip(b.mid, 60).replace(/[^A-Za-z0-9_\-]/g, '');
  if (!mid) { out(res, 400, { error: 'mid' }); return; }

  if (act === 'iv_status') {
    const ms = await db().collection('invite_meets').doc(mid).get();
    if (ms.exists && !clsOk(ms.data().cls || '')) { out(res, 403, { error: 'class-denied' }); return; }
    const items = [];
    (await tokQuery(mid)).forEach((d) => {
      const x = d.data();
      if (!clsOk(x.cls || '')) return;
      items.push({ t: d.id, n: x.name || '', c: x.cls || '', seenAt: x.seenAt || 0, count: x.count || 0, via: x.via || '', sentAt: x.sentAt || 0, sendStatus: x.sendStatus || '' });
    });
    out(res, 200, { ok: true, items, meet: ms.exists ? (ms.data().meet || null) : null });
    return;
  }

  if (act === 'iv_delete') {
    if (role === 'homeroom') { out(res, 403, { error: 'role-denied' }); return; }
    const batch = db().batch();
    (await tokQuery(mid)).forEach((d) => batch.delete(d.ref));
    batch.delete(db().collection('invite_meets').doc(mid));
    await batch.commit();
    try { await db().collection('audit_log').add({ action: 'invite_deleted', details: { mid }, by: email, at: Date.now() }); } catch (e) { /* muhim emas */ }
    out(res, 200, { ok: true });
    return;
  }

  if (act === 'iv_send') {
    // Taklifnomani ota-onalarga Telegram bot orqali yuborish. only: 'unsent' (hali yuborilmaganlar) | 'unseen' (ko'rmaganlarga qayta)
    const only = b.only === 'unseen' ? 'unseen' : 'unsent';
    const rs = await db().collection('adminonly').doc('roster').get();
    const students = (rs.exists && rs.data() && rs.data().data && Array.isArray(rs.data().data.students)) ? rs.data().data.students : [];
    const docs = [];
    (await tokQuery(mid)).forEach((d) => { if (clsOk(d.data().cls || '')) docs.push(d); });
    const result = { ok: true, sent: 0, nolink: 0, nophone: 0, failed: 0, skipped: 0, items: [] };
    const work = async (d) => {
      const x = d.data(), now = Date.now();
      if (x.seenAt || (only === 'unsent' && x.sentAt)) { result.skipped++; return; }
      const nk = nameKey(x.name), ck = normClass(x.cls);
      const hit = students.filter((s) => nameKey(s.name) === nk && (!ck || !s.cls || normClass(s.cls) === ck))[0];
      const phone = hit ? normPhone(hit.phone) : '';
      let status = '', extra = {};
      if (phone.length !== 12) { status = 'nophone'; result.nophone++; }
      else {
        const link = await db().collection('telegram_links').doc(phone).get();
        const chatId = link.exists ? link.data().chatId : '';
        if (!chatId) { status = 'nolink'; result.nolink++; }
        else {
          const lang = normLang(link.data().lang);
          const r = await tgApi('sendMessage', { chat_id: chatId, text: ivText(lang, x),
            reply_markup: { inline_keyboard: [[{ text: tr(lang, 'btn_iv_seen'), callback_data: 'iv|' + d.id }], [{ text: tr(lang, 'btn_iv_open'), url: ORIGIN + '/platforma#iv=' + d.id }]] } });
          if (r && r.ok) { status = 'sent'; result.sent++; extra = { sentAt: now, sentPhone: phone, sentCount: (x.sentCount || 0) + 1 }; }
          else { status = 'failed'; result.failed++; extra = { sendErr: ivClip(r && r.description, 100) }; }
        }
      }
      try { await d.ref.update(Object.assign({ sendStatus: status, sendTryAt: now }, extra)); } catch (e) { console.warn('iv_send yozilmadi:', e); }
      result.items.push({ t: d.id, n: x.name || '', status });
    };
    for (let i = 0; i < docs.length; i += 8) await Promise.all(docs.slice(i, i + 8).map(work));
    try { await db().collection('audit_log').add({ action: 'invite_sent', details: { mid, only, sent: result.sent, nolink: result.nolink, nophone: result.nophone, failed: result.failed }, by: email, at: Date.now() }); } catch (e) { /* muhim emas */ }
    out(res, 200, result);
    return;
  }

  // iv_issue
  if (!ivSecret()) { out(res, 500, { error: 'secret' }); return; }
  const meet = ivMeet(b.meet);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.iso || '')) ? String(b.iso) : '';
  const src = (Array.isArray(b.items) ? b.items : []).slice(0, 80);
  const res2 = [], batch = db().batch(), now = Date.now();
  for (const it of src) {
    const n = ivClip(it && it.n, 80), c = ivClip(it && it.c, 20);
    if (!n) continue;
    if (!clsOk(c)) { out(res, 403, { error: 'class-denied' }); return; }
    const t = ivToken(mid, n, c);
    batch.set(db().collection('invite_tok').doc(t), { mid, name: n, cls: c, clsKey: normClass(c), meet, updatedAt: now }, { merge: true });
    res2.push({ n, c, t });
  }
  if (!res2.length) { out(res, 400, { error: 'items' }); return; }
  const mref = db().collection('invite_meets').doc(mid), mold = await mref.get();
  const mdoc = { mid, cls: res2[0].c, clsKey: normClass(res2[0].c), date: iso, meet, total: res2.length, updatedAt: now };
  if (!mold.exists) { mdoc.createdAt = now; mdoc.createdBy = email; }
  batch.set(mref, mdoc, { merge: true });
  await batch.commit();
  out(res, 200, { ok: true, items: res2 });
}
async function ivPublic(req, res, b, act) {
  const t = String(b.t || '').toLowerCase();
  if (!/^[a-z0-9]{8,16}$/.test(t)) { out(res, 400, { error: 'token' }); return; }
  if (!(await ivRate(req))) { out(res, 429, { error: 'limit' }); return; }
  const ref = db().collection('invite_tok').doc(t);
  const snap = await ref.get();
  if (!snap.exists) { out(res, 404, { error: 'topilmadi' }); return; }
  let d = snap.data(), now = Date.now();
  if (act === 'iv_ack') {
    if (!d.seenAt) {
      await ref.update({ seenAt: now, count: 1, via: 'qr' });
      d = Object.assign({}, d, { seenAt: now });
      try { await db().collection('audit_log').add({ action: 'parent_seen_invite', details: { name: d.name || '', cls: d.cls || '', date: (d.meet && d.meet.date) || '' }, by: 'qr', at: now }); } catch (e) { /* muhim emas */ }
    } else { try { await ref.update({ count: (d.count || 1) + 1, lastAt: now }); } catch (e) { /* muhim emas */ } }
  }
  out(res, 200, { ok: true, name: d.name || '', cls: d.cls || '', meet: d.meet || {}, seen: !!d.seenAt, at: d.seenAt || 0 });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { out(res, 405, { error: 'method' }); return; }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};
    if (['iv_issue', 'iv_status', 'iv_list', 'iv_delete', 'iv_send'].indexOf(b.act) >= 0) { await ivAdmin(req, res, b, b.act); return; }
    if (b.act === 'iv_check' || b.act === 'iv_ack') { await ivPublic(req, res, b, b.act); return; }
    const t = String(b.t || '').toLowerCase();
    const act = b.act === 'ack' ? 'ack' : (b.act === 'rsvp' ? 'rsvp' : 'check');
    const v = b.v === 'yes' ? 'yes' : (b.v === 'no' ? 'no' : '');
    const note = String(b.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 140);
    if (act === 'rsvp' && !v) { out(res, 400, { error: 'javob' }); return; }
    if (!/^[a-z0-9]{8,16}$/.test(t)) { out(res, 400, { error: 'token' }); return; }

    // IP bo'yicha cheklov
    const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'x').split(',')[0].trim();
    const limRef = db().collection('parent_codes').doc('seen_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24));
    const now = Date.now();
    const ls = await limRef.get();
    let w = ls.exists ? ls.data() : {};
    if (!w.win || now - w.win > WINDOW_MS) w = { win: now, cnt: 0 };
    if ((w.cnt || 0) >= MAX_REQ) { out(res, 429, { error: 'limit' }); return; }
    await limRef.set({ win: w.win, cnt: (w.cnt || 0) + 1 });

    // avval tasdiq yozilganmi (xat keyinroq arxivga o'tgan bo'lsa ham holat saqlanadi)
    const ref = db().collection('letter_acks').doc(t);
    const cur = await ref.get();
    const RSVP_KINDS = ['summon', 'invite'];
    if (cur.exists) {
      const c = cur.data();
      const canRsvp = RSVP_KINDS.indexOf(c.kind || '') >= 0;
      if (act === 'rsvp') {
        if (!canRsvp) { out(res, 400, { error: 'javob-emas' }); return; }
        await ref.update({ rsvp: v, rsvpAt: now, rsvpNote: v === 'no' ? note : '', rsvpCount: (c.rsvpCount || 0) + 1 });
        try { await db().collection('audit_log').add({ action: 'parent_rsvp', details: { name: c.name || '', cls: c.cls || '', date: c.date || '', answer: v }, by: 'qr', at: now }); } catch (e) { /* muhim emas */ }
        out(res, 200, { ok: true, state: 'seen', at: c.at, canRsvp, rsvp: v, rsvpAt: now });
        return;
      }
      if (act === 'ack') { try { await ref.update({ count: (c.count || 1) + 1, lastAt: now }); } catch (e) { /* muhim emas */ } }
      out(res, 200, { ok: true, state: 'seen', at: c.at, canRsvp, rsvp: c.rsvp || '', rsvpAt: c.rsvpAt || 0 });
      return;
    }

    // xatni belgi bo'yicha topamiz
    const snap = await db().collection('m28letters').doc('m28_log').get();
    const items = (snap.exists && snap.data() && Array.isArray(snap.data().items)) ? snap.data().items : [];
    const rec = items.filter((e) => e && e.qt === t)[0];
    if (!rec) { out(res, 404, { error: 'topilmadi' }); return; }

    const canRsvp = RSVP_KINDS.indexOf(String(rec.kind || '')) >= 0;
    if (act === 'check') { out(res, 200, { ok: true, state: 'none', canRsvp }); return; }
    if (act === 'rsvp' && !canRsvp) { out(res, 400, { error: 'javob-emas' }); return; }

    const doc = {
      name: String(rec.name || ''), cls: String(rec.cls || ''), clsKey: normClass(rec.cls),
      date: String(rec.date || ''), kind: String(rec.kind || ''), at: now, count: 1, via: 'qr',
    };
    if (act === 'rsvp') { doc.rsvp = v; doc.rsvpAt = now; doc.rsvpNote = v === 'no' ? note : ''; doc.rsvpCount = 1; }
    await ref.set(doc);
    try {
      await db().collection('audit_log').add({
        action: act === 'rsvp' ? 'parent_rsvp' : 'parent_seen_qr',
        details: Object.assign({ name: doc.name, cls: doc.cls, date: doc.date }, act === 'rsvp' ? { answer: v } : {}),
        by: 'qr',
        at: now,
      });
    } catch (e) { console.warn('audit yozilmadi:', e); }
    out(res, 200, { ok: true, state: 'seen', at: now, canRsvp, rsvp: act === 'rsvp' ? v : '', rsvpAt: act === 'rsvp' ? now : 0 });
  } catch (e) {
    console.error('seen xato:', e);
    out(res, 500, { error: 'server' });
  }
};

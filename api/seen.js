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
const { db, adminAuth, isAdminEmail } = require('./_lib');

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
    note: ivClip(m.note, 220), sg: ivClip(m.sg, 60),
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
  const mid = ivClip(b.mid, 60).replace(/[^A-Za-z0-9_\-]/g, '');
  if (!mid) { out(res, 400, { error: 'mid' }); return; }

  if (act === 'iv_status') {
    const snap = await db().collection('invite_tok').where('mid', '==', mid).limit(400).get();
    const items = [];
    snap.forEach((d) => { const x = d.data(); items.push({ t: d.id, seenAt: x.seenAt || 0, count: x.count || 0 }); });
    out(res, 200, { ok: true, items });
    return;
  }
  // iv_issue
  if (!ivSecret()) { out(res, 500, { error: 'secret' }); return; }
  const meet = ivMeet(b.meet);
  const src = (Array.isArray(b.items) ? b.items : []).slice(0, 80);
  const res2 = [], batch = db().batch();
  for (const it of src) {
    const n = ivClip(it && it.n, 80), c = ivClip(it && it.c, 20);
    if (!n) continue;
    if (role === 'homeroom' && classes.indexOf(normClass(c)) < 0) { out(res, 403, { error: 'class-denied' }); return; }
    const t = ivToken(mid, n, c);
    batch.set(db().collection('invite_tok').doc(t), { mid, name: n, cls: c, clsKey: normClass(c), meet, updatedAt: Date.now() }, { merge: true });
    res2.push({ n, c, t });
  }
  if (!res2.length) { out(res, 400, { error: 'items' }); return; }
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
      await ref.update({ seenAt: now, count: 1 });
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
    if (b.act === 'iv_issue' || b.act === 'iv_status') { await ivAdmin(req, res, b, b.act); return; }
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

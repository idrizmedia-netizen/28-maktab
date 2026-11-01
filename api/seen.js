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
const { db } = require('./_lib');

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

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { out(res, 405, { error: 'method' }); return; }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    b = b || {};
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

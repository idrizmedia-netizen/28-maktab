'use strict';
/* api/seen.js: ota-onaning QR orqali «Ko'rdim» tasdig'i.
 *
 * Ochiq sahifa (platforma.html#x=...&k=<belgi>) shu manzilga POST yuboradi:
 *   { t: "<xatning yashirin belgisi (qt)>", act: "check" | "ack" }
 *   check -> { ok, state: "none" | "seen", at }
 *   ack   -> tasdiqni letter_acks/<belgi> ga yozadi (bir xat uchun bitta yozuv), { ok, state: "seen", at }
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
    const act = b.act === 'ack' ? 'ack' : 'check';
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
    if (cur.exists) {
      if (act === 'ack') { try { await ref.update({ count: (cur.data().count || 1) + 1, lastAt: now }); } catch (e) { /* muhim emas */ } }
      out(res, 200, { ok: true, state: 'seen', at: cur.data().at });
      return;
    }

    // xatni belgi bo'yicha topamiz
    const snap = await db().collection('m28letters').doc('m28_log').get();
    const items = (snap.exists && snap.data() && Array.isArray(snap.data().items)) ? snap.data().items : [];
    const rec = items.filter((e) => e && e.qt === t)[0];
    if (!rec) { out(res, 404, { error: 'topilmadi' }); return; }

    if (act === 'check') { out(res, 200, { ok: true, state: 'none' }); return; }

    await ref.set({
      name: String(rec.name || ''), cls: String(rec.cls || ''), clsKey: normClass(rec.cls),
      date: String(rec.date || ''), kind: String(rec.kind || ''), at: now, count: 1, via: 'qr',
    });
    try {
      await db().collection('audit_log').add({
        action: 'parent_seen_qr',
        details: { name: String(rec.name || ''), cls: String(rec.cls || ''), date: String(rec.date || '') },
        by: 'qr',
        at: now,
      });
    } catch (e) { console.warn('audit yozilmadi:', e); }
    out(res, 200, { ok: true, state: 'seen', at: now });
  } catch (e) {
    console.error('seen xato:', e);
    out(res, 500, { error: 'server' });
  }
};

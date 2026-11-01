'use strict';
/* api/cron-daily.js: Vercel Cron kuniga bir marta chaqiradi (vercel.json -> crons; 05:00 UTC = Toshkent 10:00).
 * Bajaradi: rejalashtirilgan yangiliklar, davomat xabarlari, eslatmalar, dushanba kuni zaxira, har oyning 1-sanasida oylik hisobot.
 * Xavfsizlik: faqat "Authorization: Bearer <CRON_SECRET>" sarlavhali so'rov qabul qilinadi (CRON_SECRET ni Vercel'da o'zingiz kiritasiz). */
const crypto = require('crypto');
const T = require('./_tasks');

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET || '';
  const auth = String((req.headers && req.headers.authorization) || '');
  if (!secret || !same(auth, 'Bearer ' + secret)) { res.status(401).json({ ok: false, error: 'Ruxsat yo\'q' }); return; }
  try {
    const ctx = T.makeCtx();
    const results = await T.runDaily(ctx, { by: 'cron' });
    if (T.tz(ctx.now).day === 1) {
      // oylik hisobot: mavjud funksiyani shu maxfiy kalit bilan chaqiramiz
      const out = { statusCode: 0, body: null };
      const fake = { status(c) { out.statusCode = c; return this; }, setHeader() { return this; }, json(o) { out.body = o; return this; }, send(b) { out.body = b; return this; }, end() { return this; } };
      try { await require('./monthly-report')({ method: 'GET', headers: { authorization: 'Bearer ' + secret }, query: {} }, fake); } catch (e) { out.body = { error: String(e && e.message || e) }; }
      results.push({ task: 'monthly', status: out.statusCode, result: out.body });
    }
    res.status(200).json({ ok: true, results });
  } catch (e) {
    console.error('cron-daily xato:', e);
    res.status(500).json({ ok: false, error: 'server' });
  }
};

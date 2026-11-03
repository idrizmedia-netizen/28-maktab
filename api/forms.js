/* 28-maktab: sayt formalari uchun bitta funksiya (Vercel bepul tarifidagi 12 ta funksiya chegarasi uchun).
   /api/forms?a=appeal  — «Direktorga murojaat» formasi (api/_appeal.js)
   /api/forms?a=eng     — g'olib o'quvchilar ota-onasiga tabrik (api/_engnotify.js) */
const appeal = require('./_appeal.js');
const eng = require('./_engnotify.js');

module.exports = async function (req, res) {
  let a = req.query && req.query.a;
  if (!a) { try { a = new URL(req.url, 'http://x').searchParams.get('a'); } catch (e) { a = ''; } }
  if (a === 'appeal') return appeal(req, res);
  if (a === 'eng') return eng(req, res);
  res.status(404).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify({ ok: false, error: 'Noma’lum so‘rov' }));
};

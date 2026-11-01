'use strict';
/* api/run-task.js: platformadagi «Hozir sinash / Hozir yuborish» tugmalari uchun.
 * Faqat asosiy admin va to'liq adminlar (Firebase kirish tokeni bilan). So'rov: { idToken, task, dry }
 * task: reminders | absence | backup | news. dry=true bo'lsa, hech narsa yuborilmaydi, faqat nechta yuborilishi hisoblanadi. */
const L = require('./_lib');
const T = require('./_tasks');

function reply(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.send(JSON.stringify(obj)); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Faqat POST' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const idToken = String(body.idToken || ''), task = String(body.task || ''), dry = body.dry === true;
  if (idToken.length < 100 || ['reminders', 'absence', 'backup', 'news'].indexOf(task) < 0) return reply(res, 400, { ok: false, error: "So'rov noto'g'ri" });
  try {
    const lr = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + L.API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    if (!lr.ok) return reply(res, 401, { ok: false, error: 'Kirish tasdiqlanmadi. Platformadan qayta kiring.' });
    const user = ((await lr.json()).users || [])[0];
    const email = user && user.email && user.emailVerified ? String(user.email).toLowerCase() : '';
    if (!email) return reply(res, 401, { ok: false, error: 'Email tasdiqlanmagan' });
    if (email !== L.OWNER) {
      const a = await L.getDoc('admins/' + encodeURIComponent(email), { token: idToken });
      if (!a || (a.role || 'full') !== 'full') return reply(res, 403, { ok: false, error: "Sizda bu amalni bajarish huquqi yo'q" });
    }
    const ctx = T.makeCtx();
    const fn = { reminders: T.taskReminders, absence: T.taskAbsence, backup: T.taskBackup, news: T.taskNews }[task];
    const result = await fn(ctx, { dry, force: true });
    return reply(res, 200, { ok: true, result });
  } catch (e) {
    console.error('run-task xato:', e);
    return reply(res, 500, { ok: false, error: 'Server xatosi' });
  }
};

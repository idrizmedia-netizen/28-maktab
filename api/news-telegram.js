/* 28-maktab: yangilikni Telegram kanalga joylash.
   Platformadagi admin "E'lon qilish" ni bosganda chaqiriladi.
   Maxfiy kalit KODDA YOZILMAYDI: Vercel -> Settings -> Environment Variables -> TELEGRAM_BOT_TOKEN
   Kanal nomi platformada: Maktab yangiliklari -> Aloqa ma'lumotlari -> "Telegram kanal (@nom)". */
const L = require('./_lib.js');
const esc = L.esc;

function reply(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(obj)); }

module.exports = async function (req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Faqat POST' });
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return reply(res, 500, { ok: false, error: 'Serverda TELEGRAM_BOT_TOKEN sozlanmagan' });
  const body = typeof req.body === 'string' ? (function () { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const id = String(body.id || ''), idToken = String(body.idToken || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || idToken.length < 100) return reply(res, 400, { ok: false, error: "So'rov noto'g'ri" });

  try {
    // 1) kim ekanini tekshirish (Firebase kirish tokeni)
    const lr = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + L.API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: idToken }) });
    if (!lr.ok) return reply(res, 401, { ok: false, error: 'Kirish tasdiqlanmadi. Platformadan qayta kiring.' });
    const user = ((await lr.json()).users || [])[0];
    const email = user && user.email && user.emailVerified ? String(user.email).toLowerCase() : '';
    if (!email) return reply(res, 401, { ok: false, error: 'Email tasdiqlanmagan' });

    // 2) faqat asosiy admin va to'liq adminlar
    if (email !== L.OWNER) {
      const a = await L.getDoc('admins/' + encodeURIComponent(email), { token: idToken });
      if (!a || (a.role || 'full') !== 'full') return reply(res, 403, { ok: false, error: "Sizda yuborish huquqi yo'q" });
    }

    // 3) kanal
    const info = await L.getDoc('publicinfo/maktab', { mask: ['tgChannel'] });
    const ch = info && String(info.tgChannel || '').trim();
    if (!ch || !/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,})$/.test(ch)) return reply(res, 400, { ok: false, error: "Telegram kanal ko'rsatilmagan. «Aloqa ma'lumotlari» da @kanal_nomi ni yozing." });

    // 4) yangilik (adminning o'z huquqi bilan o'qiladi)
    const n = await L.getDoc('news/' + id, { token: idToken });
    if (!n) return reply(res, 404, { ok: false, error: 'Yangilik topilmadi' });
    if (n.status !== 'published') return reply(res, 400, { ok: false, error: "Avval yangilikni e'lon qiling" });

    // 5) xabar
    const link = L.ORIGIN + '/yangilik/' + id;
    const caption = '<b>' + esc(n.title) + '</b>\n\n' + esc(L.plain(n.body, 550)) + '\n\n' +
      (n.video && /^https?:\/\//.test(n.video) ? '▶ <a href="' + esc(n.video) + '">Video</a>\n' : '') + '🔗 <a href="' + esc(link) + '">Batafsil o\'qish</a>';
    const nImgs = Array.isArray(n.imgs) ? n.imgs.length : (n.img ? 1 : 0);
    const call = async function (method, payload) {
      const r = await fetch('https://api.telegram.org/bot' + botToken + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
      return j.result;
    };
    const photo = function (i) { return L.ORIGIN + '/api/rasm?id=' + encodeURIComponent(id) + '&i=' + i; };
    let result;
    if (nImgs >= 2) {
      const media = [];
      for (let i = 0; i < Math.min(nImgs, 10); i++) media.push(i === 0 ? { type: 'photo', media: photo(i), caption: caption, parse_mode: 'HTML' } : { type: 'photo', media: photo(i) });
      result = await call('sendMediaGroup', { chat_id: ch, media: media });
    } else if (nImgs === 1) {
      result = await call('sendPhoto', { chat_id: ch, photo: photo(0), caption: caption, parse_mode: 'HTML' });
    } else {
      result = await call('sendMessage', { chat_id: ch, text: caption, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    }
    const first = Array.isArray(result) ? result[0] : result;
    return reply(res, 200, { ok: true, channel: ch, message_id: first && first.message_id });
  } catch (e) {
    let msg = (e && e.message) || 'Xato';
    if (/chat not found/i.test(msg)) msg = 'Kanal topilmadi. Nomini tekshiring va botni kanalga ADMIN qilib qo\'shing.';
    else if (/not enough rights|administrator|forbidden/i.test(msg)) msg = "Bot kanalda yozish huquqiga ega emas. Botni kanalga admin qiling («Xabar yuborish» ruxsati bilan).";
    return reply(res, 502, { ok: false, error: msg });
  }
};

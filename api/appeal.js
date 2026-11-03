/* 28-maktab: «Direktorga murojaat» formasi. Sayt (index.html) shu yerga POST qiladi.
   Murojaat Telegram orqali «hisobot raqami»ga (Platforma → Sozlamalar → Baza) ulangan botga yuboriladi va nusxasi Firestore «appeals» to'plamiga saqlanadi.
   Spamdan himoya: yashirin maydon, minimal to'ldirish vaqti, IP bo'yicha chegara. Kerak: TELEGRAM_BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT. */
const L = require('./_lib.js');
const A = require('./_admin.js');

function reply(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(obj)); }
const eh = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TOPICS = ['Taklif', 'Savol', 'Shikoyat', 'Minnatdorchilik', 'Boshqa'];
const hits = global.__appealHits || (global.__appealHits = new Map());

module.exports = async function (req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Faqat POST' });
  const body = typeof req.body === 'string' ? (function () { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  if (body.hp) return reply(res, 200, { ok: true });                                  // bot: jim "muvaffaqiyat"
  const name = String(body.name || '').trim().slice(0, 80), msg = String(body.msg || '').trim().slice(0, 1500);
  const cls = String(body.cls || '').trim().slice(0, 10), phone = String(body.phone || '').replace(/[^\d+\s()-]/g, '').trim().slice(0, 20);
  const topic = TOPICS.indexOf(body.topic) >= 0 ? body.topic : 'Boshqa';
  if (name.length < 2) return reply(res, 400, { ok: false, error: 'Ismingizni yozing' });
  if (msg.length < 10) return reply(res, 400, { ok: false, error: 'Murojaat matni juda qisqa' });
  if (phone && phone.replace(/\D/g, '').length < 9) return reply(res, 400, { ok: false, error: "Telefon raqami noto'g'ri" });
  if (Number(body.t) < 3000) return reply(res, 429, { ok: false, error: 'Iltimos, murojaatni diqqat bilan to‘ldiring va qayta yuboring' });
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'x').trim();
  const now = Date.now(), arr = (hits.get(ip) || []).filter(function (t) { return now - t < 600000; });
  if (arr.length >= 3) return reply(res, 429, { ok: false, error: "Juda ko'p murojaat yuborildi. Birozdan so'ng urinib ko'ring" });
  arr.push(now); hits.set(ip, arr);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !A.creds()) return reply(res, 500, { ok: false, error: 'Murojaat qabul qilish vaqtincha ishlamayapti. Iltimos, telefon orqali bog‘laning.' });
  try {
    const id = 'ap_' + now.toString(36) + Math.random().toString(36).slice(2, 7);
    try { await A.setDoc('appeals/' + id, { name: name, phone: phone, cls: cls, topic: topic, msg: msg, at: now }); } catch (e) { /* nusxa majburiy emas */ }
    const rs = await A.getDoc('adminonly/roster');
    const rp = L.normPhone((rs && rs.data && rs.data.reportPhone) || '');
    const lk = rp ? await A.getDoc('telegram_links/' + rp) : null;
    const chat = lk && lk.chatId ? String(lk.chatId) : '';
    if (!chat) return reply(res, 500, { ok: false, error: 'Murojaat qabul qilish vaqtincha ishlamayapti. Iltimos, telefon orqali bog‘laning.' });
    const text = '📨 <b>Direktorga murojaat</b>\n\n<b>Mavzu:</b> ' + eh(topic) + '\n<b>Ism:</b> ' + eh(name) + (phone ? '\n<b>Telefon:</b> ' + eh(phone) : '') + (cls ? '\n<b>Sinf:</b> ' + eh(cls) : '') + '\n\n' + eh(msg);
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true }) });
    const j = await r.json().catch(function () { return {}; });
    if (!j.ok) return reply(res, 502, { ok: false, error: 'Murojaat yuborilmadi. Birozdan so‘ng qayta urinib ko‘ring.' });
    return reply(res, 200, { ok: true });
  } catch (e) {
    console.error('appeal xato:', e);
    return reply(res, 500, { ok: false, error: 'Server xatosi. Birozdan so‘ng qayta urinib ko‘ring.' });
  }
};

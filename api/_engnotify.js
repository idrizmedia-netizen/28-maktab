/* 28-maktab: "Eng yaxshi o'quvchi" e'lon qilinganda g'olib o'quvchilarning ota-onasiga Telegramda tabrik yuboradi.
   Platformadan «Saytda e'lon qilish» paytida (ota-onalarga tabrik belgisi yoqilgan bo'lsa) chaqiriladi.
   Kerak: TELEGRAM_BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT (boshqa funksiyalardagi kabi). Bir xabar ikki marta yuborilmaydi. */
const L = require('./_lib.js');
const A = require('./_admin.js');

function reply(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(obj)); }
class Fail extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const nk = (s) => String(s || '').toLowerCase().replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim();
const nc = (s) => String(s || '').toLowerCase().replace(/sinf/g, '').replace(/[^a-z0-9а-яё]/g, '');
const eh = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async function (req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Faqat POST' });
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return reply(res, 500, { ok: false, error: 'Serverda TELEGRAM_BOT_TOKEN sozlanmagan' });
  const body = typeof req.body === 'string' ? (function () { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const id = String(body.id || ''), idToken = String(body.idToken || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || idToken.length < 100) return reply(res, 400, { ok: false, error: "So'rov noto'g'ri" });
  try {
    const lr = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + L.API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: idToken }) });
    if (!lr.ok) throw new Fail(401, 'Kirish tasdiqlanmadi. Platformadan qayta kiring.');
    const user = ((await lr.json()).users || [])[0];
    const email = user && user.email && user.emailVerified ? String(user.email).toLowerCase() : '';
    if (!email) throw new Fail(401, 'Email tasdiqlanmagan');
    let role = 'owner';
    if (email !== L.OWNER) {
      const a = await L.getDoc('admins/' + encodeURIComponent(email), { token: idToken });
      role = a ? (a.role || 'full') : '';
      if (role !== 'full' && role !== 'news') throw new Fail(403, "Sizda yuborish huquqi yo'q");
    }
    const n = await L.getDoc('news/' + id, { token: idToken });
    if (!n || n.status !== 'published' || !n.eng || !Array.isArray(n.eng.w)) throw new Fail(404, "G'oliblar e'loni topilmadi");
    if (role === 'news' && String(n.by || '').toLowerCase() !== email) throw new Fail(403, "Faqat o'z e'loningiz uchun yuborishingiz mumkin");
    if (!A.creds()) throw new Fail(500, 'Serverda Firebase Admin kaliti sozlanmagan');

    const rs = await A.getDoc('adminonly/roster');
    const students = ((rs && rs.data && rs.data.students) || []).filter(Boolean);
    const link = L.ORIGIN + '/yangilik/' + id;
    const out = { ok: true, sent: 0, noPhone: 0, noLink: 0, already: 0 };
    for (const w of n.eng.w) {
      if (!w || w.r === 't' || !w.n) continue;
      const hit = students.filter((s) => nk(s.name) === nk(w.n) && (!w.c || !s.cls || nc(s.cls) === nc(w.c)))[0];
      const phone = hit ? L.normPhone(hit.phone) : '';
      if (!phone) { out.noPhone++; continue; }
      const lk = await A.getDoc('telegram_links/' + phone);
      const chat = lk && lk.chatId ? String(lk.chatId) : '';
      if (!chat) { out.noLink++; continue; }
      const key = 'eng_' + id + '_' + phone;
      if (await A.getDoc('eng_notified/' + key)) { out.already++; continue; }
      const per = String(n.eng.per || ''), yr = String(n.eng.yr || '');
      const text = lk.lang === 'ru'
        ? '🏅 <b>Поздравляем!</b>\n\nВаш ребёнок <b>' + eh(hit.name) + '</b> признан <b>лучшим учеником</b> школы № 28 (' + eh(per) + ', ' + eh(yr) + ' уч. год).\n\nПодробнее: ' + link
        : '🏅 <b>Tabriklaymiz!</b>\n\nFarzandingiz <b>' + eh(hit.name) + '</b> 28-maktabning <b>eng yaxshi o‘quvchisi</b> deb topildi (' + eh(per) + ', ' + eh(yr) + ' o‘quv yili).\n\nBatafsil: ' + link;
      const r = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { out.sent++; try { await A.setDoc('eng_notified/' + key, { at: Date.now(), by: email }); } catch (e) { /* belgi majburiy emas */ } }
    }
    return reply(res, 200, out);
  } catch (e) {
    if (e instanceof Fail) return reply(res, e.code, { ok: false, error: e.message });
    console.error('eng-notify xato:', e);
    return reply(res, 500, { ok: false, error: 'Server xatosi' });
  }
};

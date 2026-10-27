/* 28-maktab: yangilikni Telegram kanalga joylash va tahrirlash.
   Platformadagi admin "E'lon qilish" ni bosganda (action: "post") yoki tahrirdan keyin (action: "edit") chaqiriladi.
   Maxfiy kalit KODDA YOZILMAYDI: Vercel -> Settings -> Environment Variables -> TELEGRAM_BOT_TOKEN
   Kanal nomi platformada: Maktab yangiliklari -> Aloqa -> "Telegram kanal nomi (@nom)". */
const crypto = require('crypto');
const L = require('./_lib.js');
const esc = L.esc;

function reply(res, code, obj) { res.status(code).setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(obj)); }
class Fail extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function imgCount(n) { return Array.isArray(n.imgs) ? n.imgs.length : (n.img ? 1 : 0); }
function imgSig(n) {
  const list = Array.isArray(n.imgs) ? n.imgs : (n.img ? [n.img] : []);
  return crypto.createHash('md5').update(list.join('|')).digest('hex').slice(0, 10);
}
function buildCaption(n, id) {
  const vids = L.videosOf(n);
  return '<b>' + esc(n.title) + '</b>\n\n' + esc(L.plain(n.body, 550)) + '\n\n' +
    vids.map(function (u, i) { return '▶ <a href="' + esc(u) + '">Video' + (vids.length > 1 ? ' ' + (i + 1) : '') + '</a>\n'; }).join('') +
    '🔗 <a href="' + esc(L.ORIGIN + '/yangilik/' + id) + '">Batafsil o\'qish</a>';
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'Faqat POST' });
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return reply(res, 500, { ok: false, error: 'Serverda TELEGRAM_BOT_TOKEN sozlanmagan' });
  const body = typeof req.body === 'string' ? (function () { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
  const id = String(body.id || ''), idToken = String(body.idToken || ''), action = body.action === 'edit' ? 'edit' : 'post';
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || idToken.length < 100) return reply(res, 400, { ok: false, error: "So'rov noto'g'ri" });

  const call = async function (method, payload) {
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || 'Telegram xatosi');
    return j.result;
  };

  try {
    // 1) kim ekanini tekshirish (Firebase kirish tokeni)
    const lr = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + L.API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: idToken }) });
    if (!lr.ok) throw new Fail(401, 'Kirish tasdiqlanmadi. Platformadan qayta kiring.');
    const user = ((await lr.json()).users || [])[0];
    const email = user && user.email && user.emailVerified ? String(user.email).toLowerCase() : '';
    if (!email) throw new Fail(401, 'Email tasdiqlanmagan');
    // 2) asosiy admin, to'liq adminlar va yangilik yozuvchilar (ular faqat o'z yangiliklarini yuboradi)
    let role = 'owner';
    if (email !== L.OWNER) {
      const a = await L.getDoc('admins/' + encodeURIComponent(email), { token: idToken });
      role = a ? (a.role || 'full') : '';
      if (role !== 'full' && role !== 'news') throw new Fail(403, "Sizda yuborish huquqi yo'q");
    }
    // 3) yangilik (adminning o'z huquqi bilan o'qiladi)
    const n = await L.getDoc('news/' + id, { token: idToken });
    if (!n) throw new Fail(404, 'Yangilik topilmadi');
    if (role === 'news' && String(n.by || '').toLowerCase() !== email) throw new Fail(403, "Faqat o'z yangiligingizni Telegramga yuborishingiz mumkin");
    if (n.status !== 'published') throw new Fail(400, "Avval yangilikni e'lon qiling");

    const caption = buildCaption(n, id), nImgs = imgCount(n), sig = imgSig(n);
    const photo = function (i) { return L.ORIGIN + '/api/rasm?id=' + encodeURIComponent(id) + '&i=' + i + '&v=' + sig; };
    const kindNow = nImgs >= 2 ? 'group' : (nImgs === 1 ? 'photo' : 'text');

    // yangi xabar yuborish
    const send = async function (ch) {
      let result, ids;
      if (kindNow === 'group') {
        const media = [];
        for (let i = 0; i < Math.min(nImgs, 10); i++) media.push(i === 0 ? { type: 'photo', media: photo(i), caption: caption, parse_mode: 'HTML' } : { type: 'photo', media: photo(i) });
        result = await call('sendMediaGroup', { chat_id: ch, media: media }); ids = result.map(function (m) { return m.message_id; });
      } else if (kindNow === 'photo') {
        result = await call('sendPhoto', { chat_id: ch, photo: photo(0), caption: caption, parse_mode: 'HTML' }); ids = [result.message_id];
      } else {
        result = await call('sendMessage', { chat_id: ch, text: caption, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); ids = [result.message_id];
      }
      return { chat: ch, ids: ids, kind: kindNow, n: Math.min(nImgs, 10), sig: sig, at: new Date().toISOString() };
    };
    const channel = async function () {
      const info = await L.getDoc('publicinfo/maktab', { mask: ['tgChannel'] });
      const ch = info && String(info.tgChannel || '').trim();
      if (!ch || !/^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,})$/.test(ch)) throw new Fail(400, "Telegram kanal ko'rsatilmagan. «Aloqa ma'lumotlari» da @kanal_nomi ni yozing.");
      return ch;
    };

    if (action === 'post') {
      const tg = await send(await channel());
      return reply(res, 200, { ok: true, mode: 'posted', tg: tg });
    }

    // action === 'edit'
    const old = n.tg;
    if (!old || !Array.isArray(old.ids) || !old.ids.length || !old.chat) throw new Fail(409, "Bu yangilik Telegram'ga bu usulda yuborilmagan, tahrirlash uchun xabar raqami yo'q. Uni qayta yuboring.");
    const repost = async function () {
      for (let i = 0; i < old.ids.length; i++) { try { await call('deleteMessage', { chat_id: old.chat, message_id: old.ids[i] }); } catch (e) { /* eski xabar allaqachon o'chirilgan bo'lishi mumkin */ } }
      return reply(res, 200, { ok: true, mode: 'reposted', tg: await send(old.chat) });
    };
    // tuzilma o'zgargan bo'lsa (masalan, rasm qo'shilgan/olib tashlangan) in-place tahrirlab bo'lmaydi
    if (old.kind !== kindNow || (kindNow === 'group' && old.ids.length !== Math.min(nImgs, 10))) return await repost();
    const tolerant = async function (fn) { try { await fn(); } catch (e) { if (!/not modified/i.test(e.message)) throw e; } };
    try {
      const changedImgs = old.sig !== sig;
      if (kindNow === 'text') {
        await tolerant(function () { return call('editMessageText', { chat_id: old.chat, message_id: old.ids[0], text: caption, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }); });
      } else if (!changedImgs) {
        await tolerant(function () { return call('editMessageCaption', { chat_id: old.chat, message_id: old.ids[0], caption: caption, parse_mode: 'HTML' }); });
      } else {
        for (let i = 0; i < old.ids.length; i++) {
          const media = i === 0 ? { type: 'photo', media: photo(i), caption: caption, parse_mode: 'HTML' } : { type: 'photo', media: photo(i) };
          await tolerant(function () { return call('editMessageMedia', { chat_id: old.chat, message_id: old.ids[i], media: media }); });
        }
      }
    } catch (e) {
      if (/not found|can't be edited|MESSAGE_ID_INVALID|message to edit/i.test(e.message)) return await repost();
      throw e;
    }
    return reply(res, 200, { ok: true, mode: 'edited', tg: Object.assign({}, old, { sig: sig, n: Math.min(nImgs, 10), at: new Date().toISOString() }) });
  } catch (e) {
    if (e instanceof Fail) return reply(res, e.code, { ok: false, error: e.message });
    let msg = (e && e.message) || 'Xato';
    if (/chat not found/i.test(msg)) msg = "Kanal topilmadi. Nomini tekshiring va botni kanalga ADMIN qilib qo'shing.";
    else if (/not enough rights|administrator|forbidden/i.test(msg)) msg = "Bot kanalda yozish huquqiga ega emas. Botni kanalga admin qiling («Xabar yuborish» va «Xabarlarni tahrirlash» ruxsatlari bilan).";
    return reply(res, 502, { ok: false, error: msg });
  }
};

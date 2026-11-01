/**
 * Vercel serverless funksiya: Telegram'dan keladigan yangilanishlarni qabul
 * qiladi. Ota-ona botga /start bosganda va telefon raqamini ulashganda shu
 * yerga keladi.
 *
 * Sozlash: Vercel loyihasida quyidagi muhit o'zgaruvchilarini kiriting
 * (Project Settings → Environment Variables):
 *   TELEGRAM_TOKEN               — @BotFather bergan bot tokeni
 *   TELEGRAM_WEBHOOK_SECRET      — o'zingiz o'ylab topgan tasodifiy matn
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase xizmat hisobi kaliti (JSON, bir qator)
 */
const L = require('./_lib');
const { db, normPhone, tgApi } = L;
const { t, normLang } = require('./_i18n');

/* Majburiy kanalga obuna. Kanal: Vercel'da REQUIRED_CHANNEL (@nom), bo'sh bo'lsa platformadagi «Telegram kanal nomi».
   Bot shu kanalda ADMIN bo'lishi shart. Kanal sozlanmagan bo'lsa yoki Telegram tekshirishga ruxsat bermasa, ota-ona bloklanmaydi. */
async function reqChannel() {
  let c = String(process.env.REQUIRED_CHANNEL || '').trim();
  if (!c) { try { const d = await db().collection('publicinfo').doc('maktab').get(); c = String((d.exists && d.data().tgChannel) || '').trim(); } catch (e) { c = ''; } }
  c = c.replace(/^https?:\/\/t\.me\//i, '').replace(/\/+$/, '');
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(c)) c = '@' + c;
  return /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-100\d{5,})$/.test(c) ? c : '';
}
async function isSubscribed(ch, userId) {   // false faqat aniq "obuna emas" bo'lganda
  if (!ch) return true;
  const j = await tgApi('getChatMember', { chat_id: ch, user_id: userId });
  if (!j || !j.ok) { console.error('getChatMember xato:', j && j.description); return true; }
  const st = j.result && j.result.status;
  if (st === 'creator' || st === 'administrator' || st === 'member') return true;
  if (st === 'restricted') return !!j.result.is_member;
  return false;
}
/* ---------- til (o'zbek / rus) ---------- */
async function getLang(chatId) {
  try { const s = await db().collection('tg_chats').doc(String(chatId)).get(); const l = s.exists ? s.data().lang : null; return l === 'ru' || l === 'uz' ? l : null; } catch (e) { return null; }
}
async function linkByChat(chatId) {
  const q = await db().collection('telegram_links').where('chatId', '==', chatId).limit(1).get();
  return q.empty ? null : q.docs[0];
}
async function setLang(chatId, lang) {
  lang = normLang(lang);
  await db().collection('tg_chats').doc(String(chatId)).set({ lang, at: Date.now() });
  try {
    const q = await db().collection('telegram_links').where('chatId', '==', chatId).limit(5).get();
    for (const d of q.docs) await d.ref.update({ lang });
  } catch (e) { console.error('til yangilanmadi:', e); }
  return lang;
}
function langMarkup() { return { inline_keyboard: [[{ text: t('uz', 'btn_uz'), callback_data: 'lang|uz' }, { text: t('ru', 'btn_ru'), callback_data: 'lang|ru' }]] }; }
function subMarkup(ch, lang) {
  const rows = [];
  if (ch.charAt(0) === '@') rows.push([{ text: t(lang, 'btn_channel'), url: 'https://t.me/' + ch.slice(1) }]);
  rows.push([{ text: t(lang, 'btn_check'), callback_data: 'sub' }]);
  return { inline_keyboard: rows };
}
function contactMarkup(lang) { return { keyboard: [[{ text: t(lang, 'btn_contact'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }; }
/* /start dan keyingi asosiy qadam: kanalga obuna so'raladi yoki raqam ulash tugmasi chiqadi */
async function startFlow(chatId, userId, lang) {
  const ch = await reqChannel();
  if (!(await isSubscribed(ch, userId))) await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'welcome_sub', { ch }), reply_markup: subMarkup(ch, lang) });
  else await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'welcome_phone'), reply_markup: contactMarkup(lang) });
}

/**
 * "✅ Tanishdim" tugmasi bosilganda: notify_log yozuviga ackAt qo'shadi va
 * faollik jurnaliga yozadi. Tugma ma'lumoti: 'ack|<notify_log id>' (yangi)
 * yoki 'ack|<telefon>|<sana>' (eski xabarlar uchun).
 */
async function handleCallback(cq) {
  const answer = (text, alert) => tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: text || '', show_alert: !!alert });
  const data = String(cq.data || '');
  const chatId = cq.message && cq.message.chat && cq.message.chat.id;
  const parts = data.split('|');
  if (parts[0] === 'lang' && chatId) {
    const lang = await setLang(chatId, parts[1]);
    await answer(t(lang, 'lang_set'));
    let linked = null;
    try { linked = await linkByChat(chatId); } catch (e) { console.error('telegram_links tekshiruvi xato:', e); }
    if (linked) await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'ready'), reply_markup: { remove_keyboard: true } });
    else await startFlow(chatId, cq.from && cq.from.id, lang);
    return;
  }
  const chatLang = (chatId && await getLang(chatId)) || 'uz';
  if (parts[0] === 'sub' && chatId) {
    const ch = await reqChannel();
    if (!(await isSubscribed(ch, cq.from && cq.from.id))) { await answer(t(chatLang, 'toast_not_sub'), true); return; }
    await answer(t(chatLang, 'toast_sub_ok'));
    /* Firestore ishlamasa ham tugma yuboriladi (avval shu yerda bot jim qolardi) */
    let linked = false;
    try { linked = !!(await linkByChat(chatId)); }
    catch (e) { console.error('telegram_links tekshiruvi xato:', e); }
    if (!linked) await tgApi('sendMessage', { chat_id: chatId, text: t(chatLang, 'sub_ok_phone'), reply_markup: contactMarkup(chatLang) });
    else await tgApi('sendMessage', { chat_id: chatId, text: t(chatLang, 'ready'), reply_markup: { remove_keyboard: true } });
    return;
  }
  if (parts[0] !== 'ack' || !chatId) { await answer(); return; }

  let ref = null, snap = null;
  if (parts.length === 2) {
    ref = db().collection('notify_log').doc(parts[1]);
    snap = await ref.get();
  } else if (parts.length >= 3) {
    const q = await db().collection('notify_log')
      .where('phone', '==', parts[1]).where('date', '==', parts.slice(2).join('|')).get();
    const docs = q.docs.sort((a, b) => (a.data().sentAt || 0) - (b.data().sentAt || 0));
    const open = docs.filter((d) => !d.data().ackAt)[0] || docs[docs.length - 1];
    if (open) { ref = open.ref; snap = open; }
  }
  if (!snap || !snap.exists) { await answer(t(chatLang, 'ack_notfound')); return; }
  const rec = snap.data();

  // Faqat shu raqamga ulangan Telegram hisobi tasdiqlay oladi
  const link = await db().collection('telegram_links').doc(String(rec.phone || '')).get();
  if (!link.exists || String(link.data().chatId) !== String(chatId)) { await answer(t(chatLang, 'ack_denied')); return; }
  const lang = normLang(link.data().lang || chatLang);

  if (rec.ackAt) { await answer(t(lang, 'ack_already')); return; }
  await ref.update({ ackAt: Date.now(), ackChatId: chatId });
  try {
    await db().collection('audit_log').add({
      action: 'parent_ack',
      details: { name: rec.name || '', cls: rec.cls || '', date: rec.date || '' },
      by: 'telegram-bot',
      at: Date.now(),
    });
  } catch (e) { console.warn('audit yozilmadi:', e); }
  await answer(t(lang, 'ack_thanks'));
  if (cq.message && cq.message.message_id) {
    await tgApi('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'btn_ack_done'), callback_data: 'noop' }]] },
    });
  }
}

/* Tekshiruv sahifasi: brauzerda https://28maktab.uz/api/telegram-webhook ni oching (maxfiy kalitlar ko'rsatilmaydi) */
async function diag(res) {
  const out = { vaqt: new Date().toISOString(), tokenlar: {}, 'webhook ishlatadigan token': process.env.TELEGRAM_TOKEN ? 'TELEGRAM_TOKEN' : (process.env.TELEGRAM_BOT_TOKEN ? 'TELEGRAM_BOT_TOKEN' : 'YOQ'),
    'TELEGRAM_WEBHOOK_SECRET': process.env.TELEGRAM_WEBHOOK_SECRET ? "o'rnatilgan (setWebhook da secret_token shunga teng bo'lishi shart)" : "o'rnatilmagan", 'REQUIRED_CHANNEL': process.env.REQUIRED_CHANNEL || "(bo'sh: platformadagi Telegram kanal nomi olinadi)" };
  for (const n of ['TELEGRAM_TOKEN', 'TELEGRAM_BOT_TOKEN']) {
    const t = process.env[n]; if (!t) { out.tokenlar[n] = "o'rnatilmagan"; continue; }
    try { const j = await (await fetch('https://api.telegram.org/bot' + t + '/getMe')).json(); out.tokenlar[n] = j.ok ? 'ISHLAYDI (@' + j.result.username + ')' : 'RAD ETILDI: ' + j.description; } catch (e) { out.tokenlar[n] = 'tarmoq xatosi'; }
  }
  const info = await tgApi('getWebhookInfo', {});
  out.webhook = info && info.ok ? { url: info.result.url || "(O'RNATILMAGAN)", kutayotgan_xabarlar: info.result.pending_update_count, oxirgi_xato: info.result.last_error_message || 'yoq', oxirgi_xato_vaqti: info.result.last_error_date ? new Date(info.result.last_error_date * 1000).toISOString() : null } : 'olinmadi: ' + (info && info.description);
  try { await db().collection('publicinfo').doc('maktab').get(); out.firebase = 'ISHLAYDI'; } catch (e) { out.firebase = 'XATO: ' + (e && e.message); }
  try { out['majburiy kanal'] = (await reqChannel()) || "(yo'q: obuna so'ralmaydi)"; } catch (e) { out['majburiy kanal'] = 'xato'; }
  res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(out, null, 2));
}

module.exports = async (req, res) => {
  if (req.method === 'GET') { try { return await diag(res); } catch (e) { res.status(500).send('diag xato: ' + e.message); return; } }
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      res.status(401).send('unauthorized');
      return;
    }
    const update = req.body || {};
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      res.status(200).send('ok');
      return;
    }
    const msg = update.message;
    if (!msg) { res.status(200).send('ok'); return; }
    const chatId = msg.chat && msg.chat.id;
    const text = String(msg.text || '');
    const lang = (await getLang(chatId)) || 'uz';

    if (msg.contact && msg.contact.phone_number) {
      // Faqat O'ZINING raqamini ulashganda qabul qilinadi (boshqa odamning kontakt kartasi emas)
      if (!msg.from || !msg.contact.user_id || String(msg.contact.user_id) !== String(msg.from.id)) {
        await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'contact_foreign'), reply_markup: contactMarkup(lang) });
        res.status(200).send('ok');
        return;
      }
      const phone = normPhone(msg.contact.phone_number);
      if (phone.length === 12) {
        await db().collection('telegram_links').doc(phone).set({ chatId, phone, linkedAt: Date.now(), lang });
        const ch = await reqChannel();
        if (await isSubscribed(ch, msg.from && msg.from.id)) {
          await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'linked_ok') + '\n\n' + t(lang, 'ready'), reply_markup: { remove_keyboard: true } });
        } else {
          await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'linked_sub', { ch }), reply_markup: subMarkup(ch, lang) });
        }
      } else {
        await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'contact_fail') });
      }
      res.status(200).send('ok');
      return;
    }

    const cmd = text.split(/[\s@]/)[0].toLowerCase();
    if (cmd === '/start') {
      const chosen = await getLang(chatId);
      if (!chosen) await tgApi('sendMessage', { chat_id: chatId, text: t('uz', 'choose_lang'), reply_markup: langMarkup() });
      else await startFlow(chatId, msg.from && msg.from.id, chosen);
    } else if (cmd === '/til' || cmd === '/lang') {
      await tgApi('sendMessage', { chat_id: chatId, text: t('uz', 'choose_lang'), reply_markup: langMarkup() });
    } else if (cmd === '/toxtat' || cmd === '/yoqish') {
      const d = await linkByChat(chatId);
      if (!d) await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'need_start') });
      else {
        const mute = cmd === '/toxtat';
        await d.ref.update({ muteAbsence: mute });
        await tgApi('sendMessage', { chat_id: chatId, text: t(lang, mute ? 'mute_on' : 'mute_off') });
      }
    } else {
      await tgApi('sendMessage', { chat_id: chatId, text: t(lang, 'need_start') });
    }
    res.status(200).send('ok');
    return;
  } catch (e) {
    console.error('telegram-webhook xato:', e);
    try {   // foydalanuvchi jim qolmasin
      const b = req.body || {}, m = b.message || (b.callback_query && b.callback_query.message), cid = m && m.chat && m.chat.id;
      if (cid) await tgApi('sendMessage', { chat_id: cid, text: "⚠️ Vaqtincha texnik xatolik. Birozdan keyin qayta urinib ko'ring." });
    } catch (e2) { /* e'tibor bermaymiz */ }
    res.status(200).send('ok'); // Telegram qayta-qayta urinavermasligi uchun 200 qaytaramiz
  }
};

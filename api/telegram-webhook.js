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
const { db, normPhone, tgApi } = require('./_lib');

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
function subMarkup(ch) {
  const rows = [];
  if (ch.charAt(0) === '@') rows.push([{ text: "📢 Kanalga o'tish", url: 'https://t.me/' + ch.slice(1) }]);
  rows.push([{ text: '✅ Obunani tekshirish', callback_data: 'sub' }]);
  return { inline_keyboard: rows };
}
const CONTACT_MARKUP = { keyboard: [[{ text: '📱 Telefon raqamimni yuborish', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const READY = "✅ Tayyor! Raqamingiz ulandi va kanalga obuna tasdiqlandi. Endi farzandingiz haqida berilgan xatlar shu yerga yuboriladi va saytdagi ota-onalar kabinetidan kod olishingiz mumkin.";

/**
 * "✅ Tanishdim" tugmasi bosilganda: notify_log yozuviga ackAt qo'shadi va
 * faollik jurnaliga yozadi. Tugma ma'lumoti: 'ack|<notify_log id>' (yangi)
 * yoki 'ack|<telefon>|<sana>' (eski xabarlar uchun).
 */
async function handleCallback(cq) {
  const answer = (text) => tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: text || '' });
  const data = String(cq.data || '');
  const chatId = cq.message && cq.message.chat && cq.message.chat.id;
  const parts = data.split('|');
  if (parts[0] === 'sub' && chatId) {
    const ch = await reqChannel();
    if (!(await isSubscribed(ch, cq.from && cq.from.id))) {
      await tgApi('answerCallbackQuery', { callback_query_id: cq.id, text: "Siz hali kanalga obuna bo'lmagansiz", show_alert: true });
      return;
    }
    await answer('Obuna tasdiqlandi ✅');
    const lk = await db().collection('telegram_links').where('chatId', '==', chatId).limit(1).get();
    if (lk.empty) await tgApi('sendMessage', { chat_id: chatId, text: "✅ Obuna tasdiqlandi.\n\nEndi pastdagi tugmani bosib, telefon raqamingizni ulashing (faqat bir marta).", reply_markup: CONTACT_MARKUP });
    else await tgApi('sendMessage', { chat_id: chatId, text: READY, reply_markup: { remove_keyboard: true } });
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
  if (!snap || !snap.exists) { await answer('Xabar topilmadi'); return; }
  const rec = snap.data();

  // Faqat shu raqamga ulangan Telegram hisobi tasdiqlay oladi
  const link = await db().collection('telegram_links').doc(String(rec.phone || '')).get();
  if (!link.exists || String(link.data().chatId) !== String(chatId)) { await answer('Ruxsat yo\'q'); return; }

  if (rec.ackAt) { await answer('Siz allaqachon tanishgansiz ✅'); return; }
  await ref.update({ ackAt: Date.now(), ackChatId: chatId });
  try {
    await db().collection('audit_log').add({
      action: 'parent_ack',
      details: { name: rec.name || '', cls: rec.cls || '', date: rec.date || '' },
      by: 'telegram-bot',
      at: Date.now(),
    });
  } catch (e) { console.warn('audit yozilmadi:', e); }
  await answer('Rahmat! Tanishganingiz qayd etildi ✅');
  if (cq.message && cq.message.message_id) {
    await tgApi('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: '✅ Tanishdingiz', callback_data: 'noop' }]] },
    });
  }
}

module.exports = async (req, res) => {
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

    if (msg.contact && msg.contact.phone_number) {
      // Faqat O'ZINING raqamini ulashganda qabul qilinadi (boshqa odamning kontakt kartasi emas)
      if (!msg.from || !msg.contact.user_id || String(msg.contact.user_id) !== String(msg.from.id)) {
        await tgApi('sendMessage', { chat_id: chatId, text: "Iltimos, faqat o'zingizning raqamingizni ulashing: pastdagi «📱 Telefon raqamimni yuborish» tugmasini bosing.", reply_markup: CONTACT_MARKUP });
        res.status(200).send('ok');
        return;
      }
      const phone = normPhone(msg.contact.phone_number);
      if (phone.length === 12) {
        await db().collection('telegram_links').doc(phone).set({ chatId, phone, linkedAt: Date.now() });
        const ch = await reqChannel();
        if (await isSubscribed(ch, msg.from && msg.from.id)) {
          await tgApi('sendMessage', {
            chat_id: chatId,
            text: "✅ Raqamingiz ulandi. Endi farzandingiz haqida berilgan ogohlantirish xatlari shu yerga yuboriladi.",
            reply_markup: { remove_keyboard: true },
          });
        } else {
          await tgApi('sendMessage', { chat_id: chatId, text: "✅ Raqamingiz ulandi.\n\n📢 Davom etish uchun avval maktab kanaliga obuna bo'ling: " + ch + "\n\nObuna bo'lgach, pastdagi «✅ Obunani tekshirish» tugmasini bosing.", reply_markup: subMarkup(ch) });
        }
      } else {
        await tgApi('sendMessage', { chat_id: chatId, text: "Raqamni tanib bo'lmadi, birozdan so'ng qaytadan urinib ko'ring." });
      }
      res.status(200).send('ok');
      return;
    }

    if (msg.text && msg.text.indexOf('/start') === 0) {
      const ch = await reqChannel();
      if (!(await isSubscribed(ch, msg.from && msg.from.id))) {
        await tgApi('sendMessage', { chat_id: chatId, text: "Assalomu alaykum! Bu — 28-maktab ota-onalar boti.\n\n📢 Davom etish uchun avval maktab kanaliga obuna bo'ling: " + ch + "\n\nObuna bo'lgach, pastdagi «✅ Obunani tekshirish» tugmasini bosing.", reply_markup: subMarkup(ch) });
      } else {
        await tgApi('sendMessage', { chat_id: chatId, text: "Assalomu alaykum! Bu — 28-maktab ota-onalar boti.\n\nFarzandingiz haqidagi xatlar va saytdagi ota-onalar kabineti kodi shu yerga yuboriladi. Buning uchun pastdagi tugma orqali telefon raqamingizni ulashing (faqat bir marta).", reply_markup: CONTACT_MARKUP });
      }
      res.status(200).send('ok');
      return;
    }

    await tgApi('sendMessage', { chat_id: chatId, text: "Telefon raqamingizni ulashish uchun /start buyrug'ini yuboring." });
    res.status(200).send('ok');
  } catch (e) {
    console.error('telegram-webhook xato:', e);
    res.status(200).send('ok'); // Telegram qayta-qayta urinavermasligi uchun 200 qaytaramiz
  }
};

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

module.exports = async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      res.status(401).send('unauthorized');
      return;
    }
    const update = req.body || {};
    const msg = update.message;
    if (!msg) { res.status(200).send('ok'); return; }
    const chatId = msg.chat && msg.chat.id;

    if (msg.contact && msg.contact.phone_number) {
      const phone = normPhone(msg.contact.phone_number);
      if (phone.length === 12) {
        await db().collection('telegram_links').doc(phone).set({ chatId, phone, linkedAt: Date.now() });
        await tgApi('sendMessage', {
          chat_id: chatId,
          text: "✅ Raqamingiz ulandi. Endi farzandingiz haqida berilgan ogohlantirish xatlari shu yerga yuboriladi.",
          reply_markup: { remove_keyboard: true },
        });
      } else {
        await tgApi('sendMessage', { chat_id: chatId, text: "Raqamni tanib bo'lmadi, birozdan so'ng qaytadan urinib ko'ring." });
      }
      res.status(200).send('ok');
      return;
    }

    if (msg.text && msg.text.indexOf('/start') === 0) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: "Assalomu alaykum! Bu — maktab ogohlantirish xatlari boti.\n\nFarzandingiz haqida xat berilganda shu yerga xabar kelishi uchun, pastdagi tugma orqali telefon raqamingizni ulashing.",
        reply_markup: {
          keyboard: [[{ text: '📱 Telefon raqamimni yuborish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
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

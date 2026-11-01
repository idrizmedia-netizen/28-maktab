/**
 * Vercel serverless funksiya: ilova (index.html) chaqiradi. Admin "Telegramda
 * ota-onaga xabar berish" tugmasini bosganda ishga tushadi.
 *
 * Xavfsizlik: so'rov "Authorization: Bearer <Firebase ID token>" sarlavhasi
 * bilan keladi, token Firebase Admin SDK orqali tekshiriladi, so'ng
 * foydalanuvchi admin ekanligi Firestore'dan tasdiqlanadi.
 */
const { db, adminAuth, normPhone, isAdminEmail, tgApi, tgSendDocument } = require('./_lib');
const { t, normLang, kindKey } = require('./_i18n');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  try {
    const authHeader = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(authHeader);
    if (!m) { res.status(401).json({ error: 'unauthenticated' }); return; }

    let decoded;
    try { decoded = await adminAuth().verifyIdToken(m[1]); }
    catch (e) { res.status(401).json({ error: 'invalid-token' }); return; }

    if (!decoded.email_verified) { res.status(401).json({ error: 'unauthenticated' }); return; }
    const email = (decoded.email || '').toLowerCase();
    if (!(await isAdminEmail(email))) { res.status(403).json({ error: 'permission-denied' }); return; }

    // Rol tekshiruvi: "faqat ko'ruvchi" yubora olmaydi; sinf rahbari faqat o'z sinfi uchun.
    // Asosiy admin admins to'plamida bo'lmasligi mumkin, u cheklanmaydi.
    let adminRole = 'owner', adminClasses = [];
    const adminSnap = await db().collection('admins').doc(email).get();
    if (adminSnap.exists) {
      adminRole = adminSnap.data().role || 'full';
      adminClasses = Array.isArray(adminSnap.data().classes) ? adminSnap.data().classes : [];
    }
    if (adminRole === 'viewer') { res.status(403).json({ error: 'role-denied' }); return; }
    // ilovadagi normClass bilan bir xil qoida: "9a", "9 - a" -> "9-A"
    const normClass = (c) => {
      c = String(c || '').trim();
      const m = /^(\d{1,2})\s*-?\s*([A-Za-zА-Яа-яЎўҚқҒғҲҳ']+)$/.exec(c);
      return m ? (m[1] + '-' + m[2].toUpperCase()) : c;
    };

    const data = req.body || {};
    const phone = normPhone(data.phone);
    if (phone.length !== 12) { res.status(400).json({ error: 'invalid-phone' }); return; }

    const linkDoc = await db().collection('telegram_links').doc(phone).get();
    if (!linkDoc.exists) { res.status(200).json({ status: 'not_linked' }); return; }
    const chatId = linkDoc.data().chatId;

    const name = (data.name || '').trim();
    const cls = (data.cls || '').trim();
    const dateTxt = (data.date || '').trim();
    const reason = (data.reason || '').trim();
    if (adminRole === 'homeroom') {
      const mine = adminClasses.map(normClass);
      if (!mine.length || mine.indexOf(normClass(cls)) < 0) { res.status(403).json({ error: 'class-denied' }); return; }
    }
    const infoUrl = (data.infoUrl || '').trim();

    // Xat turi: '' (ogohlantirish) | praise | invite | summon. Noma'lum qiymat ogohlantirish deb olinadi.
    // Matn ota-onaning tilida (bot orqali tanlagan: o'zbek yoki rus) yuboriladi.
    const lang = normLang(linkDoc.data().lang);
    const kind = ['praise', 'invite', 'summon'].indexOf(data.kind) >= 0 ? data.kind : '';
    const kk = kindKey(kind);
    const FILES = { '': 'ogohlantirish-xati', praise: 'minnatdorchilik-xati', invite: 'taklifnoma', summon: 'chaqiruv-xati' };
    const qt = /^[a-z0-9]{8,16}$/.test(String(data.qt || '')) ? String(data.qt) : '';

    let text = t(lang, kk + '_head') + "\n\n";
    text += t(lang, kk + '_line', { c: t(lang, 'child') + (name ? " (" + name + (cls ? ", " + t(lang, 'cls_sfx', { c: cls }) : "") + ")" : "") }) + "\n";
    if (dateTxt) text += t(lang, 'date_lb') + dateTxt + "\n";
    if (reason) text += t(lang, kk + '_reason') + reason + "\n";
    if (infoUrl) text += "\n" + t(lang, 'detail_lb') + infoUrl;

    // "Tanishdim" tugmasi: ota-ona bossa, telegram-webhook.js shu yozuvga ackAt qo'shadi
    const logRef = db().collection('notify_log').doc();
    const sent = await tgApi('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'btn_ack'), callback_data: 'ack|' + logRef.id }]] },
    });
    if (sent && sent.ok === false) {
      res.status(502).json({ error: 'telegram-failed', message: sent.description || '' });
      return;
    }
    await logRef.set({ phone, name, cls, clsKey: normClass(cls), date: dateTxt, kind, sentBy: email, sentAt: Date.now(), qt });

    // PDF nusxasi (ixtiyoriy) — admin brauzerda tayyorlab yuborgan bo'lsa,
    // alohida xabar sifatida biriktiriladi. Bu muvaffaqiyatsiz bo'lsa ham,
    // asosiy matnli xabar allaqachon yetib borgani uchun so'rovni xato
    // deb hisoblamaymiz.
    let pdfSent = false;
    if (data.pdfBase64) {
      try {
        const fname = FILES[kind] + (dateTxt ? '-' + dateTxt : '') + '.pdf';
        await tgSendDocument(chatId, data.pdfBase64, fname, t(lang, kk + '_cap'));
        pdfSent = true;
      } catch (e) {
        console.warn("PDF yuborib bo'lmadi:", e);
      }
    }

    res.status(200).json({ status: 'sent', pdfSent, logId: logRef.id });
  } catch (e) {
    console.error('send-parent-notice xato:', e);
    res.status(500).json({ error: 'internal', message: e.message });
  }
};

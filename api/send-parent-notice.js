/**
 * Vercel serverless funksiya: ilova (index.html) chaqiradi. Admin "Telegramda
 * ota-onaga xabar berish" tugmasini bosganda ishga tushadi.
 *
 * Xavfsizlik: so'rov "Authorization: Bearer <Firebase ID token>" sarlavhasi
 * bilan keladi, token Firebase Admin SDK orqali tekshiriladi, so'ng
 * foydalanuvchi admin ekanligi Firestore'dan tasdiqlanadi.
 */
const { db, adminAuth, normPhone, isAdminEmail, tgApi, tgSendDocument } = require('./_lib');

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

    // Xat turi: '' (ogohlantirish) | praise | invite | summon. Noma'lum qiymat ogohlantirish deb olinadi
    const KINDS = {
      '':      { head: "📩 Ogohlantirish xati haqida xabar", line: (c) => c + " uchun ogohlantirish xati berildi.", reasonLb: "Sababi: ", file: 'ogohlantirish-xati', cap: 'Xat nusxasi (PDF)' },
      praise:  { head: "🌟 Minnatdorchilik xati haqida xabar", line: (c) => c + " uchun minnatdorchilik xati berildi.", reasonLb: "Sababi: ", file: 'minnatdorchilik-xati', cap: 'Xat nusxasi (PDF)' },
      invite:  { head: "📅 Ota-onalar yig'ilishiga taklifnoma", line: (c) => "Hurmatli ota-ona! Sizni maktabda o'tadigan ota-onalar yig'ilishiga taklif qilamiz. " + c + ".", reasonLb: "Mavzu va vaqt: ", file: 'taklifnoma', cap: 'Taklifnoma nusxasi (PDF)' },
      summon:  { head: "📞 Maktabga chaqiruv xati", line: (c) => "Hurmatli ota-ona! " + c + " bo'yicha sizni maktabga chaqiramiz.", reasonLb: "Sabab va vaqt: ", file: 'chaqiruv-xati', cap: 'Xat nusxasi (PDF)' },
    };
    const kind = Object.prototype.hasOwnProperty.call(KINDS, data.kind) ? data.kind : '';
    const K = KINDS[kind];

    let text = K.head + "\n\n";
    text += K.line("Farzandingiz" + (name ? " (" + name + (cls ? ", " + cls + "-sinf" : "") + ")" : "")) + "\n";
    if (dateTxt) text += "Sana: " + dateTxt + "\n";
    if (reason) text += K.reasonLb + reason + "\n";
    if (infoUrl) text += "\nTafsilot: " + infoUrl;

    // "Tanishdim" tugmasi: ota-ona bossa, bot shu haqda faollik jurnaliga yozadi
    const ackData = ('ack|' + phone + '|' + dateTxt).slice(0, 64);
    await tgApi('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: '✅ Tanishdim', callback_data: ackData }]] },
    });
    await db().collection('notify_log').add({ phone, name, cls, date: dateTxt, kind, sentBy: email, sentAt: Date.now() });

    // PDF nusxasi (ixtiyoriy) — admin brauzerda tayyorlab yuborgan bo'lsa,
    // alohida xabar sifatida biriktiriladi. Bu muvaffaqiyatsiz bo'lsa ham,
    // asosiy matnli xabar allaqachon yetib borgani uchun so'rovni xato
    // deb hisoblamaymiz.
    let pdfSent = false;
    if (data.pdfBase64) {
      try {
        const fname = K.file + (dateTxt ? '-' + dateTxt : '') + '.pdf';
        await tgSendDocument(chatId, data.pdfBase64, fname, K.cap);
        pdfSent = true;
      } catch (e) {
        console.warn("PDF yuborib bo'lmadi:", e);
      }
    }

    res.status(200).json({ status: 'sent', pdfSent });
  } catch (e) {
    console.error('send-parent-notice xato:', e);
    res.status(500).json({ error: 'internal', message: e.message });
  }
};

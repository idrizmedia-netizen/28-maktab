/**
 * Vercel serverless funksiya: ilova (index.html) chaqiradi. Admin "Telegramda
 * ota-onaga xabar berish" tugmasini bosganda ishga tushadi.
 *
 * Xavfsizlik: so'rov "Authorization: Bearer <Firebase ID token>" sarlavhasi
 * bilan keladi, token Firebase Admin SDK orqali tekshiriladi, so'ng
 * foydalanuvchi admin ekanligi Firestore'dan tasdiqlanadi.
 */
const { db, adminAuth, normPhone, isAdminEmail, tgApi } = require('./_lib');

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
    const infoUrl = (data.infoUrl || '').trim();

    let text = "📩 Ogohlantirish xati haqida xabar\n\n";
    text += "Farzandingiz" + (name ? " (" + name + (cls ? ", " + cls + "-sinf" : "") + ")" : "") + " uchun ogohlantirish xati berildi.\n";
    if (dateTxt) text += "Sana: " + dateTxt + "\n";
    if (reason) text += "Sababi: " + reason + "\n";
    if (infoUrl) text += "\nTafsilot: " + infoUrl;

    await tgApi('sendMessage', { chat_id: chatId, text });
    await db().collection('notify_log').add({ phone, name, cls, date: dateTxt, sentBy: email, sentAt: Date.now() });

    res.status(200).json({ status: 'sent' });
  } catch (e) {
    console.error('send-parent-notice xato:', e);
    res.status(500).json({ error: 'internal', message: e.message });
  }
};

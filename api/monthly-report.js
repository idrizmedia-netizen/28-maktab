/**
 * Vercel Cron funksiyasi: har oyning 1-sanasida (vercel.json'dagi jadval
 * bo'yicha) avtomatik ishga tushadi va o'tgan oy bo'yicha statistikani
 * Sozlamalar → "Oylik avtomatik hisobot"da kiritilgan Telegram raqamiga
 * yuboradi.
 *
 * Xavfsizlik: Vercel cron so'rovni avtomatik "Authorization: Bearer
 * <CRON_SECRET>" sarlavhasi bilan yuboradi (CRON_SECRET muhit o'zgaruvchisi
 * Vercel tomonidan o'zi yaratiladi). Shu sarlavha tekshiriladi, aks holda
 * boshqa hech kim bu manzilni chaqira olmaydi.
 */
const { db, normPhone, tgApi } = require('./_lib');

const MONTHS_UZ = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];

// "9-a", "9 A" -> "9-A"
function normClass(c) {
  c = String(c || '').trim();
  if (!c) return c;
  const m = /^(\d{1,2})\s*-?\s*([A-Za-zА-Яа-яЎўЎғҚқҒғҲҳ']+)$/.exec(c);
  return m ? (m[1] + '-' + m[2].toUpperCase()) : c;
}
// bir nechta sabab tartibidan qat'i nazar bitta guruh sifatida hisoblash uchun
function canonReason(r) {
  const parts = String(r || '').split(/;\s*/).map((s) => s.trim()).filter(Boolean);
  parts.sort((a, b) => a.localeCompare(b, 'uz'));
  return parts.join('; ');
}
function topEntries(obj, n) {
  return Object.keys(obj)
    .map((k) => ({ k, n: obj[k] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, n || 1e9);
}
function prevMonthRange() {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(); // 0-based, joriy oy
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const prefix = prevY + '-' + String(prevM + 1).padStart(2, '0');
  return { prefix, label: MONTHS_UZ[prevM] + ' ' + prevY };
}

module.exports = async (req, res) => {
  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).send('unauthorized');
    return;
  }
  try {
    const rosterDoc = await db().collection('adminonly').doc('roster').get();
    const reportPhone = normPhone(rosterDoc.exists && rosterDoc.data().data && rosterDoc.data().data.reportPhone);
    if (reportPhone.length !== 12) {
      res.status(200).json({ status: 'skipped', reason: 'no-report-phone' });
      return;
    }
    const linkDoc = await db().collection('telegram_links').doc(reportPhone).get();
    if (!linkDoc.exists) {
      res.status(200).json({ status: 'skipped', reason: 'phone-not-linked' });
      return;
    }
    const chatId = linkDoc.data().chatId;

    const { prefix, label } = prevMonthRange();
    const logDoc = await db().collection('m28letters').doc('m28_log').get();
    const items = (logDoc.exists && logDoc.data().items) || [];
    const monthItems = items.filter((it) => (it.date || '').indexOf(prefix) === 0);

    if (!monthItems.length) {
      await tgApi('sendMessage', { chat_id: chatId, text: '📊 ' + label + ": o'tgan oyda hech qanday ogohlantirish xati berilmagan." });
      res.status(200).json({ status: 'sent', count: 0 });
      return;
    }

    const byClass = {};
    monthItems.forEach((it) => { const k = normClass(it.cls) || '(sinfsiz)'; byClass[k] = (byClass[k] || 0) + 1; });
    const byReason = {};
    monthItems.forEach((it) => { const r = canonReason(it.reason); if (r) byReason[r] = (byReason[r] || 0) + 1; });

    const topClasses = topEntries(byClass, 5);
    const topReasons = topEntries(byReason, 5);

    let text = '📊 ' + label + " statistikasi\n\n";
    text += 'Jami: ' + monthItems.length + " ta ogohlantirish xati\n\n";
    text += 'Eng ko\'p xat olgan sinflar:\n';
    topClasses.forEach((e) => { text += '• ' + e.k + ': ' + e.n + " ta\n"; });
    text += "\nEng ko'p uchragan sabablar:\n";
    topReasons.forEach((e) => {
      const short = e.k.length > 60 ? e.k.slice(0, 58) + '…' : e.k;
      text += '• ' + short + ': ' + e.n + " ta\n";
    });

    await tgApi('sendMessage', { chat_id: chatId, text: text.trim() });
    res.status(200).json({ status: 'sent', count: monthItems.length });
  } catch (e) {
    console.error('monthly-report xato:', e);
    res.status(500).json({ error: 'internal', message: e.message });
  }
};

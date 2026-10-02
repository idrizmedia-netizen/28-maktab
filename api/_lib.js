/**
 * Umumiy yordamchi funksiyalar: Firebase Admin ishga tushirish va
 * telefon raqamini normallashtirish.
 */
const admin = require('firebase-admin');

function getApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON sozlanmagan');
  const cred = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(cred) });
}

function db() { return getApp().firestore(); }
function adminAuth() { return getApp().auth(); }

const OWNER_EMAIL = 'idrizmedia@gmail.com';

// +998XXXXXXXXX -> 998XXXXXXXXX (faqat raqamlar, mamlakat kodi bilan, 12 ta raqam)
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  else if (d.length === 13 && d.indexOf('8998') === 0) d = d.slice(1);
  return d;
}

async function isAdminEmail(email) {
  if (!email) return false;
  email = email.toLowerCase();
  if (email === OWNER_EMAIL) return true;
  const doc = await db().collection('admins').doc(email).get();
  return doc.exists;
}

async function tgApi(method, payload) {
  const token = process.env.TELEGRAM_TOKEN;
  if (!token) throw new Error('TELEGRAM_TOKEN sozlanmagan');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) console.warn('Telegram API xato:', method, data);
  return data;
}

module.exports = { db, adminAuth, OWNER_EMAIL, normPhone, isAdminEmail, tgApi };

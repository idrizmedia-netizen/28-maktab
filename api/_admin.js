/* 28-maktab: Firestore'ga SERVER huquqi bilan kirish (qoidalarni chetlab o'tadi, faqat serverda ishlatiladi).
   Kalit KODDA YOZILMAYDI. Vercel -> Settings -> Environment Variables:
     FIREBASE_SERVICE_ACCOUNT  =  Firebase "service account" kalitining JSON matni (butunlay, yoki base64 ko'rinishida).
   (Agar sizda ota-onaga xabar yuborish funksiyasi uchun shunday kalit allaqachon boshqa nom bilan saqlangan bo'lsa, quyidagi nomlardan biri ham qabul qilinadi.) */
const crypto = require('crypto');
const L = require('./_lib.js');

const ENV_NAMES = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'FIREBASE_ADMIN_KEY', 'FIREBASE_ADMIN_CREDENTIALS', 'GOOGLE_SERVICE_ACCOUNT', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'SERVICE_ACCOUNT', 'SERVICE_ACCOUNT_JSON', 'FIREBASE_KEY'];

function creds() {
  for (const n of ENV_NAMES) {
    let v = process.env[n]; if (!v) continue; v = String(v).trim();
    try { if (v[0] !== '{') v = Buffer.from(v, 'base64').toString('utf8'); const j = JSON.parse(v); if (j.client_email && j.private_key) return { email: j.client_email, key: String(j.private_key).replace(/\\n/g, '\n') }; } catch (e) { /* keyingisini sinab ko'ramiz */ }
  }
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) return { email: process.env.FIREBASE_CLIENT_EMAIL, key: String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n') };
  return null;
}
const b64u = function (b) { return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); };
let cache = { t: '', exp: 0 };
async function token() {
  if (cache.t && Date.now() < cache.exp - 60000) return cache.t;
  const c = creds();
  if (!c) throw new Error('NO_ADMIN_KEY');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: c.email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(c.key));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig });
  const j = await r.json();
  if (!j.access_token) throw new Error('ADMIN_TOKEN_FAILED');
  cache = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.t;
}
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const f = {}; Object.keys(v).forEach(function (k) { f[k] = enc(v[k]); }); return { mapValue: { fields: f } };
}
async function call(path, opts) {
  const t = await token();
  const o = Object.assign({}, opts || {}); o.headers = Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, o.headers || {});
  return fetch(L.FS + path, o);
}
async function getDoc(path) { const r = await call('/' + path); if (!r.ok) return null; return L.toObj(await r.json()); }
async function setDoc(path, obj) {
  const f = {}; Object.keys(obj).forEach(function (k) { f[k] = enc(obj[k]); });
  const r = await call('/' + path, { method: 'PATCH', body: JSON.stringify({ fields: f }) });
  if (!r.ok) throw new Error('SET_FAILED ' + r.status);
}
async function delDoc(path) { await call('/' + path, { method: 'DELETE' }); }
async function queryEq(collection, field, value, limit) {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: enc(value) } }, limit: limit || 5 } };
  const r = await call(':runQuery', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) return [];
  return (await r.json()).filter(function (x) { return x.document; }).map(function (x) { return L.toObj(x.document); });
}
module.exports = { creds, token, getDoc, setDoc, delDoc, queryEq };

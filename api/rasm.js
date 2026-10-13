/* 28-maktab: yangilik rasmini oddiy rasm havolasi sifatida beradi
   (Firestore'da rasm matn ko'rinishida saqlanadi, ijtimoiy tarmoqlar esa rasm havolasini kutadi).
   /api/rasm?id=<yangilik>&i=<rasm raqami, 0 dan> */
const PROJECT = 'maktab-49da5';
const API_KEY = 'AIzaSyCyY4iguO742_S9Io843WK5GGHZFSYDPOc';
const ORIGIN = 'https://28-maktab.vercel.app';

module.exports = async function (req, res) {
  const id = String((req.query && req.query.id) || '');
  const i = Math.max(0, parseInt((req.query && req.query.i) || '0', 10) || 0);
  const fallback = function () { res.setHeader('Cache-Control', 'public, s-maxage=300'); res.redirect(302, ORIGIN + '/og-default.png'); };
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return fallback();
  try {
    const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/news/' + id +
      '?mask.fieldPaths=status&mask.fieldPaths=imgs&mask.fieldPaths=img&key=' + API_KEY;
    const r = await fetch(url);
    if (!r.ok) return fallback();
    const f = (await r.json()).fields || {};
    if (!f.status || f.status.stringValue !== 'published') return fallback();
    let list = [];
    if (f.imgs && f.imgs.arrayValue && f.imgs.arrayValue.values) list = f.imgs.arrayValue.values.map(function (v) { return v.stringValue || ''; });
    else if (f.img && f.img.stringValue) list = [f.img.stringValue];
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(list[i] || '');
    if (!m) return fallback();
    const buf = Buffer.from(m[2], 'base64');
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(buf);
  } catch (e) {
    fallback();
  }
};

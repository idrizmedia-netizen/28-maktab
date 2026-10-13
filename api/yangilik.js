/* 28-maktab: yangilik havolasi (https://28-maktab.vercel.app/yangilik/<id>)
   Telegram, Facebook va boshqa ilovalar havolani ochganda sarlavha, matn va rasm ko'rsatishi uchun
   alohida HTML beradi. Oddiy foydalanuvchi esa darrov ochiq sahifadagi yangilikka o'tkaziladi. */
const PROJECT = 'maktab-49da5';
const API_KEY = 'AIzaSyCyY4iguO742_S9Io843WK5GGHZFSYDPOc';
const ORIGIN = 'https://28-maktab.vercel.app';
const CATS = { yangilik: 'Yangilik', tadbir: 'Tadbir', yutuq: 'Yutuq', elon: "E'lon" };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function getNews(id) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const fields = ['title', 'body', 'status', 'cat', 'date', 'ni'].map(function (f) { return 'mask.fieldPaths=' + f; }).join('&');
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/news/' + id + '?' + fields + '&key=' + API_KEY;
  const r = await fetch(url);
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  const s = function (k) { return (f[k] && f[k].stringValue) || ''; };
  return { title: s('title'), body: s('body'), status: s('status'), cat: s('cat'), date: s('date'),
           ni: f.ni && f.ni.integerValue != null ? Number(f.ni.integerValue) : null };
}

module.exports = async function (req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  const target = ORIGIN + '/#/yangilik/' + encodeURIComponent(id);
  let n = null;
  try { n = await getNews(id); } catch (e) { n = null; }
  if (n && n.status !== 'published') n = null;

  let title = '28-maktab · Tarbiya, bilim, kelajak';
  let desc = "28-maktab rasmiy sahifasi: maktab yangiliklari, e'lonlar va aloqa.";
  let image = ORIGIN + '/og-default.png';
  if (n) {
    title = n.title + ' · 28-maktab';
    desc = n.body.replace(/\s+/g, ' ').trim().slice(0, 200) || desc;
    // ni = rasmlar soni. Eski yangiliklarda (ni yo'q) rasm bo'lishi mumkin, /api/rasm o'zi tekshiradi.
    if (n.ni === null || n.ni > 0) image = ORIGIN + '/api/rasm?id=' + encodeURIComponent(id) + '&i=0';
  }
  const page = target;
  const html = '<!doctype html><html lang="uz"><head><meta charset="utf-8">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="description" content="' + esc(desc) + '">' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="28-maktab">' +
    '<meta property="og:locale" content="uz_UZ">' +
    '<meta property="og:title" content="' + esc(n ? n.title : title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(image) + '">' +
    '<meta property="og:url" content="' + esc(ORIGIN + '/yangilik/' + id) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(n ? n.title : title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    '<meta name="twitter:image" content="' + esc(image) + '">' +
    '<meta http-equiv="refresh" content="0;url=' + esc(page) + '">' +
    '<script>location.replace(' + JSON.stringify(page) + ');</script>' +
    '</head><body><p><a href="' + esc(page) + '">' + esc(n ? n.title : '28-maktab') + '</a></p></body></html>';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(n ? 200 : 404).send(html);
};

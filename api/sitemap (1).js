/* 28-maktab: sitemap.xml (Google uchun e'lon qilingan yangiliklar ro'yxati) */
const L = require('./_lib.js');
module.exports = async function (req, res) {
  let items = [];
  try { items = await L.publishedNews(['date', 'title'], 500); } catch (e) { items = []; }
  const urls = ['<url><loc>' + L.ORIGIN + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>'].concat(items.map(function (n) {
    return '<url><loc>' + L.ORIGIN + '/yangilik/' + L.esc(n.id) + '</loc>' + (/^\d{4}-\d{2}-\d{2}$/.test(n.date || '') ? '<lastmod>' + n.date + '</lastmod>' : '') + '<changefreq>monthly</changefreq><priority>0.7</priority></url>';
  }));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.join('') + '</urlset>');
};

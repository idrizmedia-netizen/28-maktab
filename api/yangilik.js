/* 28-maktab: yangilikning to'liq sahifasi  https://28-maktab.vercel.app/yangilik/<id>
   Google, Telegram va boshqa ilovalar matnni, rasmni va sarlavhani darrov ko'radi (server tomonida tayyorlanadi). */
const L = require('./_lib.js');
const esc = L.esc;

const CSS = ':root{--navy:#0F3D7A;--blue:#1A3E8C;--gold:#F2B632;--gold-d:#7A5B12;--ink:#0B2447;--muted:#5B6B85;--bg:#F7F5EE;--line:#E6E2D3;--head:"Unbounded","Trebuchet MS",system-ui,sans-serif;--body:"Manrope",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:500 16px/1.6 var(--body);overflow-x:clip}a{color:inherit}img{max-width:100%;display:block}' +
  '.wrap{max-width:1120px;margin:0 auto;padding:0 18px}header{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}' +
  '.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;flex-wrap:wrap;padding:6px 0}.brand{display:flex;align-items:center;gap:11px;text-decoration:none}' +
  '.brand b{font:700 15px/1 var(--head);color:var(--blue);white-space:nowrap}.brand small{display:block;font:700 9.5px/1 var(--body);letter-spacing:.18em;color:var(--gold-d);margin-top:5px}' +
  'nav{display:flex;gap:2px;overflow-x:auto;max-width:100%}nav a{text-decoration:none;font-weight:700;font-size:14.5px;color:var(--muted);padding:9px 12px;border-radius:10px;white-space:nowrap}nav a:hover{background:#EEF2FA;color:var(--navy)}' +
  '.art{max-width:760px;margin:0 auto;padding:28px 0 8px}.back{display:inline-flex;text-decoration:none;font-weight:800;color:var(--navy);margin-bottom:16px}' +
  '.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--muted);font-weight:600}.chip{font:800 11px/1 var(--body);letter-spacing:.06em;text-transform:uppercase;padding:6px 9px;border-radius:99px;background:#EEF2FA;color:var(--navy)}.chip.pin{background:var(--gold);color:#3b2a00}' +
  'h1{font:700 clamp(24px,4.4vw,38px)/1.18 var(--head);margin:12px 0 18px;color:var(--navy)}.cover{border-radius:18px;overflow:hidden;margin:0 0 24px;border:1px solid var(--line);background:#fff}.cover img{width:100%;max-height:480px;object-fit:cover}' +
  '.body{font-size:17.5px;line-height:1.75}.body p{margin:0 0 1.1em}.body h3{font:700 21px/1.3 var(--head);color:var(--navy);margin:1.4em 0 .5em}.body ul{margin:0 0 1.1em;padding-left:1.3em}.body li{margin:.3em 0}.body a{color:var(--blue);font-weight:700;word-break:break-word}' +
  '.gal{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:24px 0}.gal img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;border:1px solid var(--line)}' +
  '.vid{margin:24px 0;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#000}.vid iframe{display:block;width:100%;border:0;aspect-ratio:16/9}.vid.tg{background:#fff}.vid.tg iframe{aspect-ratio:auto;height:560px}' +
  '.share{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0 8px;padding-top:22px;border-top:1px solid var(--line)}.btn{display:inline-flex;text-decoration:none;font:700 15px/1 var(--body);padding:13px 20px;border-radius:12px;border:2px solid var(--navy);cursor:pointer;background:var(--navy);color:#fff}.btn.out{background:#fff;color:var(--navy);border-color:var(--line)}' +
  '.more{max-width:760px;margin:30px auto 0}.more h2{font:700 20px var(--head);color:var(--navy);margin:0 0 12px}.more a{display:block;padding:12px 14px;background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;text-decoration:none;font-weight:700}.more small{display:block;color:var(--muted);font-weight:600}' +
  'footer{margin-top:50px;background:var(--ink);color:#B8C6E0;padding:30px 0}footer b{font:700 15px var(--head);color:#fff}footer a{color:#fff;font-weight:700}' +
  '@media(max-width:560px){.gal{grid-template-columns:repeat(2,1fr)}.brand small{display:none}.vid.tg iframe{height:480px}}';

function shell(title, desc, image, canonical, extraHead, inner) {
  return '<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(desc) + '"><link rel="canonical" href="' + esc(canonical) + '">' +
    '<meta property="og:type" content="article"><meta property="og:site_name" content="28-maktab"><meta property="og:locale" content="uz_UZ">' +
    '<meta property="og:title" content="' + esc(title.replace(/ · 28-maktab$/, '')) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:image" content="' + esc(image) + '"><meta property="og:url" content="' + esc(canonical) + '">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(title.replace(/ · 28-maktab$/, '')) + '"><meta name="twitter:description" content="' + esc(desc) + '"><meta name="twitter:image" content="' + esc(image) + '">' +
    '<meta name="theme-color" content="#0F3D7A"><link rel="icon" href="/icons/maktab/icon-192.png">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap">' +
    '<style>' + CSS + '</style>' + extraHead + '</head><body>' +
    '<header><div class="wrap bar"><a class="brand" href="/"><img src="/logo-28.svg" width="42" height="42" alt="28-maktab"><span><b>28-MAKTAB</b><small>TARBIYA · BILIM · KELAJAK</small></span></a>' +
    '<nav aria-label="Menyu"><a href="/">Bosh</a><a href="/#/yangiliklar">Yangiliklar</a><a href="/#/tadbirlar">Tadbirlar</a><a href="/#/jamoa">Jamoa</a><a href="/#/jadval">Jadval</a><a href="/#/galereya">Galereya</a><a href="/#/aloqa">Aloqa</a></nav></div></header>' +
    '<main class="wrap">' + inner + '</main>' +
    '<footer><div class="wrap"><b>28-MAKTAB</b> · Tarbiya · Bilim · Kelajak · <a href="/">Bosh sahifa</a></div></footer></body></html>';
}

module.exports = async function (req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  let n = null;
  try {
    if (/^[A-Za-z0-9_-]{6,40}$/.test(id)) n = await L.getDoc('news/' + id, { mask: ['title', 'body', 'status', 'cat', 'date', 'ni', 'pinned', 'video'] });
  } catch (e) { n = null; }
  if (n && n.status !== 'published') n = null;

  if (!n) {
    const html = shell('Yangilik topilmadi · 28-maktab', 'Bu yangilik topilmadi.', L.ORIGIN + '/og-default.png', L.ORIGIN + '/', '<meta name="robots" content="noindex">',
      '<div style="text-align:center;padding:60px 0"><h1>Yangilik topilmadi</h1><p>U olib tashlangan yoki hali e\'lon qilinmagan bo\'lishi mumkin.</p><p><a class="btn" href="/#/yangiliklar">Barcha yangiliklar</a></p></div>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(404).send(html);
  }

  const url = L.ORIGIN + '/yangilik/' + id;
  const ni = Number(n.ni) > 0 ? Math.min(Number(n.ni), 5) : 0;
  const img = function (i) { return L.ORIGIN + '/api/rasm?id=' + encodeURIComponent(id) + '&i=' + i; };
  const desc = L.plain(n.body, 200) || 'Maktab yangiliklari';
  const image = ni ? img(0) : L.ORIGIN + '/og-default.png';
  const vid = L.videoEmbed(n.video);
  let others = [];
  try { others = (await L.publishedNews(['title', 'date'], 12)).filter(function (x) { return x.id !== id; }).slice(0, 3); } catch (e) { others = []; }

  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, description: desc, datePublished: n.date || undefined,
    image: ni ? [img(0)] : [L.ORIGIN + '/og-default.png'], mainEntityOfPage: url,
    author: { '@type': 'Organization', name: '28-maktab' },
    publisher: { '@type': 'Organization', name: '28-maktab', logo: { '@type': 'ImageObject', url: L.ORIGIN + '/icons/maktab/icon-512.png' } } };
  const ldTag = '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>';

  const docPath = 'projects/' + L.PROJECT + '/databases/(default)/documents/news/' + id;
  const viewJs = '<script>(function(){try{var k="v_' + id + '_"+new Date().toISOString().slice(0,10);if(localStorage.getItem(k))return;localStorage.setItem(k,"1");' +
    'fetch("https://firestore.googleapis.com/v1/projects/' + L.PROJECT + '/databases/(default)/documents:commit?key=' + L.API_KEY + '",{method:"POST",headers:{"Content-Type":"application/json"},' +
    'body:JSON.stringify({writes:[{transform:{document:"' + docPath + '",fieldTransforms:[{fieldPath:"views",increment:{integerValue:"1"}}]}}]})}).catch(function(){})}catch(e){}})();' +
    'document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=b.getAttribute("data-copy");(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent="Nusxalandi ✓"}).catch(function(){prompt("Havola:",t)})});</script>';

  let inner = '<article class="art"><a class="back" href="/#/yangiliklar">← Yangiliklar</a><div class="meta">' + (n.pinned ? '<span class="chip pin">Muhim</span>' : '') +
    '<span class="chip">' + esc(L.CATS[n.cat] || 'Yangilik') + '</span><span>' + esc(L.fdate(n.date)) + '</span></div><h1>' + esc(n.title) + '</h1>';
  if (ni) inner += '<div class="cover"><a href="' + esc(img(0)) + '" target="_blank" rel="noopener"><img src="' + esc(img(0)) + '" alt="' + esc(n.title) + '"></a></div>';
  inner += '<div class="body">' + L.fmtBody(n.body) + '</div>';
  if (ni > 1) { inner += '<div class="gal">'; for (let i = 1; i < ni; i++) inner += '<a href="' + esc(img(i)) + '" target="_blank" rel="noopener"><img src="' + esc(img(i)) + '" alt="' + esc(n.title) + ' — rasm ' + (i + 1) + '" loading="lazy"></a>'; inner += '</div>'; }
  if (vid) inner += '<div class="vid' + (vid.tg ? ' tg' : '') + '"><iframe src="' + esc(vid.src) + '" title="Video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
  inner += '<div class="share"><a class="btn" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(n.title) + '">Telegram\'da ulashish</a><button type="button" class="btn out" data-copy="' + esc(url) + '">Havolani nusxalash</button></div></article>';
  if (others.length) inner += '<section class="more"><h2>Boshqa yangiliklar</h2>' + others.map(function (o) { return '<a href="/yangilik/' + esc(o.id) + '">' + esc(o.title) + '<small>' + esc(L.fdate(o.date)) + '</small></a>'; }).join('') + '</section>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(shell(n.title + ' · 28-maktab', desc, image, url, ldTag, inner + viewJs));
};

/* 28-maktab: Tun / Kun / Avto rejim moduli
   Ulash: index.html ning <head> qismiga, boshqa skriptlardan OLDIN:
   <script src="theme.js"></script>
*/
(function () {
  var KEY = 'theme-pref';            // 'auto' | 'light' | 'dark'
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function getPref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function setPref(p) {
    try { localStorage.setItem(KEY, p); } catch (e) {}
  }
  function effective(pref) {
    return pref === 'auto' ? (mq.matches ? 'dark' : 'light') : pref;
  }
  function apply(pref) {
    var t = effective(pref);
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.setAttribute('data-theme-pref', pref);
    root.style.colorScheme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = t === 'dark' ? '#121417' : '#ffffff';
    updateButton(pref);
  }

  // Sahifa miltillamasligi uchun darhol qo'llaymiz
  apply(getPref());

  // Qurilma rejimi o'zgarsa va "Avto" tanlangan bo'lsa, kuzatib boramiz
  var onChange = function () { if (getPref() === 'auto') apply('auto'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);

  /* ---------- Uslub ---------- */
  var css = '' +
    /* Tun palitrasi: o'zingizning ranglaringizga moslang */
    ':root[data-theme="dark"]{--bg:#121417;--surface:#1b1f24;--text:#e6e8eb;--muted:#9aa4af;--border:#2e353d;--accent:#4c8dff;}' +
    ':root[data-theme="light"]{--bg:#ffffff;--surface:#f5f6f8;--text:#1b1f24;--muted:#5b6672;--border:#d9dde2;--accent:#1a5fd0;}' +
    ':root[data-theme="dark"] body{background:var(--bg);color:var(--text);}' +
    ':root[data-theme="dark"] input,:root[data-theme="dark"] select,:root[data-theme="dark"] textarea{background:var(--surface);color:var(--text);border-color:var(--border);}' +
    ':root[data-theme="dark"] table,:root[data-theme="dark"] th,:root[data-theme="dark"] td{border-color:var(--border);}' +
    ':root[data-theme="dark"] a{color:var(--accent);}' +
    /* Xat varag'i (A4) har doim oq qoladi */
    ':root[data-theme="dark"] .paper,:root[data-theme="dark"] .sheet,:root[data-theme="dark"] .a4{background:#fff;color:#000;}' +
    /* Tugma */
    '#theme-toggle{position:fixed;right:12px;bottom:12px;z-index:9999;display:flex;gap:2px;padding:3px;border-radius:999px;background:var(--surface,#f5f6f8);border:1px solid var(--border,#d9dde2);box-shadow:0 2px 8px rgba(0,0,0,.2);font:13px system-ui,sans-serif;}' +
    '#theme-toggle button{border:0;background:transparent;color:var(--text,#1b1f24);padding:6px 10px;border-radius:999px;cursor:pointer;font:inherit;}' +
    '#theme-toggle button[aria-pressed="true"]{background:var(--accent,#1a5fd0);color:#fff;}' +
    /* Chop etish va PDF doim kun rejimida */
    '@media print{:root{color-scheme:light !important;}#theme-toggle{display:none !important;}:root[data-theme="dark"] body{background:#fff !important;color:#000 !important;}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- Tugma ---------- */
  var OPTIONS = [
    { v: 'auto', t: '\u2699\uFE0F Avto' },
    { v: 'light', t: '\u2600\uFE0F Kun' },
    { v: 'dark', t: '\uD83C\uDF19 Tun' }
  ];

  function updateButton(pref) {
    var box = document.getElementById('theme-toggle');
    if (!box) return;
    Array.prototype.forEach.call(box.children, function (b) {
      b.setAttribute('aria-pressed', b.dataset.v === pref ? 'true' : 'false');
    });
  }

  function build() {
    if (document.getElementById('theme-toggle')) return;
    var box = document.createElement('div');
    box.id = 'theme-toggle';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Rejim');
    OPTIONS.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.v = o.v;
      b.textContent = o.t;
      b.addEventListener('click', function () { setPref(o.v); apply(o.v); });
      box.appendChild(b);
    });
    document.body.appendChild(box);
    updateButton(getPref());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

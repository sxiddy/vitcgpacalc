// Offline support. Pages, scripts, styles and the subject list are fetched from the network first
// (so updates show straight away) and kept in a cache that is used when there is no connection.
// Account sync (api/) is never cached; js/account.js already retries once the connection is back.
const CACHE = 'vc-v1';
const FILES = [
  './', 'calc', 'cgpa', 'share', 'profile', 'privacy', 'terms',
  'css/style.css', 'data/subjects.json',
  'js/common.js', 'js/merge.js', 'js/account.js', 'js/calc.js', 'js/ui.js', 'js/cgpa.js',
  'js/share.js', 'js/card.js', 'js/qr.js', 'js/profile.js'
];

self.addEventListener('install', e => {
  // one missing file shouldn't stop the rest being cached
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // fonts never change: cache first
  if (fonts) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }

  // everything else: network first, cache when offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    // /calc.html and /calc are the same page
    const clean = url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
    return caches.match(clean).then(h => h || (req.mode === 'navigate' ? caches.match('./') : Response.error()));
  })));
});

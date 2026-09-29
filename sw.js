// Service Worker: makes claim playable offline.
// - Game files (HTML, JS, CSS, icons): network first, cached copy when offline,
//   so updates show up immediately when online. The network request bypasses the
//   browser's HTTP cache (revalidates), so a new index.html never meets old scripts.
//   If the network is slow, the cached copy is served after NET_TIMEOUT_MS and the
//   cache is still refreshed in the background.
// - Voice packs (MP3, one per category and voice): cache first. Their URLs carry a content hash (?v=...), so a
//   regenerated file gets a new URL. js/pwa.js fills this cache in the background.
// - Caches can be shared with other apps on the same origin (e.g. username.github.io),
//   so only our own caches and only entries below our scope are ever deleted.
const CORE_CACHE = 'claim-core-v1';
const VOICE_CACHE = 'claim-voice';
const NET_TIMEOUT_MS = 3000;
const EXTRA_URLS = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

function inScope(url) { return url.startsWith(self.registration.scope); }

// Everything index.html loads (scripts, styles), as absolute URLs
function coreUrls(html) {
  const urls = EXTRA_URLS.slice();
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    if (!/^(https?:|data:)/.test(m[1])) urls.push(m[1]);
  }
  return urls.map(u => new URL(u, self.registration.scope).href);
}

// Remove cached game files that the current index.html no longer loads
async function pruneCore(html) {
  const keep = new Set(coreUrls(html));
  keep.add(new URL('index.html', self.registration.scope).href);
  const cache = await caches.open(CORE_CACHE);
  for (const req of await cache.keys()) {
    const u = req.url.split('?')[0];
    if (inScope(req.url) && !keep.has(u)) await cache.delete(req);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    const res = await fetch('index.html', { cache: 'reload' });
    const html = await res.clone().text();
    await cache.put('index.html', res);
    await Promise.all(coreUrls(html).map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('claim-') && key !== CORE_CACHE && key !== VOICE_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/audio/voice/') && url.pathname.endsWith('.mp3')) {
    event.respondWith((async () => {
      const cache = await caches.open(VOICE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  const isPage = req.mode === 'navigate';
  const network = (async () => {
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) {
      const cache = await caches.open(CORE_CACHE);
      await cache.put(req, res.clone());
      if (isPage) await pruneCore(await res.clone().text());
    }
    return res;
  })();
  event.waitUntil(network.catch(() => {}));

  event.respondWith((async () => {
    const cache = await caches.open(CORE_CACHE);
    const cached = () => cache.match(req, { ignoreSearch: true })
      .then(hit => hit || (isPage ? cache.match('index.html') : undefined));
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), NET_TIMEOUT_MS));
    try {
      const first = await Promise.race([network, timeout]);
      if (first !== 'timeout') return first;
      const hit = await cached();
      return hit || await network; // nothing cached yet: keep waiting for the network
    } catch (err) {
      const hit = await cached();
      if (hit) return hit;
      throw err;
    }
  })());
});

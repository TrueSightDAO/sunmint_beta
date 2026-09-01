// Sunmint offline-capable service worker — network-first, mirroring
// dapp.truesight.me/service-worker.js. Fresh content by default; cached
// copies served only when the network is unreachable, so the farmer app
// still loads in the field with no signal.

const CACHE_NAME = 'sunmint-cache-v2';

const URLS_TO_CACHE = [
  './',
  './index.html',
  './monitor-tree-growth/index.html',
  './limites-da-fazenda/index.html',
  './instrucoes/index.html',
  './instrucoes/send-as-file-tip.png',
  // Data JSONs pre-cached so even a first-ever offline visit has farms/plots.
  // Network-first still serves fresh copies online; these are the offline floor.
  'https://raw.githubusercontent.com/TrueSightDAO/sunmint/main/farms/index.json',
  'https://raw.githubusercontent.com/TrueSightDAO/sunmint/main/plots/index.geojson',
];

// Edgar (DAO API) — never cache. Submissions, signature checks and pings
// must always hit the wire; caching them would let stale/queued state
// masquerade as live.
function isEdgarUrl(url) {
  return url.hostname === 'edgar.truesight.me';
}

// Same-origin GETs are cached under a query-stripped key so cache-buster
// params (?cb=Date.now()) used by the tree-index loader don't defeat the
// offline fallback.
function cacheKeyFor(url) {
  const u = new URL(url.toString());
  // Strip the ?cb=<timestamp> cache-buster for ALL URLs (same-origin AND
  // cross-origin data like raw.githubusercontent.com farms/plots) so the
  // offline fallback can find the cached copy regardless of the buster value.
  if (u.searchParams.has('cb')) u.searchParams.delete('cb');
  return u.toString();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('sunmint-cache-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Edgar API: network-only, never Cache-API.
  if (isEdgarUrl(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Non-GET (submissions etc.): pass straight through.
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const key = cacheKeyFor(url);
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(key, clone));
        return response;
      })
      .catch(() => offlineFallback(request))
  );
});

async function offlineFallback(request) {
  // Exact cache hit first (query-stripped key for same-origin).
  const key = cacheKeyFor(new URL(request.url));
  const hit = await caches.match(key);
  if (hit) return hit;
  // Navigation to a directory path -> its index.html.
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    const sep = url.pathname.endsWith('/') ? '' : '/';
    const idx = url.origin + url.pathname + sep + 'index.html';
    const page = await caches.match(idx);
    if (page) return page;
    return caches.match('./index.html');
  }
  return new Response('', { status: 503, statusText: 'Offline' });
}

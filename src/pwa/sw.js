/* Service worker: makes the app installable and lets it open offline.
   Built by the `service-worker` plugin in vite.config.js, which fills in BUILD and PRECACHE.
   Only the app itself is cached. Profile data (Supabase) always goes to the network. */

const BUILD = "__BUILD__";
const PRECACHE = ["__PRECACHE__"]; // built files, relative to the scope
const SHELL = "mmp-shell-" + BUILD;
const RUNTIME = "mmp-runtime";
const FONTS = "mmp-fonts";
const scope = new URL(self.registration.scope);
const INDEX = new URL("index.html", scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([INDEX, ...PRECACHE.map((p) => new URL(p, scope).href)]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mmp-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (cacheName, req, res) => {
  if (res && res.ok) { const copy = res.clone(); caches.open(cacheName).then((c) => c.put(req, copy)); }
  return res;
};

/* Pages: network first, so a new release shows up straight away; the cached app when offline. */
async function page(req) {
  try {
    return put(SHELL, INDEX, await fetch(req));
  } catch {
    return (await caches.match(INDEX)) || Response.error();
  }
}

/* Hashed build files never change: cache first. */
async function cacheFirst(req, cacheName) {
  return (await caches.match(req)) || put(cacheName, req, await fetch(req));
}

/* Logos, icons, fonts: serve what we have, refresh in the background. */
async function staleWhileRevalidate(req, cacheName) {
  const hit = await caches.match(req);
  const fresh = fetch(req).then((res) => put(cacheName, req, res)).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    if (req.mode === "navigate") return event.respondWith(page(req));
    if (url.pathname.startsWith(scope.pathname + "assets/")) return event.respondWith(cacheFirst(req, SHELL));
    return event.respondWith(staleWhileRevalidate(req, RUNTIME));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    return event.respondWith(staleWhileRevalidate(req, FONTS));
  }
  // anything else (the Supabase API, auth) is left to the network
});

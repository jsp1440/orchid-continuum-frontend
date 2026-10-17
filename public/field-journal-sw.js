// Offline shell for the Orchid Continuum Field Journal (/field).
// Bump the version whenever this file's caching behaviour changes: the new
// worker precaches into its own cache before the old one is deleted, so an
// update never strands an offline device without a complete shell.
const FIELD_JOURNAL_SHELL_CACHE = "orchid-field-journal-shell-v2";
const FIELD_JOURNAL_ROUTES = ["/", "/field"];
const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|svg|png|jpe?g|webp|ico|woff2?|ttf|otf|webmanifest)$/i;
const FIELD_JOURNAL_OPTIONAL_ASSETS = [
  "/field-journal.webmanifest",
  "/field-journal-icon-180.png",
  "/field-journal-icon-192.png",
  "/field-journal-icon-512.png",
  "/calyx-icon.svg",
];

function isCacheableAssetPath(pathname) {
  return pathname.startsWith("/assets/") || STATIC_ASSET_PATTERN.test(pathname);
}

/** Same-origin static assets referenced by the app HTML (hashed Vite JS/CSS, icons, manifest). */
function referencedAssets(html) {
  const urls = new Set();
  const pattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && isCacheableAssetPath(url.pathname)) urls.add(url.pathname);
    } catch {
      // Ignore malformed references; they cannot be required for /field.
    }
  }
  return [...urls];
}

async function precacheShell() {
  const cache = await caches.open(FIELD_JOURNAL_SHELL_CACHE);
  const pages = await Promise.all(
    FIELD_JOURNAL_ROUTES.map(async (route) => {
      const response = await fetch(new Request(route, { cache: "reload" }));
      if (!response.ok) throw new Error(`Field Journal shell ${route} returned ${response.status}`);
      await cache.put(route, response.clone());
      return response.text();
    }),
  );
  // Required: every asset the shell HTML references. If one fails, install
  // fails and the previous worker/cache stays in charge.
  const required = [...new Set(pages.flatMap(referencedAssets))];
  await cache.addAll(required.map((path) => new Request(path, { cache: "reload" })));
  await Promise.all(
    FIELD_JOURNAL_OPTIONAL_ASSETS.filter((path) => !required.includes(path)).map((path) =>
      cache.add(new Request(path, { cache: "reload" })).catch(() => undefined),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("orchid-field-journal-shell-") && key !== FIELD_JOURNAL_SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page reports the same-origin static resources it actually loaded (for
// example lazily imported chunks fetched before this worker controlled it).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "FIELD_JOURNAL_CACHE_URLS" || !Array.isArray(data.urls)) return;
  const paths = new Set();
  for (const value of data.urls.slice(0, 500)) {
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin && !url.pathname.startsWith("/api/") && isCacheableAssetPath(url.pathname)) {
        paths.add(url.pathname + url.search);
      }
    } catch {
      // Ignore malformed URLs.
    }
  }
  event.waitUntil(
    caches.open(FIELD_JOURNAL_SHELL_CACHE).then((cache) =>
      Promise.all(
        [...paths].map(async (path) => {
          if (await cache.match(path)) return;
          await cache.add(path).catch(() => undefined);
        }),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isCacheableAssetPath(url.pathname)) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(FIELD_JOURNAL_SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedPage = await cache.match(request, { ignoreSearch: true });
    return cachedPage || (await cache.match("/field")) || (await cache.match("/")) || Promise.reject(error);
  }
}

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(FIELD_JOURNAL_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

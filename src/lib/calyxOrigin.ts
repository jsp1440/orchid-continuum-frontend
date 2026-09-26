/**
 * calyxOrigin — the ONE decision for "is this request provably addressed to the
 * configured Calyx backend?".
 *
 * Every credential the frontend attaches to Calyx traffic (the owner bearer and
 * cookie-recovery retry in backendConfig's fetch transport, the member Supabase
 * token in memberReadAuth) is gated on this check, so it must never be a string
 * prefix test: `startsWith("https://calyx.example")` also accepts
 * `https://calyx.example.attacker.test/...` and
 * `https://calyx.example@attacker.test/...`.
 *
 * Instead both URLs are parsed with the WHATWG URL parser and compared by
 * scheme, host and port. The request must carry no userinfo, and its path must
 * sit under the configured base path on a segment boundary (base `/calyx`
 * matches `/calyx` and `/calyx/...`, never `/calyxx`).
 *
 * `fetch` does not parse its input stand-alone: it resolves it against the
 * page's base URL. A scheme-relative-looking input such as
 * `https:calyx.example/p` or `https:/calyx.example/p` parses stand-alone as
 * `https://calyx.example/p`, but against an `https:` page it is RELATIVE and
 * fetch sends it to `https://<frontend-origin>/calyx.example/p`. So when a
 * document (or worker location) base exists, the URL is also resolved against
 * it, and it is only Calyx when both parses agree on the exact href: the check
 * then describes where fetch will really send the request.
 *
 * Fail closed: an empty, relative or unparseable base or request URL, a URL
 * whose meaning depends on the page base, or a non-http(s) scheme (whose origin
 * is opaque), is never the Calyx origin.
 *
 * This module is dependency-free on purpose so both backendConfig and
 * memberReadAuth can import it without a cycle.
 */

/**
 * The URL string a fetch input addresses (Request, URL or string), read ONCE.
 * Callers must send this string (or the immutable Request) rather than the
 * original object, so the checked URL is the sent URL. A Request's URL is read
 * through the native `Request.prototype.url` getter, so a subclass overriding
 * `url` cannot report a different URL from the one fetch uses.
 */
export function requestUrlOf(input: RequestInfo | URL): string {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const nativeUrl = Object.getOwnPropertyDescriptor(Request.prototype, 'url')?.get;
    return nativeUrl ? String(nativeUrl.call(input)) : input.url;
  }
  if (input instanceof URL) return input.href;
  return String(input);
}

/**
 * The base URL fetch resolves a request input against: the document base URL
 * (which honours `<base href>`), or a worker's location. Null outside a
 * browsing context (Node), where the stand-alone parse is the only meaning.
 * Throws when a document exists but exposes no base, so the caller fails
 * closed.
 */
function fetchBaseUrl(): string | null {
  const scope = globalThis as { document?: { baseURI?: unknown }; location?: { href?: unknown } };
  if (scope.document) {
    const documentBase = scope.document.baseURI;
    if (typeof documentBase === 'string' && documentBase) return documentBase;
    // A document with no usable base: fetch's resolution is unknown.
    throw new TypeError('document base URL unavailable');
  }
  const locationHref = scope.location?.href;
  if (typeof locationHref === 'string' && locationHref) return locationHref;
  return null;
}

/**
 * The request path relative to the configured Calyx base ("/" for the base
 * itself), or null when `url` is not provably on the Calyx origin under the
 * base path. The query string and fragment are never part of the result.
 */
export function calyxRelativePath(url: string | URL, calyxBase: string): string | null {
  let base: URL;
  let target: URL;
  try {
    if (!calyxBase) return null;
    base = new URL(calyxBase);
    target = new URL(url);
  } catch {
    // A relative or unparseable URL is not provably the Calyx origin.
    return null;
  }
  // Where fetch will actually send it: resolved against the page base. If that
  // differs from the stand-alone parse, the input is base-relative (e.g.
  // `https:calyx.example/p`) and goes to the frontend origin. A page base that
  // cannot be read or parsed fails closed.
  try {
    const pageBase = fetchBaseUrl();
    if (pageBase !== null && new URL(url, pageBase).href !== target.href) return null;
  } catch {
    return null;
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return null;
  if (!base.host) return null;
  if (target.protocol !== base.protocol) return null;
  if (target.host !== base.host) return null;
  if (target.origin !== base.origin) return null;
  if (target.username || target.password) return null;
  const basePath = base.pathname.replace(/\/$/, '');
  if (basePath && !(target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))) {
    return null;
  }
  return target.pathname.slice(basePath.length) || '/';
}

/** Whether `url` is provably addressed to the configured Calyx base. */
export function isCalyxOriginUrl(url: string | URL, calyxBase: string): boolean {
  return calyxRelativePath(url, calyxBase) !== null;
}

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
 * Instead both URLs are parsed with the WHATWG URL parser (the same parser
 * `fetch` uses to decide where a request actually goes) and compared by
 * scheme, host and port. The request must carry no userinfo, and its path must
 * sit under the configured base path on a segment boundary (base `/calyx`
 * matches `/calyx` and `/calyx/...`, never `/calyxx`).
 *
 * Fail closed: an empty, relative or unparseable base or request URL, or a
 * non-http(s) scheme (whose origin is opaque), is never the Calyx origin.
 *
 * This module is dependency-free on purpose so both backendConfig and
 * memberReadAuth can import it without a cycle.
 */

/** The absolute URL string a fetch input addresses (Request, URL or string). */
export function requestUrlOf(input: RequestInfo | URL): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  if (input instanceof URL) return input.href;
  return String(input);
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

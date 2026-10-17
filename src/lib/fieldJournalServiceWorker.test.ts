import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync("public/field-journal-sw.js", "utf8");
const ORIGIN = "https://field.example";
const HTML = `<!doctype html><link rel="manifest" href="/calyx-manifest.webmanifest"><link rel="apple-touch-icon" href="/calyx-icon.svg">
<script type="module" crossorigin src="/assets/index-abc123.js"></script><link rel="stylesheet" crossorigin href="/assets/index-def456.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><script src="https://third.party/x.js"></script>`;

type Handler = (event: { waitUntil: (p: Promise<unknown>) => void; respondWith: (p: Promise<Response>) => void; data?: unknown; request?: Request }) => void;

function loadWorker(existingCaches: string[] = [], network: (input: unknown) => Promise<Response> = async () => new Response(HTML, { status: 200 })) {
  const stores = new Map<string, Map<string, string>>(existingCaches.map((name) => [name, new Map([["/old", "old"]])]));
  const matchOptions: (CacheQueryOptions | undefined)[] = [];
  const keyOf = (request: string | Request) => typeof request === "string" ? request : new URL(request.url).pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (request: string | Request) => { store.set(keyOf(request), "ok"); },
      add: async (request: string | Request) => { store.set(keyOf(request), "ok"); },
      addAll: async (requests: Request[]) => { requests.forEach((request) => store.set(keyOf(request), "ok")); },
      match: async (request: string | Request, options?: CacheQueryOptions) => {
        matchOptions.push(options);
        return store.has(keyOf(request)) ? new Response(`cached:${keyOf(request)}`) : undefined;
      },
    };
  };
  const handlers = new Map<string, Handler>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const caches = { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) };
  const fetch = vi.fn(network);
  const RequestWithOrigin = class extends Request { constructor(input: string, init?: RequestInit) { super(new URL(input, ORIGIN), init); } };
  new Function("self", "caches", "fetch", "Request", SOURCE)(self, caches, fetch, RequestWithOrigin);
  const run = async (type: string, data?: unknown) => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)!({ waitUntil: (p) => { pending = p; }, respondWith: () => undefined, data });
    await pending;
  };
  const navigate = async (path: string) => {
    let response: Promise<Response> | undefined;
    const request = { method: "GET", mode: "navigate", url: `${ORIGIN}${path}` } as unknown as Request;
    handlers.get("fetch")!({ waitUntil: () => undefined, respondWith: (p) => { response = p; }, request });
    return response!;
  };
  const fetchAsset = async (path: string) => {
    let response: Promise<Response> | undefined;
    const request = new RequestWithOrigin(path, { headers: { Origin: ORIGIN } });
    handlers.get("fetch")!({ waitUntil: () => undefined, respondWith: (p) => { response = p; }, request });
    return response;
  };
  return { stores, run, self, navigate, fetchAsset, matchOptions, fetch };
}

describe("Field Journal offline shell service worker", () => {
  it("precaches /field and every same-origin asset its HTML references on install", async () => {
    const worker = loadWorker();
    await worker.run("install");
    const cached = [...worker.stores.get("orchid-field-journal-shell-v2")!.keys()];
    expect(cached).toEqual(expect.arrayContaining(["/", "/field", "/assets/index-abc123.js", "/assets/index-def456.css", "/calyx-icon.svg", "/calyx-manifest.webmanifest", "/field-journal-icon-180.png"]));
    expect(cached.some((key) => key.includes("googleapis") || key.includes("third.party"))).toBe(false);
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it("deletes only superseded Field Journal caches after the new shell is ready", async () => {
    const worker = loadWorker(["orchid-field-journal-shell-v1", "unrelated-cache"]);
    await worker.run("install");
    await worker.run("activate");
    expect([...worker.stores.keys()].sort()).toEqual(["orchid-field-journal-shell-v2", "unrelated-cache"]);
  });

  it("caches only same-origin static URLs reported by the page", async () => {
    const worker = loadWorker();
    await worker.run("message", { type: "FIELD_JOURNAL_CACHE_URLS", urls: [`${ORIGIN}/assets/lazy-1.js`, `${ORIGIN}/api/field-observations`, "https://evil.example/x.js", `${ORIGIN}/field`, 42] });
    expect([...worker.stores.get("orchid-field-journal-shell-v2")!.keys()]).toEqual(["/assets/lazy-1.js"]);
  });

  it("stores navigations only under fixed shell keys (never ?code= URLs)", async () => {
    const worker = loadWorker();
    await worker.navigate("/field?code=one-time-secret");
    await worker.navigate("/atlas");
    await worker.navigate("/");
    expect([...worker.stores.get("orchid-field-journal-shell-v2")!.keys()].sort()).toEqual(["/", "/field"]);
  });

  it("falls back to the cached shell when the network stalls or fails", async () => {
    vi.useFakeTimers();
    try {
      const stalled = loadWorker([], () => new Promise<Response>(() => undefined));
      (await caches(stalled)).put("/field");
      const pending = stalled.navigate("/field?source=home-screen");
      await vi.advanceTimersByTimeAsync(4000);
      expect(await (await pending).text()).toBe("cached:/field");
    } finally {
      vi.useRealTimers();
    }
    const offline = loadWorker([], async () => { throw new TypeError("offline"); });
    (await caches(offline)).put("/");
    expect(await (await offline.navigate("/field")).text()).toBe("cached:/");
  });
  it("serves a cached module script offline even when the host varies on Origin", async () => {
    // A module script carries an Origin header; the install-time copy has none.
    // Without ignoreVary a "Vary: Origin" response never matches offline.
    const worker = loadWorker();
    await worker.run("install");
    worker.fetch.mockImplementation(async () => { throw new TypeError("offline"); });
    worker.matchOptions.length = 0;
    const response = await worker.fetchAsset("/assets/index-abc123.js");
    expect(response).toBeDefined();
    expect(await response!.text()).toBe("cached:/assets/index-abc123.js");
    expect(worker.matchOptions.length).toBeGreaterThan(0);
    expect(worker.matchOptions.every((options) => options?.ignoreVary === true)).toBe(true);
  });
});

async function caches(worker: ReturnType<typeof loadWorker>) {
  if (!worker.stores.has("orchid-field-journal-shell-v2")) worker.stores.set("orchid-field-journal-shell-v2", new Map());
  const store = worker.stores.get("orchid-field-journal-shell-v2")!;
  return { put: (key: string) => store.set(key, "ok") };
}

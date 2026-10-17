import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync("public/field-journal-sw.js", "utf8");
const ORIGIN = "https://field.example";
const HTML = `<!doctype html><link rel="manifest" href="/calyx-manifest.webmanifest"><link rel="apple-touch-icon" href="/calyx-icon.svg">
<script type="module" crossorigin src="/assets/index-abc123.js"></script><link rel="stylesheet" crossorigin href="/assets/index-def456.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><script src="https://third.party/x.js"></script>`;

type Handler = (event: { waitUntil: (p: Promise<unknown>) => void; data?: unknown }) => void;

function loadWorker(existingCaches: string[] = []) {
  const stores = new Map<string, Map<string, string>>(existingCaches.map((name) => [name, new Map([["/old", "old"]])]));
  const keyOf = (request: string | Request) => typeof request === "string" ? request : new URL(request.url).pathname;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (request: string | Request) => { store.set(keyOf(request), "ok"); },
      add: async (request: string | Request) => { store.set(keyOf(request), "ok"); },
      addAll: async (requests: Request[]) => { requests.forEach((request) => store.set(keyOf(request), "ok")); },
      match: async (request: string) => store.get(keyOf(request)),
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
  const fetch = vi.fn(async () => new Response(HTML, { status: 200 }));
  const RequestWithOrigin = class extends Request { constructor(input: string, init?: RequestInit) { super(new URL(input, ORIGIN), init); } };
  new Function("self", "caches", "fetch", "Request", SOURCE)(self, caches, fetch, RequestWithOrigin);
  const run = async (type: string, data?: unknown) => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.get(type)!({ waitUntil: (p) => { pending = p; }, data });
    await pending;
  };
  return { stores, run, self };
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
});

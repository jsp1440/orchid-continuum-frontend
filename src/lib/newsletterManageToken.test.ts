import { describe, expect, it } from "vitest";
import { forgetManageToken, manageTokenStorageKey, readManageToken, rememberManageToken } from "./newsletterManageToken";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class BrokenStorage {
  getItem(): string | null { throw new Error("blocked"); }
  setItem(): void { throw new Error("blocked"); }
  removeItem(): void { throw new Error("blocked"); }
}

describe("newsletter manage token", () => {
  it("remembers a token per normalised address and reads it back", () => {
    const store = new MemoryStorage();
    expect(rememberManageToken("  Reader@Example.ORG ", "tok-1", store)).toBe(true);
    expect(readManageToken("reader@example.org", store)).toBe("tok-1");
    expect(readManageToken("other@example.org", store)).toBeNull();
    expect(manageTokenStorageKey("Reader@Example.ORG")).toBe(manageTokenStorageKey("reader@example.org"));
  });

  it("stores nothing when the backend issued no token or the token is malformed", () => {
    const store = new MemoryStorage();
    expect(rememberManageToken("reader@example.org", null, store)).toBe(false);
    expect(rememberManageToken("reader@example.org", undefined, store)).toBe(false);
    expect(rememberManageToken("reader@example.org", "x".repeat(121), store)).toBe(false);
    expect(rememberManageToken("", "tok-1", store)).toBe(false);
    expect(store.values.size).toBe(0);
  });

  it("forgets a token and fails closed when storage is blocked", () => {
    const store = new MemoryStorage();
    rememberManageToken("reader@example.org", "tok-1", store);
    forgetManageToken("reader@example.org", store);
    expect(readManageToken("reader@example.org", store)).toBeNull();
    const broken = new BrokenStorage();
    expect(rememberManageToken("reader@example.org", "tok-1", broken)).toBe(false);
    expect(readManageToken("reader@example.org", broken)).toBeNull();
    expect(() => forgetManageToken("reader@example.org", broken)).not.toThrow();
    expect(readManageToken("reader@example.org", null)).toBeNull();
  });
});

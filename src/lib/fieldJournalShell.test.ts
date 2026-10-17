import { afterEach, describe, expect, it, vi } from "vitest";
import { isFieldJournalPath, registerFieldJournalShell, resetFieldJournalShellForTests } from "./fieldJournalShell";

afterEach(() => resetFieldJournalShellForTests());

function fakeNavigator() {
  const active = { postMessage: vi.fn() };
  const register = vi.fn().mockResolvedValue({});
  return {
    nav: { serviceWorker: { register, ready: Promise.resolve({ active }) } } as unknown as Navigator,
    register,
    active,
  };
}

describe("Field Journal offline shell registration", () => {
  it("is scoped to the Field Journal route", () => {
    expect(isFieldJournalPath("/field")).toBe(true);
    expect(isFieldJournalPath("/field/")).toBe(true);
    expect(isFieldJournalPath("/fieldwork")).toBe(false);
    expect(isFieldJournalPath("/matrix")).toBe(false);
    expect(isFieldJournalPath("/")).toBe(false);
  });

  it("does nothing outside production builds or without service workers", () => {
    const { nav, register } = fakeNavigator();
    expect(registerFieldJournalShell(nav, false)).toBeNull();
    expect(registerFieldJournalShell({} as Navigator, true)).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers the shell once and hands it the loaded assets", async () => {
    const { nav, register, active } = fakeNavigator();
    const first = registerFieldJournalShell(nav, true);
    const second = registerFieldJournalShell(nav, true);
    expect(second).toBe(first);
    await first;
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/field-journal-sw.js");
    expect(active.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "FIELD_JOURNAL_CACHE_URLS" }));
  });

  it("allows a retry after a failed registration", async () => {
    const { nav, register } = fakeNavigator();
    register.mockRejectedValueOnce(new Error("blocked"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await registerFieldJournalShell(nav, true);
    expect(warn).toHaveBeenCalled();
    await registerFieldJournalShell(nav, true);
    expect(register).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnerAccessCodeForm from "./OwnerAccessCodeForm";
import FieldSyncOwnerSignIn from "@/components/field/FieldSyncOwnerSignIn";

/**
 * The shared owner access-code form: signs in with the code, clears it after
 * every attempt, shows a failure inline, and writes nothing anywhere.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = "correct-horse-battery-staple-7731";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const input = (id = "field-sync-owner-access-code") => container.querySelector<HTMLInputElement>(`#${id}`)!;
const form = () => container.querySelector("form")!;

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => { form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
}

describe("OwnerAccessCodeForm", () => {
  it("is a labelled password field and a submit button", () => {
    act(() => root.render(<OwnerAccessCodeForm onSignedIn={() => {}} signIn={async () => ({})} />));
    expect(input().type).toBe("password");
    expect(container.querySelector('label[for="field-sync-owner-access-code"]')?.textContent).toBe("Owner access code");
    expect(form().getAttribute("aria-labelledby")).toBe("field-sync-owner-sign-in-heading");
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Sign in for sync");
  });

  it("signs in with the entered code, clears it and reports success once", async () => {
    const signIn = vi.fn(async (_code: string) => ({}));
    const onSignedIn = vi.fn();
    act(() => root.render(<OwnerAccessCodeForm onSignedIn={onSignedIn} signIn={signIn} />));
    type(input(), CODE);
    expect(input().value).toBe(CODE);
    await submit();
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith(CODE);
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(input().value).toBe("");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a failure inline, clears the code and does not report success", async () => {
    const signIn = vi.fn(async (_code: string) => { throw new Error("Calyx backend 401: Invalid owner access code"); });
    const onSignedIn = vi.fn();
    act(() => root.render(<OwnerAccessCodeForm onSignedIn={onSignedIn} signIn={signIn} />));
    type(input(), CODE);
    await submit();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(input().value).toBe("");
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Calyx backend 401: Invalid owner access code");
    expect(container.textContent).not.toContain(CODE);
  });

  it("can word a failure from the backend's own detail", async () => {
    const signIn = async () => { throw new Error("Calyx backend 503: Owner access is not configured"); };
    act(() => root.render(<OwnerAccessCodeForm onSignedIn={() => {}} signIn={signIn} formatFailure={(m) => m.replace(/^Calyx backend \d+:\s*/, "")} />));
    type(input(), CODE);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Owner access is not configured");
  });

  it("does nothing for an empty code, and clears it", async () => {
    const signIn = vi.fn(async () => ({}));
    act(() => root.render(<OwnerAccessCodeForm onSignedIn={() => {}} signIn={signIn} />));
    type(input(), "   ");
    await submit();
    expect(signIn).not.toHaveBeenCalled();
    expect(input().value).toBe("");
  });

  it("writes the code nowhere: no storage, no address, no console", async () => {
    const setLocal = vi.spyOn(Storage.prototype, "setItem");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
    const before = window.location.href;
    for (const outcome of ["ok", "fail"]) {
      const signIn = async () => { if (outcome === "fail") throw new Error("Invalid owner access code"); return {}; };
      act(() => root.render(<OwnerAccessCodeForm onSignedIn={() => {}} signIn={signIn} />));
      type(input(), CODE);
      await submit();
    }
    expect(setLocal).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
  });
});

describe("FieldSyncOwnerSignIn (now the shared form)", () => {
  it("keeps its ids, words and failure text exactly", async () => {
    const signIn = vi.fn(async () => { throw new Error("The backend said no."); });
    act(() => root.render(<FieldSyncOwnerSignIn onSignedIn={() => {}} signIn={signIn} />));
    expect(container.querySelector("#field-sync-owner-sign-in-heading")?.textContent?.trim()).toBe("Owner sign-in needed to sync");
    expect(container.querySelector("p")?.textContent).toBe("The field backend rejected this app's session. Enter the Mission Control owner access code, then sync again. Your observations and originals stay on this iPad either way.");
    expect(input().autocomplete).toBe("current-password");
    expect(input().placeholder).toBe("Owner access code");
    type(input(), CODE);
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("The backend said no.");
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Sign in for sync");
  });
});

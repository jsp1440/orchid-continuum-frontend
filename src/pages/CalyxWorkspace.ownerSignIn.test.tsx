// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The owner access code is typed on the Calyx page itself. A send refused for
 * missing authentication offers the form; after a successful sign-in the alert
 * is gone and the question the owner typed is still in the box.
 */

const mocks = vi.hoisted(() => ({
  loadCalyxWorkspace: vi.fn(),
  createCalyxConversation: vi.fn(),
  getCalyxConversation: vi.fn(),
  listCalyxConversations: vi.fn(),
  sendCalyxTurn: vi.fn(),
  getBrainMission: vi.fn(),
  createOwnerSession: vi.fn(),
  pushTranscript: (_text: string): void => undefined,
}));

vi.mock("@/hooks/useCalyxSpeechInput", () => ({
  useCalyxSpeechInput: (onResult: (transcript: string) => void) => {
    mocks.pushTranscript = onResult;
    return { state: "unsupported", interimTranscript: "", error: null, startListening: vi.fn(), stopListening: vi.fn() };
  },
}));
vi.mock("@/hooks/useCalyxSpeechOutput", () => ({
  useCalyxSpeechOutput: () => ({ speak: vi.fn(), cancel: vi.fn(), supported: false }),
}));
vi.mock("@/lib/ownerOperationsConsole", () => ({ createOwnerSession: mocks.createOwnerSession }));
vi.mock("@/lib/calyxWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/calyxWorkspace")>("@/lib/calyxWorkspace");
  return {
    ...actual,
    loadCalyxWorkspace: mocks.loadCalyxWorkspace,
    createCalyxConversation: mocks.createCalyxConversation,
    getCalyxConversation: mocks.getCalyxConversation,
    listCalyxConversations: mocks.listCalyxConversations,
    sendCalyxTurn: mocks.sendCalyxTurn,
    getBrainMission: mocks.getBrainMission,
  };
});

import { CalyxApiError } from "@/lib/calyxWorkspace";
import CalyxWorkspace from "./CalyxWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

const QUESTION = "Which insects are recorded for the pollination of Catasetum barbatum?";
const CODE = "owner-code-4417-xyz";
const REFUSAL = "Owner session or API key is required";

const snapshot = (orchestratorState: "available" | "authentication_required" | "unavailable") => ({
  capabilities: null, homepage: null, orchestrator: null, orchestratorState, errors: [] as string[],
});
const conversation = { conversation_id: "c1", project_id: "calyx-speak", created_at: "2026-11-18T00:00:00Z", updated_at: "2026-11-18T00:00:00Z", messages: [], persistence_mode: "memory" };

async function flush(times = 1) {
  for (let i = 0; i < times; i += 1) await act(async () => { await Promise.resolve(); });
}

describe("CalyxWorkspace owner sign-in on the page", () => {
  let container: HTMLDivElement;
  let root: Root;

  const textarea = () => container.querySelector<HTMLTextAreaElement>("#calyx-message")!;
  const codeField = () => container.querySelector<HTMLInputElement>("#calyx-owner-access-code");
  const alerts = () => Array.from(container.querySelectorAll('[role="alert"]')).map((el) => el.textContent ?? "");
  const disclosure = () => container.querySelector<HTMLDetailsElement>('[data-testid="calyx-owner-sign-in"]');

  async function render(state: "available" | "authentication_required" | "unavailable" = "unavailable") {
    mocks.loadCalyxWorkspace.mockResolvedValue(snapshot(state));
    await act(async () => { root.render(<MemoryRouter><CalyxWorkspace /></MemoryRouter>); });
    await flush(3);
  }
  async function sendRefused() {
    await act(async () => { mocks.pushTranscript(QUESTION); });
    await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush(4);
  }
  async function signIn(code: string) {
    const el = codeField()!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(el, code); el.dispatchEvent(new Event("input", { bubbles: true })); });
    const form = el.closest("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush(4);
  }

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    for (const mock of Object.values(mocks)) if (typeof mock === "function" && "mockReset" in mock) (mock as ReturnType<typeof vi.fn>).mockReset();
    mocks.listCalyxConversations.mockRejectedValue(new CalyxApiError("authentication_required", REFUSAL, 401));
    mocks.createCalyxConversation.mockResolvedValue(conversation);
    mocks.sendCalyxTurn.mockRejectedValue(new CalyxApiError("authentication_required", REFUSAL, 401));
    mocks.createOwnerSession.mockResolvedValue({ authenticated: true, token: "cookie" });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it("shows no owner form to a page that has not been refused and does not know it is signed out", async () => {
    await render("unavailable");
    expect(disclosure()).toBeNull();
    expect(codeField()).toBeNull();
  });

  it("offers the form, closed, when the page already knows it is not signed in", async () => {
    await render("authentication_required");
    expect(disclosure()).not.toBeNull();
    expect(disclosure()!.open).toBe(false);
    expect(disclosure()!.querySelector("summary")?.textContent).toBe("Owner sign-in");
  });

  it("a send refused for missing authentication shows the form open, with the refusal and the question kept", async () => {
    await render();
    await sendRefused();
    expect(alerts().some((text) => text.includes(REFUSAL))).toBe(true);
    expect(disclosure()!.open).toBe(true);
    expect(codeField()!.type).toBe("password");
    expect(container.querySelector('label[for="calyx-owner-access-code"]')?.textContent).toBe("Owner access code");
    expect(textarea().value).toBe(QUESTION);
  });

  it("after a successful sign-in the alert is gone and the typed question is still there", async () => {
    await render();
    await sendRefused();
    await signIn(CODE);
    expect(mocks.createOwnerSession).toHaveBeenCalledTimes(1);
    expect(mocks.createOwnerSession).toHaveBeenCalledWith(CODE);
    expect(alerts().some((text) => text.includes(REFUSAL))).toBe(false);
    expect(container.textContent).toContain("Signed in as owner. Your question is still in the box; tap Send.");
    expect(textarea().value).toBe(QUESTION);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1); // signing in did not send anything
    expect(window.localStorage.getItem("calyx_owner_session_bearer_v1")).toBeNull();
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(CODE);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(CODE);
  });

  it("then Send sends the same question", async () => {
    await render();
    await sendRefused();
    await signIn(CODE);
    mocks.sendCalyxTurn.mockRejectedValue(new Error("stop here"));
    await act(async () => { container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await flush(4);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(2);
    expect(mocks.sendCalyxTurn.mock.calls[1][1].message).toBe(QUESTION);
  });

  it("a wrong code is shown inline in the backend's words; the code is cleared; the refusal stays; nothing is sent", async () => {
    mocks.createOwnerSession.mockRejectedValue(new Error("Calyx backend 401: Invalid owner access code"));
    await render();
    await sendRefused();
    await signIn(CODE);
    expect(alerts()).toContain("Invalid owner access code");
    expect(alerts().some((text) => text.includes(REFUSAL))).toBe(true);
    expect(codeField()!.value).toBe("");
    expect(container.textContent).not.toContain(CODE);
    expect(container.textContent).not.toContain("Signed in as owner");
    expect(textarea().value).toBe(QUESTION);
    expect(mocks.sendCalyxTurn).toHaveBeenCalledTimes(1);
  });

  it("shows the backend's own sentence when sign-in is not configured", async () => {
    mocks.createOwnerSession.mockRejectedValue(new Error("Calyx backend 503: Owner access is not configured"));
    await render();
    await sendRefused();
    await signIn(CODE);
    expect(alerts()).toContain("Owner access is not configured");
  });
});

// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFieldObservation, type FieldObservation } from "@/lib/fieldJournal";
import { listFieldObservations, saveFieldObservation } from "@/lib/fieldJournalStore";
import { discardSavedFieldObservation } from "@/lib/fieldJournalCoordinator";
import CalyxField from "./CalyxField";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "observer" } }) }));
vi.mock("@/lib/fieldJournalStore", () => ({ listFieldObservations: vi.fn(), saveFieldObservation: vi.fn() }));
vi.mock("@/lib/fieldJournalCoordinator", () => ({
  discardSavedFieldObservation: vi.fn(), editSavedFieldObservation: vi.fn(),
  recoverSavedFieldObservation: async (row: FieldObservation) => row,
  restoreFieldObservationFromBackup: vi.fn(), syncSavedFieldObservation: vi.fn(),
}));
vi.mock("@/lib/fieldJournalShell", () => ({ registerFieldJournalShell: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let observation: FieldObservation;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  observation = createFieldObservation({ accountId: "observer", note: "Keep my original field notes", localityVisibility: "private" }, {
    id: "draft", now: "2026-10-17T00:00:00.000Z",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function render() {
  vi.mocked(listFieldObservations).mockResolvedValue([observation]);
  await act(async () => { root.render(<CalyxField />); });
}
async function clickDiscard() {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Discard observation"]');
  expect(button).not.toBeNull();
  await act(async () => { button!.click(); });
}

describe("Field Journal discard safety", () => {
  it("keeps the draft when the destructive confirmation is cancelled", async () => {
    await render();
    await clickDiscard();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("original photos/videos"));
    expect(discardSavedFieldObservation).not.toHaveBeenCalled();
    expect(container.textContent).toContain(observation.note);
  });
  it("discards only the confirmed draft through the existing locked coordinator", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    await render();
    await clickDiscard();
    expect(discardSavedFieldObservation).toHaveBeenCalledExactlyOnceWith(observation);
    expect(container.textContent).not.toContain(observation.note);
  });
  it("retains the card and shows the coordinator error if another tab changed it", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(discardSavedFieldObservation).mockRejectedValueOnce(new Error("Its local originals were retained."));
    await render();
    await clickDiscard();
    expect(container.textContent).toContain(observation.note);
    expect(container.textContent).toContain("Its local originals were retained.");
  });
  it.each(["syncing", "accepted"])("disables discard for %s records", async (state) => {
    observation = state === "syncing" ? { ...observation, syncStatus: "syncing" } :
      { ...observation, serverId: "server-accepted", syncStatus: "failed" };
    await render();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Discard observation"]')?.disabled).toBe(true);
    await clickDiscard();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(discardSavedFieldObservation).not.toHaveBeenCalled();
  });
});

async function fillNote() {
  const input = container.querySelector<HTMLTextAreaElement>('#field-note')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'A new offline observation');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function saveButton() {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save observation')!;
}

describe("Field Journal save ownership", () => {
  beforeEach(() => { vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false); });

  it("persists one draft for rapid repeated save taps and disables editing until it settles", async () => {
    let finish!: (row: FieldObservation) => void;
    vi.mocked(saveFieldObservation).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await fillNote();
    const button = saveButton();
    await act(async () => { button.click(); button.click(); });
    expect(saveFieldObservation).toHaveBeenCalledTimes(1);
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    expect(container.textContent).toContain('Saving on this device…');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Discard observation"]')?.disabled).toBe(true);
    const saved = vi.mocked(saveFieldObservation).mock.calls[0][0];
    await act(async () => { finish(saved); });
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    expect(container.querySelector<HTMLTextAreaElement>('#field-note')?.value).toBe('');
    expect(container.textContent).toContain('A new offline observation');
  });

  it("keeps the entered note and permits retry after a storage failure", async () => {
    vi.mocked(saveFieldObservation).mockRejectedValueOnce(new Error('Storage is full'));
    await render();
    await fillNote();
    await act(async () => { saveButton().click(); });
    expect(container.textContent).toContain('Storage is full');
    expect(container.querySelector<HTMLTextAreaElement>('#field-note')?.value).toBe('A new offline observation');
    expect(container.querySelector('fieldset')?.disabled).toBe(false);
    vi.mocked(saveFieldObservation).mockImplementationOnce(async (row) => row);
    await act(async () => { saveButton().click(); });
    expect(saveFieldObservation).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('Observation saved offline');
  });
});

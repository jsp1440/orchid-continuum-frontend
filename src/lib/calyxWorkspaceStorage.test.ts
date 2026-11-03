// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEY } from "@/lib/calyxConversation";
import {
  clearCalyxWorkspacePreferences,
  readCalyxWorkspacePreferences,
  writeCalyxWorkspacePreferences,
} from "./calyxWorkspaceStorage";

describe("CALYX workspace preference storage", () => {
  let localStorageDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    window.localStorage.clear();
  });

  afterEach(() => {
    if (localStorageDescriptor) {
      Object.defineProperty(window, "localStorage", localStorageDescriptor);
    } else {
      delete (window as Partial<Window>).localStorage;
    }
  });

  it("round-trips the saved conversation, project, and speech preferences", () => {
    const preferences = { conversationId: "conversation-1", projectId: "project-1", speakReplies: true };

    expect(writeCalyxWorkspacePreferences(preferences)).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(preferences));
    expect(readCalyxWorkspacePreferences()).toEqual(preferences);
    expect(clearCalyxWorkspacePreferences()).toBe(true);
    expect(readCalyxWorkspacePreferences()).toEqual({});
  });

  it("rejects malformed or non-object saved preferences", () => {
    window.localStorage.setItem(STORAGE_KEY, "{");
    expect(readCalyxWorkspacePreferences()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, "[]");
    expect(readCalyxWorkspacePreferences()).toBeNull();
  });

  it("keeps the workspace usable when browser storage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("Storage is unavailable", "SecurityError");
      },
    });

    expect(readCalyxWorkspacePreferences()).toBeNull();
    expect(writeCalyxWorkspacePreferences({ projectId: "project-1" })).toBe(false);
    expect(clearCalyxWorkspacePreferences()).toBe(false);
  });
});

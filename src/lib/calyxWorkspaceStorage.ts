import { STORAGE_KEY } from "@/lib/calyxConversation";

export type CalyxWorkspacePreferences = {
  conversationId?: string;
  projectId?: string;
  speakReplies?: boolean;
};

export function readCalyxWorkspacePreferences(): CalyxWorkspacePreferences | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as CalyxWorkspacePreferences
      : null;
  } catch {
    return null;
  }
}

export function writeCalyxWorkspacePreferences(preferences: CalyxWorkspacePreferences): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function clearCalyxWorkspacePreferences(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

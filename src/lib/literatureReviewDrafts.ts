import { useCallback, useEffect, useRef, useState } from "react";
import { getServerDraft, putServerDraft } from "@/lib/literatureReviewApi";

/**
 * Review drafts autosave.
 *
 * Before a reviewer has a token, drafts live only in this browser's
 * localStorage. Once a token exists, drafts are saved on the server per
 * (reviewer, item) through the literature-review client, and the browser copy
 * for that item is removed after the server confirms the save. Drafts are
 * separate from submissions: submitting never deletes a draft.
 *
 * A draft is loaded once per item. When the token appears (first
 * registration) or is forgotten, the in-memory draft — including the
 * close-read reveal state — is kept and saved to the new destination; it is
 * never replaced by a server 404 or an empty/blocked browser store.
 */

export const LOCAL_DRAFT_PREFIX = "oc.literatureReview.draft.v1:";

export function readLocalDraft<T>(itemId: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(`${LOCAL_DRAFT_PREFIX}${itemId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(itemId: string, draft: unknown): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(`${LOCAL_DRAFT_PREFIX}${itemId}`, JSON.stringify(draft));
  } catch {
    // Storage blocked or full: the draft stays in page state only.
  }
}

export function removeLocalDraft(itemId: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(`${LOCAL_DRAFT_PREFIX}${itemId}`);
  } catch {
    // Non-fatal.
  }
}

export type DraftStatus = "loading" | "idle" | "saving" | "saved_local" | "saved_server" | "save_failed";

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  loading: "Loading your draft…",
  idle: "",
  saving: "Saving draft…",
  saved_local: "Draft saved in this browser",
  saved_server: "Draft saved",
  save_failed: "Draft could not be saved to the server; a copy is kept in this browser",
};

/**
 * `empty` is merged under a stored draft, so an older draft missing a newer
 * field still loads.
 */
export function useReviewDraft<T extends object>(
  itemId: string | null,
  token: string | null,
  empty: T,
  delayMs = 800,
): { draft: T; setDraft: (next: T) => void; status: DraftStatus; loaded: boolean } {
  const [draft, setDraftState] = useState<T>(empty);
  const [status, setStatus] = useState<DraftStatus>("loading");
  const [loaded, setLoaded] = useState(false);
  const emptyRef = useRef(empty);
  const draftRef = useRef<T>(empty);
  const dirty = useRef(false);
  const tokenRef = useRef(token);
  const loadedFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback((id: string, withToken: string | null, value: T) => {
    if (!withToken) {
      writeLocalDraft(id, value);
      setStatus("saved_local");
      return;
    }
    setStatus("saving");
    putServerDraft(withToken, id, value)
      .then(() => {
        removeLocalDraft(id);
        setStatus("saved_server");
      })
      .catch(() => {
        writeLocalDraft(id, value);
        setStatus("save_failed");
      });
  }, []);

  // Load once per item. Token changes are handled below without reloading.
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    const controller = new AbortController();
    loadedFor.current = null;
    dirty.current = false;
    setLoaded(false);
    setStatus("loading");
    const local = readLocalDraft<Partial<T>>(itemId);
    const apply = (stored: Partial<T> | null) => {
      if (cancelled) return;
      const value = { ...emptyRef.current, ...(stored ?? {}) } as T;
      draftRef.current = value;
      setDraftState(value);
      setStatus("idle");
      setLoaded(true);
      loadedFor.current = itemId;
    };
    const atLoad = tokenRef.current;
    if (!atLoad) {
      apply(local);
    } else {
      getServerDraft(atLoad, itemId, controller.signal)
        .then((server) => apply(server && typeof server === "object" ? (server as Partial<T>) : local))
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          apply(local);
        });
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [itemId]);

  // Token appeared or was forgotten: keep the in-memory draft and flush it
  // (including any pending autosave) to the new destination.
  useEffect(() => {
    if (tokenRef.current === token) return;
    tokenRef.current = token;
    if (!itemId || loadedFor.current !== itemId) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirty.current) save(itemId, token, draftRef.current);
  }, [token, itemId, save]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setDraft = useCallback(
    (next: T) => {
      draftRef.current = next;
      dirty.current = true;
      setDraftState(next);
      if (!itemId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        save(itemId, tokenRef.current, next);
      }, delayMs);
    },
    [itemId, delayMs, save],
  );

  return { draft, setDraft, status, loaded };
}

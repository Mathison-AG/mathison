"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "mathison-has-installed-app";

function getSnapshot(): boolean {
  return !localStorage.getItem(STORAGE_KEY);
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/**
 * Track whether the current install is the user's first.
 * Uses localStorage to persist across page navigations.
 */
export function useFirstInstall() {
  const isFirstInstall = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const markInstalled = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  return { isFirstInstall, markInstalled };
}

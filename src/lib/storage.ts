import { useCallback, useEffect, useState } from "react";

/** Local keys used by the MVP (browser-only persistence, no account yet). */
export const STORAGE_KEYS = {
  threads: "debs.threads.v1",
  workshop: "debs.workshop.v1",
  games: "debs.games.v1",
  profile: "debs.profile.v1",
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: ignore */
  }
}

/** Hydration-safe persisted state: renders `initial` on the server, then loads from localStorage. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(readStorage(key, initial));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeStorage(key, v);
        return v;
      });
    },
    [key],
  );

  return [value, update, ready] as const;
}

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

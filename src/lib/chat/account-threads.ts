import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/storage";
import { seedThreads, type Thread } from "@/lib/chat/threads";

export function accountThreadsStorageKey(userId: string | null): string {
  return `${STORAGE_KEYS.threads}.account.${userId ?? "signed-out"}`;
}

/**
 * Keeps browser-cached conversations isolated by the authenticated Supabase user.
 * The previous shared key is intentionally not migrated because its owner is unknown.
 */
export function useAccountThreads() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    let authEventObserved = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventObserved = true;
      if (!active) return;
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active || authEventObserved) return;
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    }).catch(() => {
      if (!active || authEventObserved) return;
      setUserId(null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const key = accountThreadsStorageKey(userId);
  const [stored, setStored] = useState<{ key: string; value: Thread[] }>({
    key: "",
    value: seedThreads,
  });

  useEffect(() => {
    setStored({ key, value: readStorage(key, seedThreads) });
  }, [key]);

  const threads = stored.key === key ? stored.value : seedThreads;
  const setThreads = useCallback((next: Thread[] | ((previous: Thread[]) => Thread[])) => {
    setStored((previous) => {
      const current = previous.key === key ? previous.value : seedThreads;
      const value = typeof next === "function" ? next(current) : next;
      writeStorage(key, value);
      return { key, value };
    });
  }, [key]);

  return [threads, setThreads, authReady && stored.key === key, userId] as const;
}

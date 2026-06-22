"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { Notification } from "@/types/notifications";

export function useNotifications() {
  const getTokenRef = useStableToken();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const initialLoadedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) {
      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setInitialLoaded(true);
      }
      return;
    }

    const [notifsRes, countRes] = await Promise.all([
      fetchWithClerkAuth("/api/notifications", token),
      fetchWithClerkAuth("/api/notifications/unread-count", token),
    ]);

    if (notifsRes.ok) {
      const data: Notification[] = await notifsRes.json();
      setNotifications(data);
    }
    if (countRes.ok) {
      const data = await countRes.json();
      setUnreadCount(data.count ?? 0);
    }

    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      setInitialLoaded(true);
    }
  }, [getTokenRef]);

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      const token = await getTokenRef.current();
      if (!token) return;
      await fetchWithClerkAuth(`/api/notifications/${id}/read`, token, {
        method: "PATCH",
      });
    },
    [getTokenRef],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    const token = await getTokenRef.current();
    if (!token) return;
    await fetchWithClerkAuth("/api/notifications/read-all", token, {
      method: "PATCH",
    });
  }, [getTokenRef]);

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = async () => {
      await fetchAll();
      if (mounted) {
        intervalId = setInterval(() => void fetchAll(), 60_000);
      }
    };

    void startPolling();

    return () => {
      mounted = false;
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [fetchAll]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchAll]);

  return {
    notifications,
    unreadCount,
    loading: !initialLoaded,
    markAsRead,
    markAllAsRead,
    refetch: fetchAll,
  };
}

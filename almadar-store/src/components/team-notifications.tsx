"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function TeamNotifications() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/team?view=unread", { cache: "no-store" });
      const result = await response.json() as { success?: boolean; count?: number };
      if (!response.ok || !result.success || typeof result.count !== "number") throw new Error("unavailable");
      setCount(result.count);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const timer = window.setInterval(() => void refresh(), 20000);
    const update = () => void refresh();
    window.addEventListener("erp:team-updated", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("erp:team-updated", update);
    };
  }, [refresh]);

  return (
    <Link href="/team" className="ghost-button team-notification-link"
      aria-label={error ? "الإشعارات غير متاحة، افتح التواصل" : count === null ? "جارٍ تحميل إشعارات الرسائل" : `إشعارات الرسائل: ${count} غير مقروءة`}>
      <span className="team-notification-icon" aria-hidden="true">🔔</span>
      <span className="team-notification-label">إشعارات</span>
      {error ? <span className="team-notification-badge" title="تعذر تحديث الإشعارات">!</span> : count !== null && count > 0 ? <span className="team-notification-badge">{count}</span> : null}
    </Link>
  );
}

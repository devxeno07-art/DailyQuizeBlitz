"use client";

import { useEffect } from "react";

/**
 * QuizRunnerHeartbeat provides a low-overhead background heartbeat
 * that pings `/api/cron/tick` when a user or admin has the app open,
 * ensuring due schedules, 3-minute upcoming reminders, and active quiz
 * runners stay synchronized even in local development.
 */
export function QuizRunnerHeartbeat() {
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const ping = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/cron/tick", {
        method: "GET",
        cache: "no-store",
      }).catch(() => {});
    };

    // Initial ping after 4 seconds
    const initial = setTimeout(ping, 4000);

    // Periodic ping every 25 seconds while app is in foreground
    timer = setInterval(ping, 25000);

    return () => {
      clearTimeout(initial);
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}

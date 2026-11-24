"use client";

import { useEffect } from "react";

/**
 * QuizRunnerHeartbeat provides a zero-overhead background heartbeat
 * that pings the serverless runner when a user or admin has the app open.
 */
export function QuizRunnerHeartbeat() {
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const ping = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/telegram/advance?async=1", {
        method: "GET",
        cache: "no-store",
      }).catch(() => {});
    };

    // Initial ping after 3 seconds
    const initial = setTimeout(ping, 3000);

    // Periodic ping every 12 seconds while app is in foreground
    timer = setInterval(ping, 12000);

    return () => {
      clearTimeout(initial);
      if (timer) clearInterval(timer);
    };
  }, []);

  return null;
}

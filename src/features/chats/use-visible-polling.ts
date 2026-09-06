"use client";
import { useEffect } from "react";
/** Poll active tabs every 5s; no overlapping calls; immediate refresh on activation. */
export function useVisiblePolling(run: () => Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let busy = false,
      disposed = false;
    const tick = async () => {
      if (disposed || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        await run();
      } catch {
        /* consumer displays errors */
      } finally {
        busy = false;
      }
    };
    const activate = () => {
      void tick();
    };
    const first = setTimeout(activate, 0),
      timer = setInterval(activate, 5000);
    document.addEventListener("visibilitychange", activate);
    window.addEventListener("focus", activate);
    window.addEventListener("tutorgate:chat-read", activate);
    return () => {
      disposed = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", activate);
      window.removeEventListener("focus", activate);
      window.removeEventListener("tutorgate:chat-read", activate);
    };
  }, [run, enabled]);
}

"use client";
import { useEffect, useState } from "react";
import { CircleCheck, CircleAlert, Info, X } from "lucide-react";
type Kind = "success" | "error" | "info" | "warning";
type Notice = { id: number; text: string; kind: Kind };
let sequence = 0;
const listeners = new Set<(notice: Notice) => void>();
const recent = new Map<string, number>();
function notify(kind: Kind, text: string) {
  const key = `${kind}:${text}`, now = Date.now();
  if (now - (recent.get(key) ?? 0) < 1500) return;
  recent.set(key, now);
  for (const [k, timestamp] of recent) if (now - timestamp > 5000) recent.delete(k);
  for (const listener of listeners) listener({ id: ++sequence, text, kind });
}
export const toast = {
  success: (text: string) => notify("success", text), error: (text: string) => notify("error", text),
  info: (text: string) => notify("info", text), warning: (text: string) => notify("warning", text),
};
export function Toaster() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function receive(notice: Notice) {
      setNotices(old => [...old.filter(n => n.text !== notice.text), notice].slice(-4));
      const timer = setTimeout(() => { setNotices(old => old.filter(n => n.id !== notice.id)); timers.delete(timer); }, notice.kind === "error" ? 5000 : notice.kind === "success" ? 3000 : 4000);
      timers.add(timer);
    }
    listeners.add(receive);
    return () => { listeners.delete(receive); timers.forEach(clearTimeout); };
  }, []);
  return <section className="tg-toaster" aria-label="Уведомления">{notices.map(n => {
    const Icon = n.kind === "success" ? CircleCheck : n.kind === "error" ? CircleAlert : Info;
    return <div key={n.id} className={`tg-toast tg-toast-${n.kind}`} role={n.kind === "error" ? "alert" : "status"}><Icon size={18} aria-hidden /><span>{n.text}</span><button type="button" aria-label="Закрыть уведомление" onClick={() => setNotices(old => old.filter(x => x.id !== n.id))}><X size={16} /></button></div>;
  })}</section>;
}
export function useFeedback(state: { error?: string; success?: string; errors?: unknown }, success = true) {
  useEffect(() => {
    if (state.error && !state.errors) toast.error(state.error);
    if (success && state.success) toast.success(state.success);
  }, [state, success]);
}

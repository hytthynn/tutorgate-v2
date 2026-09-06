"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { syncTelegramAction } from "@/features/admin/user-actions";
export function TelegramSyncForm() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  async function sync() {
    if (lock.current) return;
    lock.current = true; setPending(true);
    try {
      const response = await syncTelegramAction();
      if (response.error) toast.error(response.error);
      if (response.success) setResult(response.success);
    } catch { toast.error("Не удалось завершить синхронизацию."); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className="form-stack"><Button onClick={sync} loading={pending} loadingText="Синхронизируем…">Синхронизировать всех</Button><p role="status" className="muted">{result}</p></div>;
}

"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { manageUserAction } from "@/features/admin/user-actions";
import { toast } from "@/components/ui/toaster";

export function PendingDeletions({ jobs }: { jobs: { id: string; createdAt: string }[] }) {
  const [pending,setPending] = useState<string | null>(null);
  if (!jobs.length) return null;
  return <section className="panel"><h2>Незавершённые удаления</h2><p>Доступ отозван. Повторите очистку, чтобы завершить удаление данных.</p>{jobs.map(job => <div key={job.id}><span>Удаление от {new Date(job.createdAt).toLocaleDateString("ru-RU")}</span><Button variant="destructive" size="sm" loading={pending === job.id} disabled={pending !== null} onClick={async () => {
    setPending(job.id);
    try { const result = await manageUserAction({ id: job.id, operation: "delete" }); if (result.error) toast.error(result.error); else toast.success(result.success ?? "Удаление завершено."); }
    catch { toast.error("Не удалось завершить очистку."); } finally { setPending(null); }
  }}>Повторить очистку</Button></div>)}</section>;
}

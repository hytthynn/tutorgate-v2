"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { approveApplicationAction, rejectApplicationAction, resendRegistrationLinkAction } from "./admin-actions";
import type { AdminApplication, ReviewAction } from "./types";
export function ReviewButtons({ application }: { application: AdminApplication }) {
 const router = useRouter(), lock = useRef(false);
 const [busy, setBusy] = useState<ReviewAction | null>(null);
 const [done, setDone] = useState(false);
 // Expiry and interrupted-send recovery become actionable without a manual reload.
 useEffect(() => {
  if(application.status !== "approved") return;
  const timer = setInterval(() => { if(!lock.current) router.refresh(); }, 60000);
  return () => clearInterval(timer);
 }, [application.status, router]);
 async function act(action: ReviewAction) {
  if(lock.current) return; lock.current = true; setBusy(action);
  try {
   const result = await ({ approve: approveApplicationAction, reject: rejectApplicationAction, resend: resendRegistrationLinkAction }[action])(application.id);
   if(result.error) toast.error(result.error);
   else { if(action !== "resend") setDone(true); if(result.warning) toast.warning(result.warning); else if(result.success) toast.success(result.success); }
   router.refresh();
  } catch { toast.error("Не удалось выполнить действие. Обновите страницу и проверьте статус заявки."); router.refresh(); }
  finally { lock.current = false; setBusy(null); }
 }
 if(done) return <p className="muted" role="status">Решение сохранено</p>;
 if(application.status === "pending_review") return <div className="application-actions">
  <Button loading={busy === "approve"} disabled={busy !== null} onClick={() => act("approve")}>Принять</Button>
  <Button variant="secondary" loading={busy === "reject"} disabled={busy !== null} onClick={() => act("reject")}>Отклонить</Button>
 </div>;
 if(application.status === "approved" && application.can_resend) return <Button variant="secondary" loading={busy === "resend"} disabled={busy !== null} onClick={() => act("resend")}>Отправить новую ссылку</Button>;
 return null;
}

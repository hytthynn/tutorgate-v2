"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { manageUserAction } from "@/features/admin/user-actions";
import type { AdminDirectoryProfile } from "@/types";

export function UserActionsMenu({ profile }: { profile: AdminDirectoryProfile }) {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  function closeMenu() { setOpen(false); trigger.current?.focus(); }
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const box=trigger.current.getBoundingClientRect(), popup=menu.current.getBoundingClientRect();
    menu.current.style.left=`${Math.max(8,Math.min(box.left,innerWidth-popup.width-8))}px`;
    menu.current.style.top=`${Math.max(8,Math.min(box.bottom+4,innerHeight-popup.height-8))}px`;
    menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",outside);
    return ()=>document.removeEventListener("pointerdown",outside);
  }, [open]);
  if (profile.role === "admin") return null;
  const actions = [
    { value: profile.role === "student" ? "tutor" : "student", label: profile.role === "student" ? "Сделать репетитором" : "Сделать учеником" },
    { value: profile.account_status === "blocked" ? "unblock" : "block", label: profile.account_status === "blocked" ? "Разблокировать" : "Заблокировать" },
    { value: "delete", label: "Удалить аккаунт" },
  ];
  async function submit() {
    if (lock.current || !operation) return;
    lock.current = true; setPending(true);
    try {
      const result = await manageUserAction({ id: profile.id, operation });
      if (result.error) toast.error(result.error);
      if (result.success) { toast.success(result.success); setOpen(false); setOperation(null); }
    } catch { toast.error("Не удалось выполнить действие."); }
    finally { lock.current = false; setPending(false); }
  }
  return <><Button ref={trigger} size="sm" variant="secondary" aria-haspopup="menu" aria-expanded={open} aria-label={`Действия: ${profile.full_name}`} onClick={() => { setOperation(null); setOpen(value=>!value); }}>Действия</Button>
    {open && <div ref={menu} role="menu" aria-label={`Действия: ${profile.full_name}`} className="lesson-context-menu" onKeyDown={event=>{
      if(event.key==="Escape"||event.key==="Tab"){event.preventDefault();closeMenu();return;}
      if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
        event.preventDefault();const items=[...menu.current!.querySelectorAll<HTMLButtonElement>("button")],index=items.indexOf(document.activeElement as HTMLButtonElement);
        items[event.key==="Home"?0:event.key==="End"?items.length-1:(index+(event.key==="ArrowUp"?-1:1)+items.length)%items.length]?.focus();
      }
    }}>{actions.map(a=><button key={a.value} role="menuitem" className={a.value==="delete"?"lesson-delete":undefined} onClick={()=>{setOpen(false);setOperation(a.value);}}>{a.label}</button>)}</div>}
    <Dialog open={operation!==null} onOpenChange={value => { if (!pending && !value) {setOperation(null);trigger.current?.focus();} }}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}}>
      <DialogTitle>{actions.find(a => a.value === operation)?.label ?? "Действия пользователя"}</DialogTitle>
      <DialogDescription>{profile.full_name} · Логин: {profile.login ?? "—"}</DialogDescription>
      <div className="form-stack"><p>{operation === "delete" ? "Удаление необратимо: персональные данные будут обезличены, доступ закрыт. История занятий и статистика сохранятся." : operation === "block" ? "Активные сессии будут завершены. Вход будет закрыт до разблокировки." : operation === "unblock" ? "Пользователь снова сможет войти в TutorGate." : "Роль изменится только при отсутствии назначений, предметов и текущих/будущих занятий. Потребуется повторный вход."}</p>
        <Button variant={operation === "delete" ? "destructive" : "default"} loading={pending} loadingText="Сохраняем…" onClick={submit}>Подтвердить</Button>
        <Button variant="secondary" disabled={pending} onClick={() => {setOperation(null);trigger.current?.focus();}}>Отмена</Button></div>
    </DialogContent></Dialog></>;
}

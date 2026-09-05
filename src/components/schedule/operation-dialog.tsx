"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { addDays, dayOptions, formatDay, localToUtc, startOfWeek, validDate } from "@/features/schedule/time";
import type { AvailabilityRule, ScheduleLesson } from "@/features/schedule/types";
export function OperationDialog({ kind, group, today, offset, rules, onClose, onSubmit }: {
  kind: "transfer" | "availability"; group: ScheduleLesson[]; today: string; offset: number; rules: AvailabilityRule[];
  onClose: () => void; onSubmit: (value: { startsAt?: string; durationMinutes?: number; availableFrom?: string | null }) => void;
}) {
  const week=startOfWeek(today);
  const currentDates=group.map(l=>rules.find(r=>r.studentId===l.studentId)?.availableFrom ?? "");
  const [selectedWeek,setWeek]=useState(week), [day,setDay]=useState(week), [time,setTime]=useState("12:00"), [duration,setDuration]=useState(String(group[0].durationMinutes));
  const [date,setDate]=useState(currentDates.every(d=>d===currentDates[0]) ? currentDates[0] : "");
  const [attempted,setAttempted]=useState(false);
  const errors={date:kind==="availability" && !validDate(date) ? "Укажите корректную дату." : "", time:!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? "Укажите корректное время." : "", duration:!Number.isInteger(Number(duration)) || Number(duration)<1 || Number(duration)>600 ? "Введите целое число от 1 до 600." : ""};
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent onCloseAutoFocus={event=>{event.preventDefault();document.querySelector<HTMLElement>(".schedule-grid")?.focus();}}>
    <DialogTitle>{kind==="transfer" ? "Перенести занятия" : "Заниматься с"}</DialogTitle>
    <DialogDescription>{kind==="transfer" ? `Выбрано занятий: ${group.length}. Относительное расположение группы сохраняется.` : "Занятия этого ученика до выбранной даты станут неактивными."}</DialogDescription>
    <form noValidate className="form-stack" onSubmit={e=>{e.preventDefault();setAttempted(true);if(kind==="availability"){if(!errors.date)onSubmit({availableFrom:date});}else if(!errors.time && (group.length>1 || !errors.duration))onSubmit({startsAt:localToUtc(day,time,offset),durationMinutes:group.length===1?Number(duration):undefined});}}>
      {kind==="transfer" ? <>
        <label>Неделя<Select aria-label="Неделя переноса" value={selectedWeek} onValueChange={v=>{setWeek(v);setDay(v);}}>{[week,addDays(week,7)].map((w,i)=><option key={w} value={w}>{i?"Следующая неделя":"Текущая неделя"} — {formatDay(w)}–{formatDay(addDays(w,6))}</option>)}</Select></label>
        <label>День<Select aria-label="День переноса" value={day} onValueChange={setDay}>{dayOptions(selectedWeek).map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</Select></label>
        <label>Начало<input type="time" value={time} onChange={e=>setTime(e.target.value)} aria-invalid={attempted&&!!errors.time} aria-describedby="transfer-time-error"/>{attempted&&errors.time&&<span id="transfer-time-error" className="field-error">{errors.time}</span>}</label>
        {group.length===1&&<label>Продолжительность, мин<input type="number" value={duration} onChange={e=>setDuration(e.target.value)} aria-invalid={attempted&&!!errors.duration} aria-describedby="transfer-duration-error"/>{attempted&&errors.duration&&<span id="transfer-duration-error" className="field-error">{errors.duration}</span>}</label>}
      </> : <label>Сможет заниматься с<input type="date" value={date} onChange={e=>setDate(e.target.value)} aria-invalid={attempted&&!!errors.date} aria-describedby="availability-date-error"/>{attempted&&errors.date&&<span id="availability-date-error" className="field-error">{errors.date}</span>}</label>}
      <Button type="submit">{kind==="transfer"?"Перенести":"Сохранить"}</Button>
      {kind==="availability"&&currentDates.some(Boolean)&&<Button type="button" variant="secondary" onClick={()=>onSubmit({availableFrom:null})}>Отменить заниматься с</Button>}
    </form>
  </DialogContent></Dialog>;
}

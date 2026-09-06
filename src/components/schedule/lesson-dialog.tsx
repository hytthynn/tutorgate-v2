"use client";
import { initialSubject,lessonChoices } from "@/features/schedule/lesson-form-state";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getLessonNoteAction } from "@/features/schedule/actions";
import { toast } from "@/components/ui/toaster";
import { dayOptions, localParts } from "@/features/schedule/time";
import { isInactive, statusLabel } from "@/features/schedule/operations";
import { lessonSchema, type LessonInput } from "@/features/schedule/validation";
import type { ScheduleData, ScheduleLesson, ScheduleResult } from "@/features/schedule/types";

export function LessonDialog({ lesson, draft, serverErrors, data, date, onClose, onSubmitLesson }: {
  lesson: ScheduleLesson | null; data: ScheduleData; date: string;
  draft?: LessonInput;
  serverErrors?: Record<string,string[]>;
  onClose: () => void; onSubmitLesson: (input: LessonInput) => Promise<boolean | undefined>;
}) {
  const [studentId, setStudentId] = useState(draft?.studentId ?? lesson?.studentId ?? "");
  const [subjectChanged, setSubjectChanged] = useState(draft?.subjectChanged ?? false);
  const [subjectId,setSubjectId]=useState(()=>initialSubject(lesson,draft));
  const choices=lessonChoices(data,studentId);
  const historical=!!lesson&&!subjectChanged&&studentId===lesson.studentId&&!choices.subjects.some(s=>s.id===lesson.subjectId);
  const subjectValue=historical?(lesson.subjectId??"__historical__"):choices.subjects.some(s=>s.id===subjectId)?subjectId:"";
  const noteElement = useRef<HTMLTextAreaElement>(null);
  const studentViewer = data.role === "student";
  const readonly = studentViewer || !!lesson && isInactive(lesson);
  const [note, setNote] = useState(draft?.note ?? "");
  const [loading, setLoading] = useState(Boolean(lesson && !studentViewer && !draft));
  const [noteFailed, setNoteFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [result, setResult] = useState<ScheduleResult>({errors:serverErrors});
  useEffect(() => {
    if (!lesson || studentViewer || draft) return;
    let cancelled = false;
    getLessonNoteAction(lesson.id, data.ownerId).then((response) => {
      if (cancelled) return;
      if (response.error) toast.error("Не удалось загрузить заметку. Откройте занятие ещё раз."); setNote(response.note ?? ""); setNoteFailed(Boolean(response.error)); setLoading(false);
    }).catch(() => {
      if (!cancelled) { toast.error("Не удалось загрузить заметку. Откройте занятие ещё раз."); setNoteFailed(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [lesson, studentViewer, draft, data.ownerId]);
  useEffect(() => {
    const element = noteElement.current;
    if (element) { element.style.height = "88px"; element.style.height = `${Math.min(240, Math.max(88, element.scrollHeight))}px`; }
  }, [note]);
  const start = draft ? {date:draft.date,time:draft.time} : lesson ? localParts(lesson.startsAt, data.offset) : { date, time: "12:00" };
  const end = lesson ? localParts(lesson.endsAt, data.offset) : null;
  // Use onSubmit rather than a React form action: manual pending/status updates
  // must commit immediately, not be deferred inside the form action transition.
  async function submit(form: FormData) {
    if (locked.current || loading || noteFailed) return;
    const input = { studentId, subjectId: subjectValue === "__historical__" ? null : subjectValue, subjectChanged: !lesson || subjectChanged, date: form.get("date"), time: form.get("time"), durationMinutes: Number(form.get("durationMinutes")), note };
    const parsed = lessonSchema.safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
      setResult({ errors }); return;
    }
    locked.current=true;setPending(true);
    try { await onSubmitLesson(parsed.data); } finally {locked.current=false;setPending(false);}
  }

  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{for(const element of formRef.current?.querySelectorAll<HTMLElement>("[name],button[role=combobox]")??[]){const name=element.getAttribute("name")??element.closest("label")?.querySelector("[name]")?.getAttribute("name")??"";element.setAttribute("aria-invalid",String(!!result.errors?.[name]?.length));if(result.errors?.[name]?.length)element.setAttribute("aria-describedby",name+"-error");else element.removeAttribute("aria-describedby");}},[result]);
  function clearFieldError(name:string){setResult(current=>({...current,errors:{...current.errors,[name]:[]}}));}
  const error = (name: string) => result.errors?.[name]?.length ? <span className="field-error" id={name+"-error"} role="alert">{result.errors[name].join(" ")}</span> : null;
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent onCloseAutoFocus={event=>{event.preventDefault();document.querySelector<HTMLElement>(".schedule-grid")?.focus();}} className="lesson-dialog">
      <DialogTitle>{readonly ? "Подробности занятия" : lesson ? "Редактирование занятия" : "Добавить занятие"}</DialogTitle>
      <DialogDescription>{readonly ? "Информация о вашем занятии." : "Время указано в вашем сохранённом сдвиге МСК."}</DialogDescription>
      {readonly && lesson ? <dl className="lesson-details">
        <dt>Репетитор</dt><dd>{lesson.tutorName}</dd>
        <dt>Предмет</dt><dd>{lesson.subjectName}</dd>
        <dt>Дата</dt><dd>{start.date.split("-").reverse().join(".")}</dd>
        <dt>Начало</dt><dd>{start.time}</dd>
        <dt>Окончание</dt><dd>{end?.time}{end?.date !== start.date ? ` (${end?.date.split("-").reverse().join(".")})` : ""}</dd>
        <dt>Длительность</dt><dd>{lesson.durationMinutes} мин</dd>
        <dt>Состояние</dt><dd>{statusLabel(lesson) || (lesson.completed ? "Проведено" : "Запланировано")}</dd>
        {!studentViewer&&<><dt>Заметка</dt><dd>{loading?"Загрузка заметки…":noteFailed?"Не удалось загрузить заметку.":note||"Нет заметки"}</dd></>}
      </dl> : <form ref={formRef} noValidate onChange={event=>{if(result.errors){const form=new FormData(event.currentTarget);const parsed=lessonSchema.safeParse({studentId,subjectId:subjectValue==="__historical__"?null:subjectValue,subjectChanged:!lesson||subjectChanged,date:form.get("date"),time:form.get("time"),durationMinutes:Number(form.get("durationMinutes")),note:String(form.get("note")??"")});const errors:Record<string,string[]>={};if(!parsed.success)for(const issue of parsed.error.issues)(errors[String(issue.path[0])]??=[]).push(issue.message);setResult({errors});}}} onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="lesson-form">
        <label>Ученик<Combobox aria-label="Ученик" name="studentId" value={studentId} onValueChange={value=>{setStudentId(value);setSubjectId("");setSubjectChanged(true);clearFieldError("studentId");}} required disabled={pending||(!lesson&&!data.students.length)}>
          <option value="" disabled>{choices.studentPlaceholder}</option>
          {lesson && !data.students.some((s) => s.id === lesson.studentId) && <option value={lesson.studentId}>{lesson.studentName} — назначение снято</option>}
          {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Combobox>{error("studentId")}</label>
        <div className="lesson-time-fields">
          <label>День<Select aria-label="День" name="date" onValueChange={()=>clearFieldError("date")} defaultValue={start.date} required disabled={pending}>{dayOptions(start.date).map(day => <option key={day.value} value={day.value}>{day.label}</option>)}</Select>{error("date")}</label>
          <label>Начало<input name="time" type="time" step="60" defaultValue={start.time} required disabled={pending} />{error("time")}</label>
        </div>
        <label>Длительность, мин<input name="durationMinutes" type="number" min="1" max="600" step="1" defaultValue={draft?.durationMinutes ?? lesson?.durationMinutes ?? 60} required disabled={pending} />{error("durationMinutes")}</label>
        <label>Предмет<Select aria-label="Предмет" name="subjectId" value={subjectValue} onValueChange={value=>{setSubjectId(value);setSubjectChanged(true);clearFieldError("subjectId");}} required disabled={pending||(!historical&&!choices.subjects.length)}>
          <option value="" disabled>{choices.subjectPlaceholder}</option>
          {historical&&<option value={lesson!.subjectId??"__historical__"}>{lesson!.subjectName} — исторический предмет</option>}
          {choices.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>{error("subjectId")}</label>
        <label>Заметка<textarea aria-label="Заметка" ref={noteElement} className="lesson-note" name="note" maxLength={4000} value={note} disabled={pending || loading || noteFailed} onChange={(event) => setNote(event.target.value)} rows={3} />{error("note")}</label>
        {loading && <p role="status">Загрузка заметки…</p>}
        {!data.students.length && !lesson && <p className="form-error">Сначала администратор должен назначить вам ученика.</p>}
        {!data.subjects.length && !lesson && <p className="form-error">Нет доступных предметов. Обратитесь к администратору.</p>}
        <div className="lesson-form-actions"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={pending} loadingText={lesson ? "Сохраняем…" : "Добавляем…"} disabled={loading || noteFailed || (!lesson && (!studentId || !choices.subjects.length))}>{lesson ? "Сохранить" : "Добавить"}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}

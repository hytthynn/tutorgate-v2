"use client";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createLessonAction, getLessonNoteAction, updateLessonAction } from "@/features/schedule/actions";
import { toast } from "@/components/ui/toaster";
import { dayOptions, localParts } from "@/features/schedule/time";
import { lessonSchema } from "@/features/schedule/validation";
import type { ScheduleData, ScheduleLesson, ScheduleResult, SaveState } from "@/features/schedule/types";

export function LessonDialog({ lesson, data, date, onClose, onSaved, onPending, onSaveState }: {
  lesson: ScheduleLesson | null; data: ScheduleData; date: string;
  onPending?: (pending: boolean) => void;
  onSaveState?: (state: SaveState) => void;
  onClose: () => void; onSaved: (lesson: ScheduleLesson) => void;
}) {
  const [studentId, setStudentId] = useState(lesson?.studentId ?? "");
  const [subjectChanged, setSubjectChanged] = useState(false);
  const noteElement = useRef<HTMLTextAreaElement>(null);
  const readonly = data.role === "student";
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(Boolean(lesson && !readonly));
  const [noteFailed, setNoteFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [result, setResult] = useState<ScheduleResult>({});
  useEffect(() => {
    if (!lesson || readonly) return;
    let cancelled = false;
    getLessonNoteAction(lesson.id).then((response) => {
      if (cancelled) return;
      if (response.error) toast.error("Не удалось загрузить заметку. Откройте занятие ещё раз."); setNote(response.note ?? ""); setNoteFailed(Boolean(response.error)); setLoading(false);
    }).catch(() => {
      if (!cancelled) { toast.error("Не удалось загрузить заметку. Откройте занятие ещё раз."); setNoteFailed(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [lesson, readonly]);
  useEffect(() => {
    const element = noteElement.current;
    if (element) { element.style.height = "88px"; element.style.height = `${Math.min(240, Math.max(88, element.scrollHeight))}px`; }
  }, [note]);
  const start = lesson ? localParts(lesson.startsAt, data.offset) : { date, time: "12:00" };
  const end = lesson ? localParts(lesson.endsAt, data.offset) : null;
  // Use onSubmit rather than a React form action: manual pending/status updates
  // must commit immediately, not be deferred inside the form action transition.
  async function submit(form: FormData) {
    if (locked.current || loading || noteFailed) return;
    const input = { studentId: form.get("studentId"), subjectId: form.get("subjectId") === "__historical__" ? null : form.get("subjectId"), subjectChanged: !lesson || subjectChanged, date: form.get("date"), time: form.get("time"), durationMinutes: Number(form.get("durationMinutes")), note };
    const parsed = lessonSchema.safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
      setResult({ errors }); return;
    }
    locked.current = true; onPending?.(true); onSaveState?.("saving"); setPending(true); setResult({});
    try {
      const response = await (lesson ? updateLessonAction(lesson.id, parsed.data) : createLessonAction(parsed.data));
      if (response.lesson && !response.error && !response.errors) {
        if (response.shifted && response.requestedStart) toast.info(`${localParts(response.requestedStart, data.offset).time} занято — занятие поставлено на ${localParts(response.lesson.startsAt, data.offset).time}.`);
        else toast.success(lesson ? "Занятие обновлено." : "Занятие добавлено.");
        onSaveState?.("saved"); onSaved(response.lesson);
      } else { onSaveState?.("error"); setResult(response); toast.error(response.error ?? "Не удалось сохранить занятие. Проверьте параметры формы."); }
    } catch { onSaveState?.("error"); toast.error("Не удалось сохранить занятие. Попробуйте ещё раз."); }
    finally { locked.current = false; onPending?.(false); setPending(false); }
  }
  const error = (name: string) => result.errors?.[name] && <span className="form-error" role="alert">{result.errors[name].join(" ")}</span>;
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="lesson-dialog">
      <DialogTitle>{readonly ? "Подробности занятия" : lesson ? "Редактирование занятия" : "Добавить занятие"}</DialogTitle>
      <DialogDescription>{readonly ? "Информация о вашем занятии." : "Время указано в вашем сохранённом сдвиге МСК."}</DialogDescription>
      {readonly && lesson ? <dl className="lesson-details">
        <dt>Репетитор</dt><dd>{lesson.tutorName}</dd>
        <dt>Предмет</dt><dd>{lesson.subjectName}</dd>
        <dt>Дата</dt><dd>{start.date.split("-").reverse().join(".")}</dd>
        <dt>Начало</dt><dd>{start.time}</dd>
        <dt>Окончание</dt><dd>{end?.time}{end?.date !== start.date ? ` (${end?.date.split("-").reverse().join(".")})` : ""}</dd>
        <dt>Длительность</dt><dd>{lesson.durationMinutes} мин</dd>
        <dt>Состояние</dt><dd>{lesson.completed ? "Проведено" : "Запланировано"}</dd>
      </dl> : <form onSubmit={event => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }} className="lesson-form">
        <label>Ученик<Combobox aria-label="Ученик" name="studentId" value={studentId} onValueChange={setStudentId} required disabled={pending}>
          <option value="" disabled>Выберите ученика</option>
          {lesson && !data.students.some((s) => s.id === lesson.studentId) && <option value={lesson.studentId}>{lesson.studentName} — назначение снято</option>}
          {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Combobox>{error("studentId")}</label>
        <div className="lesson-time-fields">
          <label>День<Select aria-label="День" name="date" defaultValue={start.date} required disabled={pending}>{dayOptions(start.date).map(day => <option key={day.value} value={day.value}>{day.label}</option>)}</Select>{error("date")}</label>
          <label>Начало<input name="time" type="time" step="60" defaultValue={start.time} required disabled={pending} />{error("time")}</label>
        </div>
        <label>Длительность, мин<input name="durationMinutes" type="number" min="1" max="600" step="1" defaultValue={lesson?.durationMinutes ?? 60} required disabled={pending} />{error("durationMinutes")}</label>
        <label>Предмет<Select aria-label="Предмет" name="subjectId" defaultValue={lesson ? lesson.subjectId ?? "__historical__" : ""} onValueChange={() => setSubjectChanged(true)} required disabled={pending}>
          <option value="" disabled>Выберите предмет</option>
          {lesson && !data.subjects.some((s) => s.id === lesson.subjectId && (!data.assignments || data.assignments.some(a => a.studentId === studentId && a.subjectId === s.id))) && <option value={lesson.subjectId ?? "__historical__"} disabled={subjectChanged}>{lesson.subjectName} — исторический предмет</option>}
          {data.subjects.filter(s => !data.assignments || data.assignments.some(a => a.studentId === studentId && a.subjectId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>{error("subjectId")}</label>
        <label>Заметка<textarea aria-label="Заметка" ref={noteElement} className="lesson-note" name="note" maxLength={4000} value={note} disabled={pending || loading || noteFailed} onChange={(event) => setNote(event.target.value)} rows={3} />{error("note")}</label>
        {loading && <p role="status">Загрузка заметки…</p>}
        {!data.students.length && !lesson && <p className="form-error">Сначала администратор должен назначить вам ученика.</p>}
        {!data.subjects.length && !lesson && <p className="form-error">Нет доступных предметов. Обратитесь к администратору.</p>}
        <div className="lesson-form-actions"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Отмена</Button>
          <Button type="submit" loading={pending} loadingText={lesson ? "Сохраняем…" : "Добавляем…"} disabled={loading || noteFailed || (!lesson && (!data.students.length || !data.subjects.length))}>{lesson ? "Сохранить" : "Добавить"}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}

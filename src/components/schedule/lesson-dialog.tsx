"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createLessonAction, getLessonNoteAction, updateLessonAction } from "@/features/schedule/actions";
import { localParts } from "@/features/schedule/time";
import { lessonSchema } from "@/features/schedule/validation";
import type { ScheduleData, ScheduleLesson, ScheduleResult } from "@/features/schedule/types";

export function LessonDialog({ lesson, data, date, onClose, onSaved }: {
  lesson: ScheduleLesson | null; data: ScheduleData; date: string;
  onClose: () => void; onSaved: (id: string, date: string) => void;
}) {
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
      setResult(response); setNote(response.note ?? ""); setNoteFailed(Boolean(response.error)); setLoading(false);
    }).catch(() => {
      if (!cancelled) { setResult({ error: "Не удалось загрузить заметку. Откройте занятие ещё раз." }); setNoteFailed(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [lesson, readonly]);
  const start = lesson ? localParts(lesson.startsAt, data.offset) : { date, time: "12:00" };
  const end = lesson ? localParts(lesson.endsAt, data.offset) : null;
  async function submit(form: FormData) {
    if (locked.current || loading || noteFailed) return;
    const input = { studentId: form.get("studentId"), subjectId: form.get("subjectId"), date: form.get("date"), time: form.get("time"), durationMinutes: Number(form.get("durationMinutes")), note };
    const parsed = lessonSchema.safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
      setResult({ errors }); return;
    }
    locked.current = true; setPending(true); setResult({});
    try {
      const response = await (lesson ? updateLessonAction(lesson.id, parsed.data) : createLessonAction(parsed.data));
      if (response.id && !response.error) onSaved(response.id, parsed.data.date);
      else setResult(response);
    } catch { setResult({ error: "Не удалось сохранить занятие. Попробуйте ещё раз." }); }
    finally { locked.current = false; setPending(false); }
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
      </dl> : <form action={submit} className="lesson-form">
        <label>Ученик<select aria-label="Ученик" name="studentId" defaultValue={lesson?.studentId ?? ""} required disabled={pending}>
          <option value="" disabled>Выберите ученика</option>
          {lesson && !data.students.some((s) => s.id === lesson.studentId) && <option value={lesson.studentId}>{lesson.studentName} — назначение снято</option>}
          {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>{error("studentId")}</label>
        <div className="lesson-time-fields">
          <label>День<input name="date" type="date" defaultValue={start.date} required disabled={pending} />{error("date")}</label>
          <label>Начало<input name="time" type="time" step="60" defaultValue={start.time} required disabled={pending} />{error("time")}</label>
        </div>
        <label>Длительность, мин<input name="durationMinutes" type="number" min="1" max="600" step="1" defaultValue={lesson?.durationMinutes ?? 60} required disabled={pending} />{error("durationMinutes")}</label>
        <label>Предмет<select aria-label="Предмет" name="subjectId" defaultValue={lesson?.subjectId ?? ""} required disabled={pending}>
          <option value="" disabled>Выберите предмет</option>
          {lesson && !data.subjects.some((s) => s.id === lesson.subjectId) && <option value={lesson.subjectId}>{lesson.subjectName} — архив</option>}
          {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>{error("subjectId")}</label>
        <label>Заметка<textarea name="note" maxLength={4000} value={note} disabled={pending || loading || noteFailed} onChange={(e) => setNote(e.target.value)} rows={3} />{error("note")}</label>
        {loading && <p role="status">Загрузка заметки…</p>}
        {result.error && <p className="form-error" role="alert">{result.error}</p>}
        {!data.students.length && !lesson && <p className="form-error">Сначала администратор должен назначить вам ученика.</p>}
        {!data.subjects.length && !lesson && <p className="form-error">Нет доступных предметов. Обратитесь к администратору.</p>}
        <div className="lesson-form-actions"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={pending || loading || noteFailed || (!lesson && (!data.students.length || !data.subjects.length))}>{pending ? "Сохранение…" : lesson ? "Сохранить" : "Добавить"}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}

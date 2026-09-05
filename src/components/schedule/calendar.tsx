"use client";
import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { deleteLessonsAction, moveLessonAction, saveSchedulePreferenceAction, setLessonColorAction, setLessonCompletedAction } from "@/features/schedule/actions";
import { addDays, formatDay, localParts, localToUtc, MINUTE, minutesFromMidnight, parseWeek, snapMinutes, splitLessonByLocalDays, startOfWeek, weeklySummary } from "@/features/schedule/time";
import type { ScheduleData, ScheduleLesson, ScheduleResult } from "@/features/schedule/types";
import { LessonDialog } from "./lesson-dialog";
import { ScheduleToolbar } from "./toolbar";
import { LessonContextMenu } from "./context-menu";

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type Point = { x: number; y: number };
type Gesture = { origin: Point; last: Point; source?: ScheduleLesson; sourceWeek: string; grabMinutes: number; moved: boolean; longPress: boolean; target?: string };
export function ScheduleCalendar({ data }: { data: ScheduleData }) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const [now, setNow] = useState(() => new Date(data.now));
  const [todayRequest, setTodayRequest] = useState(0);
  const [offset, setOffset] = useState(data.offset);
  const week = parseWeek(params.get("week") ?? data.week, offset, now);
  const [lessons, setLessons] = useState(data.lessons);
  const [snapshot, setSnapshot] = useState(data);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const lock = useRef(false);
  if (snapshot !== data) {
    setSnapshot(data);
    if (!pending) { setLessons(data.lessons); setOffset(data.offset); }
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<ScheduleLesson | null | undefined>(undefined);
  const [bindings, setBindings] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const today = localParts(now, offset).date;
  const [activeDate, setActiveDate] = useState(today >= week && today < addDays(week, 7) ? today : week);
  const requestedDay = params.get("day") ?? activeDate;
  const mobileDate = daysafe(requestedDay, week) ? requestedDay : (today >= week && today < addDays(week, 7) ? today : week);
  const editable = data.role !== "student";
  const grid = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const weekRef = useRef(week);
  const mobileRef = useRef(mobileDate);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeDirection = useRef(0);
  const [rectangle, setRectangle] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [preview, setPreview] = useState<ScheduleLesson | null>(null);
  useEffect(() => {
    weekRef.current = week; mobileRef.current = mobileDate;
  }, [week, mobileDate]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(timer); if (edgeTimer.current) clearTimeout(edgeTimer.current); if (longTimer.current) clearTimeout(longTimer.current); };
  }, []);
  useEffect(() => {
    function restoreWeek() { setMenu(null); router.refresh(); }
    window.addEventListener("popstate", restoreWeek);
    return () => window.removeEventListener("popstate", restoreWeek);
  }, [router]);
  useEffect(() => {
    const value = params.get("week");
    if (value !== null && value !== week) {
      const next = new URLSearchParams(params.toString()); next.set("week", week);
      window.history.replaceState(null, "", `${path}?${next}`);
    }
  }, [params, path, week]);
  function navigate(nextWeek: string, day?: string) {
    const previousWeek = weekRef.current;
    weekRef.current = nextWeek;
    const nextDay = day ?? (today >= nextWeek && today < addDays(nextWeek, 7) ? today : nextWeek);
    mobileRef.current = nextDay; setActiveDate(nextDay); setMenu(null);
    const next = new URLSearchParams(params.toString()); next.set("week", nextWeek); next.set("day", nextDay);
    window.history.pushState(null, "", `${path}?${next}`);
    if (nextWeek !== previousWeek) startTransition(() => router.refresh());
  }
  function closeMenu() { setMenu(null); grid.current?.focus(); }
  function openLesson(lesson: ScheduleLesson) { setMenu(null); setEditor(lesson); }
  function clickLesson(lesson: ScheduleLesson) {
    if (selected.size === 1 && selected.has(lesson.id)) openLesson(lesson);
    else setSelected(new Set([lesson.id]));
  }
  async function mutate(next: ScheduleLesson[], action: () => Promise<ScheduleResult>, success?: string, rollbackWeek?: string) {
    if (lock.current) return;
    lock.current = true; setPending(true); setMenu(null); setNotice(null);
    const previous = lessons; setLessons(next);
    let failure = "Не удалось сохранить изменения. Попробуйте ещё раз.";
    try {
      const result = await action();
      if (result.error || result.errors) { failure = result.error ?? "Проверьте параметры занятия."; throw new Error(); }
      if (success) setNotice({ text: success });
      startTransition(() => router.refresh());
    } catch {
      setLessons(previous);
      setNotice({ text: failure, error: true });
      if (rollbackWeek && rollbackWeek !== weekRef.current) navigate(rollbackWeek);
    } finally { lock.current = false; setPending(false); }
  }
  function remove(ids: string[]) {
    if (!editable || !ids.length) return;
    void mutate(lessons.filter((l) => !ids.includes(l.id)), () => deleteLessonsAction(ids), "Занятие удалено").then(() => setSelected(new Set()));
  }
  function complete(lesson: ScheduleLesson) {
    void mutate(lessons.map((l) => l.id === lesson.id ? { ...l, completed: !l.completed } : l), () => setLessonCompletedAction({ id: lesson.id, completed: !lesson.completed }));
  }
  function clearTimers() {
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    if (longTimer.current) clearTimeout(longTimer.current);
    edgeTimer.current = null; longTimer.current = null; edgeDirection.current = 0;
  }
  function showPreview(point: Point) {
    const g = gesture.current, box = grid.current?.getBoundingClientRect();
    if (!g?.source || !box) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const column = Math.min(6, Math.max(0, Math.floor((point.x - box.left) / box.width * 7)));
    const day = mobile ? mobileRef.current : addDays(weekRef.current, column);
    const minute = Math.min(1439, Math.max(0, (point.y - box.top) / box.height * 1440));
    const timestamp = Date.parse(localToUtc(day, "00:00", offset)) + snapMinutes(minute - g.grabMinutes) * MINUTE;
    const startsAt = new Date(timestamp).toISOString(); g.target = startsAt;
    setPreview({ ...g.source, startsAt, endsAt: new Date(timestamp + g.source.durationMinutes * MINUTE).toISOString() });
  }
  function watchEdge(point: Point) {
    const box = grid.current!.getBoundingClientRect();
    const direction = point.x < box.left + 18 ? -1 : point.x > box.right - 18 ? 1 : 0;
    if (direction === edgeDirection.current) return;
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeDirection.current = direction;
    if (!direction) return;
    const advance = () => {
      const g = gesture.current;
      if (!g?.moved || !g.source) return;
      const next = addDays(weekRef.current, direction * 7);
      navigate(next, direction < 0 ? addDays(next, 6) : next);
      showPreview(g.last);
      edgeTimer.current = setTimeout(advance, 550);
    };
    edgeTimer.current = setTimeout(advance, 500);
  }
  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (pending || editor !== undefined || e.button === 2) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-lesson-id]");
    const source = card ? lessons.find((l) => l.id === card.dataset.lessonId) : undefined;
    if (e.button === 1) { if (editable && source) { e.preventDefault(); complete(source); } return; }
    if (e.button !== 0) return;
    e.preventDefault(); grid.current!.focus(); setMenu(null);
    if (!source && !editable) { setSelected(new Set()); return; }
    grid.current!.setPointerCapture(e.pointerId);
    const box = grid.current!.getBoundingClientRect();
    const segmentDate = card?.dataset.date ?? week;
    const pointerTime = Date.parse(localToUtc(segmentDate, "00:00", offset)) + (e.clientY - box.top) / box.height * 1440 * MINUTE;
    gesture.current = { origin: { x: e.clientX, y: e.clientY }, last: { x: e.clientX, y: e.clientY }, source, sourceWeek: week, grabMinutes: source ? (pointerTime - Date.parse(source.startsAt)) / MINUTE : 0, moved: false, longPress: false };
    if (!source) setSelected(new Set());
    if (source && editable && e.pointerType === "touch") {
      longTimer.current = setTimeout(() => {
        if (!gesture.current || gesture.current.moved) return;
        gesture.current.longPress = true;
        setSelected(new Set([source.id])); setMenu({ id: source.id, x: e.clientX, y: e.clientY });
      }, 500);
    }
  }
  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.longPress) return;
    const point = { x: e.clientX, y: e.clientY }; g.last = point;
    if (!g.moved && Math.hypot(point.x - g.origin.x, point.y - g.origin.y) < 7) return;
    g.moved = true; if (longTimer.current) clearTimeout(longTimer.current);
    if (!editable) return;
    if (g.source) { showPreview(point); watchEdge(point); return; }
    const box = grid.current!.getBoundingClientRect();
    const left = Math.max(box.left, Math.min(g.origin.x, point.x)), right = Math.min(box.right, Math.max(g.origin.x, point.x));
    const top = Math.max(box.top, Math.min(g.origin.y, point.y)), bottom = Math.min(box.bottom, Math.max(g.origin.y, point.y));
    setRectangle({ left: left - box.left, top: top - box.top, width: right - left, height: bottom - top });
    const ids = new Set<string>();
    for (const card of grid.current!.querySelectorAll<HTMLElement>("[data-lesson-id]")) {
      const b = card.getBoundingClientRect();
      if (b.width && b.height && b.left < right && b.right > left && b.top < bottom && b.bottom > top) ids.add(card.dataset.lessonId!);
    }
    setSelected(ids);
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null; clearTimers(); setRectangle(null); setPreview(null);
    if (grid.current?.hasPointerCapture(e.pointerId)) grid.current.releasePointerCapture(e.pointerId);
    if (!g || g.longPress) return;
    if (!g.moved && g.source) { clickLesson(g.source); return; }
    if (g.source && g.target && editable) {
      const source = g.source;
      const moved = { ...source, startsAt: g.target, endsAt: new Date(Date.parse(g.target) + source.durationMinutes * MINUTE).toISOString() };
      setSelected(new Set([source.id]));
      void mutate([...lessons.filter((l) => l.id !== source.id), moved], () => moveLessonAction({ id: source.id, startsAt: moved.startsAt }), undefined, g.sourceWeek);
    }
  }
  const displayed = preview ? [...lessons.filter((l) => l.id !== preview.id), preview] : lessons;
  const summary = weeklySummary(displayed, week, offset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const contextLesson = menu ? lessons.find((l) => l.id === menu.id) : undefined;
  return <div className="schedule-workspace" aria-busy={pending}>
    <ScheduleToolbar week={week} today={today} resetMonth={todayRequest} offset={offset} editable={editable} busy={pending} onNavigate={(w) => navigate(w)} onToday={() => { setTodayRequest((n) => n + 1); navigate(startOfWeek(today), today); }} onBindings={() => setBindings(true)} onAdd={() => { setMenu(null); setEditor(null); }} onOffset={async (value) => {
      if (lock.current) return;
      const old = offset; lock.current = true; setPending(true); setOffset(value); setMenu(null);
      try {
        const response = await saveSchedulePreferenceAction(value);
        if (response.error) { setOffset(old); setNotice({ text: response.error, error: true }); }
        else startTransition(() => router.refresh());
      } catch { setOffset(old); setNotice({ text: "Не удалось сохранить сдвиг МСК.", error: true }); }
      finally { lock.current = false; setPending(false); }
    }} />
    <div className="schedule-summary"><span>{summary.count} занятий · {Math.floor(summary.minutes / 60)} ч {Math.round(summary.minutes % 60)} мин</span><span className="schedule-save-status">{pending ? "Сохранение…" : "Все 24 часа"}</span></div>
    <div className="schedule-mobile-day">
      <Button variant="ghost" size="sm" aria-label="Предыдущий день" disabled={pending} onClick={() => { const d = addDays(mobileDate, -1); navigate(startOfWeek(d), d); }}>←</Button>
      <strong>{dayNames[days.indexOf(mobileDate)]}, {formatDay(mobileDate)}</strong>
      <Button variant="ghost" size="sm" aria-label="Следующий день" disabled={pending} onClick={() => { const d = addDays(mobileDate, 1); navigate(startOfWeek(d), d); }}>→</Button>
    </div>
    <div className="schedule-day-headers"><span />{days.map((day, i) => <div key={day} className={day === today ? "is-today" : ""} data-mobile-active={day === mobileDate}>{dayNames[i]} <strong>{formatDay(day)}</strong></div>)}</div>
    <div className="schedule-grid-wrapper">
      <div className="schedule-time-labels" aria-label="Часы">{Array.from({ length: 25 }, (_, hour) => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      <div ref={grid} className={`schedule-grid ${editable ? "is-editable" : ""}`} role="group" aria-label="Календарь занятий" tabIndex={0}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { gesture.current = null; clearTimers(); setPreview(null); setRectangle(null); }}
        onContextMenu={(e) => {
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-lesson-id]")?.dataset.lessonId;
          if (editable && id && !pending) { e.preventDefault(); setSelected(new Set([id])); setMenu({ id, x: e.clientX, y: e.clientY }); }
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true],[role=dialog]") || editor !== undefined) return;
          if (e.key === "Escape") { setSelected(new Set()); setMenu(null); gesture.current = null; clearTimers(); setPreview(null); setRectangle(null); }
          if (e.key === "Delete" && editable && !pending) { e.preventDefault(); remove([...selected]); }
          if (e.key === "Enter" && selected.size === 1) { const lesson = lessons.find((l) => selected.has(l.id)); if (lesson) { e.preventDefault(); openLesson(lesson); } }
        }}>
        {days.map((day) => <div key={day} className={`schedule-day ${day === today ? "is-today" : ""}`} data-date={day} data-mobile-active={day === mobileDate}>
          {Array.from({ length: 24 }, (_, h) => <i className="schedule-hour-line" key={h} style={{ top: `${h / 24 * 100}%` }} />)}
          {displayed.flatMap((lesson) => splitLessonByLocalDays(lesson, offset).filter((s) => s.date === day).map((segment) => {
            const start = localParts(lesson.startsAt, offset).time, end = localParts(lesson.endsAt, offset).time;
            const name = editable ? lesson.studentName : lesson.tutorName;
            const label = `${name}, ${start}–${end}${lesson.completed ? ", Проведено" : ""}`;
            return <button key={`${lesson.id}-${day}`} type="button" data-lesson-id={lesson.id} data-date={day} data-color={lesson.color}
              className={`schedule-lesson ${selected.has(lesson.id) ? "is-selected" : ""} ${lesson.completed ? "is-completed" : ""} ${preview?.id === lesson.id ? "is-dragging" : ""}`}
              style={{ top: `${segment.startMinute / 1440 * 100}%`, height: `${(segment.endMinute - segment.startMinute) / 1440 * 100}%` }}
              aria-label={label} aria-pressed={selected.has(lesson.id)} title={`${name}\n${start}–${end}\n${lesson.subjectName}`}
              onClick={(e) => { if (e.detail === 0) clickLesson(lesson); }}>
              <strong>{lesson.completed ? "✓ " : ""}{segment.continuation ? "↳ " : ""}{name}</strong>
              <span>{segment.continuation ? `продолжение до ${end}` : `${start}–${end}`}</span>
            </button>;
          }))}
          {day === today && <div className="schedule-now-line" aria-label={`Текущее время ${localParts(now, offset).time}`} style={{ top: `${minutesFromMidnight(now.getTime(), offset) / 1440 * 100}%` }} />}
        </div>)}
        {rectangle && <div className="schedule-selection" style={rectangle} />}
      </div>
    </div>
    {notice && <div className={`schedule-notice ${notice.error ? "form-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}<button aria-label="Скрыть сообщение" onClick={() => setNotice(null)}>×</button></div>}
    {editor !== undefined && <LessonDialog key={editor?.id ?? "new"} lesson={editor} data={{ ...data, offset }} date={today >= week && today < addDays(week, 7) ? today : week} onClose={() => { setEditor(undefined); grid.current?.focus(); }} onSaved={(id, date) => { setEditor(undefined); setSelected(new Set([id])); navigate(startOfWeek(date), date); startTransition(() => router.refresh()); }} />}
    {menu && contextLesson && editable && <LessonContextMenu lesson={contextLesson} x={menu.x} y={menu.y} onClose={closeMenu} onCompleted={() => complete(contextLesson)} onDelete={() => remove([contextLesson.id])} onColor={(color) => {
      void mutate(lessons.map((l) => l.id === contextLesson.id ? { ...l, color } : l), () => setLessonColorAction({ id: contextLesson.id, color }));
    }} />}
    <Dialog open={bindings} onOpenChange={setBindings}><DialogContent><DialogTitle>Бинды</DialogTitle><DialogDescription>Управление расписанием</DialogDescription><dl className="schedule-bindings">
      {[["Выбрать занятие", "ЛКМ / tap"], ["Открыть занятие", "Повторный ЛКМ / tap"], ["Выбрать несколько", "Протянуть область по сетке"], ["Переместить", "Перетаскивание"], ["Отметить / снять отметку", "Средняя кнопка мыши"], ["Контекстное меню", "ПКМ / удержание на touch"], ["Удалить выбранные", "Delete"], ["Снять выделение / закрыть", "Escape"], ["Открыть выбранное", "Enter"]].map(([action, key]) => <div key={action}><dt>{action}</dt><dd>{key}</dd></div>)}
    </dl></DialogContent></Dialog>
  </div>;
}
function daysafe(date: string, week: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= week && date < addDays(week, 7); }

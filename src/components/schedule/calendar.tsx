"use client";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CircleCheck, CircleAlert, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { syncScheduleAction, scheduleCommandAction } from "@/features/schedule/actions";
import { addDays, formatDay, localParts, localToUtc, MINUTE, minutesFromMidnight, parseWeek, snapMinutes, splitLessonByLocalDays, startOfWeek, weeklySummary } from "@/features/schedule/time";
import type { ScheduleData, ScheduleLesson, SaveState, HistoryEntry } from "@/features/schedule/types";
import { isInactive, isMultiSelectable, isTransferAllowed, applyAvailability, overlapLanes, placeGroup, statusLabel } from "@/features/schedule/operations";
import type { ScheduleCommand, LessonInput } from "@/features/schedule/validation";
import { confirmHistory, replaceTemporaryLessons, type HistoryState } from "@/features/schedule/history";
import { OperationDialog } from "./operation-dialog";
import { LessonDialog } from "./lesson-dialog";
import { ScheduleToolbar } from "./toolbar";
import { LessonContextMenu } from "./context-menu";

const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
type Point = { x: number; y: number };
type Gesture = { origin: Point; last: Point; source?: ScheduleLesson; sourceWeek: string; grabMinutes: number; moved: boolean; longPress: boolean; target?: string; group?: ScheduleLesson[]; noFreeInterval?: boolean };
export function ScheduleCalendar({ data }: { data: ScheduleData }) {
  const path = usePathname(), params = useSearchParams();
  const [now, setNow] = useState(() => new Date(data.now));
  const [todayRequest, setTodayRequest] = useState(0);
  const [offset, setOffset] = useState(data.offset);
  const week = parseWeek(params.get("week") ?? data.week, offset, now);
  const [lessons, setLessons] = useState(data.lessons);
  const [snapshot, setSnapshot] = useState(data);
  const [rules,setRules]=useState(data.studentAvailability ?? []);
  const [historyState,setHistory]=useState<HistoryState>({undo:[],redo:[]});
  const {undo,redo}=historyState;
  const [operation,setOperation]=useState<{kind:"transfer"|"availability";group:ScheduleLesson[]}|null>(null);
  const clipboard=useRef<ScheduleLesson[]>([]);
  const [pasteAnchor,setPasteAnchor]=useState<string|null>(null);
  const [pending, setPending] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const lock = useRef(false);
  const mutationRevision = useRef(0);
  const syncCursor = useRef(data.now);
  if (snapshot !== data) {
    setSnapshot(data);
    if (!pending) { setLessons(data.lessons); setOffset(data.offset); }
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<ScheduleLesson | null | undefined>(undefined);
  const [editorDraft,setEditorDraft]=useState<LessonInput|undefined>();
  const [editorErrors,setEditorErrors]=useState<Record<string,string[]>|undefined>();
  const [bindings, setBindings] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
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
  const [preview, setPreview] = useState<ScheduleLesson[] | null>(null);
  useEffect(() => {
    weekRef.current = week; mobileRef.current = mobileDate;
  }, [week, mobileDate]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(timer); if (edgeTimer.current) clearTimeout(edgeTimer.current); if (longTimer.current) clearTimeout(longTimer.current); };
  }, []);
  useEffect(() => {
    function restoreWeek() { setMenu(null); }
    window.addEventListener("popstate", restoreWeek);
    return () => window.removeEventListener("popstate", restoreWeek);
  }, []);
  useEffect(() => {
    const value = params.get("week");
    if (value !== null && value !== week) {
      const next = new URLSearchParams(params.toString()); next.set("week", week);
      window.history.replaceState(null, "", `${path}?${next}`);
    }
  }, [params, path, week]);
  function navigate(nextWeek: string, day?: string) {
    weekRef.current = nextWeek;
    const nextDay = day ?? (today >= nextWeek && today < addDays(nextWeek, 7) ? today : nextWeek);
    mobileRef.current = nextDay; setActiveDate(nextDay); setMenu(null);
    const next = new URLSearchParams(params.toString()); next.set("week", nextWeek); next.set("day", nextDay);
    window.history.pushState(null, "", `${path}?${next}`);
  }
  function closeMenu() { setMenu(null); grid.current?.focus(); }
  function openLesson(lesson: ScheduleLesson) { setMenu(null); setEditorDraft(undefined); setEditorErrors(undefined); setEditor(lesson); }
  function clickLesson(lesson: ScheduleLesson) {
    if (!isMultiSelectable(lesson)) { openLesson(lesson); return; }
    if (selected.size === 1 && selected.has(lesson.id)) openLesson(lesson);
    else setSelected(new Set([lesson.id]));
  }
  async function mutate(next: ScheduleLesson[], command: ScheduleCommand, success?: string, rollbackWeek?: string, nextRules=rules, nextOffset=offset, historyMode?: "undo"|"redo") {
    if(lock.current)return false;
    lock.current=true; mutationRevision.current++;setPending(true);setSaveState("saving");setMenu(null);
    const previous=lessons, previousRules=rules, previousOffset=offset, previousSelection=selected;
    setLessons(next);setRules(nextRules);setOffset(nextOffset);setSelected(new Set([...selected].filter(id=>next.some(l=>l.id===id&&isMultiSelectable(l)))));
    let failure="Не удалось сохранить изменения. Попробуйте ещё раз.";
    try {
      const result=await scheduleCommandAction(command);
      if(result.error||result.errors){if(command.kind==="create"||command.kind==="edit")setEditorErrors(result.errors);failure=result.error??Object.values(result.errors??{}).flat().join(" ");throw new Error();}
      const canonical=result.replaceAll ? result.lessons??[] : result.lesson ? replaceTemporaryLessons(next,[result.lesson]) : next;
      const canonicalRules=result.rules??nextRules, canonicalOffset=result.offset??nextOffset;
      setLessons(canonical);setRules(canonicalRules);setOffset(canonicalOffset);
      setSelected(new Set([...previousSelection].filter(id=>canonical.some(l=>l.id===id&&isMultiSelectable(l)))));
      if(command.kind==="create"&&result.lesson&&isMultiSelectable(result.lesson))setSelected(new Set([result.lesson.id]));
      if(result.before&&result.after){
        const entry:HistoryEntry={before:result.before,after:result.after,previous,next:canonical,oldRules:previousRules,newRules:canonicalRules,oldOffset:previousOffset,newOffset:canonicalOffset};
        setHistory(current=>confirmHistory(current,entry,historyMode??"commit"));
      }
      if(result.shifted&&result.requestedStart&&result.lesson)toast.info(localParts(result.requestedStart,offset).time+" занято — занятие поставлено на "+localParts(result.lesson.startsAt,offset).time+".");
      else if(result.shifted)toast.info("Группа сдвинута к ближайшему свободному времени.");else if(success)toast.success(success);
      setSaveState("saved");return true;
    }catch{
      setLessons(previous);setRules(previousRules);setOffset(previousOffset);setSelected(previousSelection);setSaveState("error");toast.error(failure);
      if(historyMode){setHistory({undo:[],redo:[]});try{const fresh=await syncScheduleAction(new Date(0).toISOString());setLessons(fresh.lessons);setRules(fresh.rules);setOffset(fresh.offset);}catch{ /* next sync retries */ }}
      if(rollbackWeek&&rollbackWeek!==weekRef.current)navigate(rollbackWeek);return false;
    }finally{lock.current=false;setPending(false);}
  }
  function history(direction:"undo"|"redo"){
    const entry=(direction==="undo"?undo:redo).at(-1);if(!entry||lock.current)return;
    void mutate(direction==="undo"?entry.previous:entry.next,{kind:"restore",expected:direction==="undo"?entry.after:entry.before,target:direction==="undo"?entry.before:entry.after},undefined,undefined,direction==="undo"?entry.oldRules:entry.newRules,direction==="undo"?entry.oldOffset:entry.newOffset,direction);
  }
  function actionGroup(lesson:ScheduleLesson){return selected.has(lesson.id)?lessons.filter(l=>selected.has(l.id)):[lesson];}
  function remove(ids:string[]){if(editable&&ids.length)void mutate(lessons.filter(l=>!ids.includes(l.id)),{kind:"delete",ids},ids.length===1?"Занятие удалено.":`Удалено занятий: ${ids.length}.`);}
  function complete(lesson:ScheduleLesson){
    const group=actionGroup(lesson);if(group.some(isInactive))return;
    const completed=!group.every(l=>l.completed),ids=group.map(l=>l.id);
    void mutate(lessons.map(l=>ids.includes(l.id)?{...l,completed}:l),{kind:"completed",ids,completed},"Отметка обновлена.");
  }
  function paste(){
    if(!clipboard.current.length)return;
    if(!pasteAnchor){toast.error("Сначала выберите место в расписании для вставки.");return;}
    if(startOfWeek(localParts(pasteAnchor,offset).date)!==startOfWeek(today)){toast.error("Вставлять занятия можно только в текущей неделе.");return;}
    const copies=clipboard.current.map(l=>({...l,id:"temp-"+crypto.randomUUID(),completed:false,inactiveReason:null,inactiveUntil:null,isTransferTarget:false,transferSourceId:null,transferSourceStartsAt:null}));
    const placed=placeGroup(copies,pasteAnchor,lessons,offset,rules);
    if(!placed){toast.error("В выбранном интервале нет места для всей группы.");return;}
    void mutate([...lessons,...placed],{kind:"paste",ids:clipboard.current.map(l=>l.id),startsAt:pasteAnchor},"Занятия вставлены.");
  }
  function submitOperation(value:{startsAt?:string;durationMinutes?:number;availableFrom?:string|null}){
    if(!operation)return;const {kind,group}=operation;setOperation(null);
    if(kind==="availability"){
      const studentIds=[...new Set(group.map(l=>l.studentId))];
      const nextRules=[...rules.filter(r=>!studentIds.includes(r.studentId)),...(value.availableFrom?studentIds.map(studentId=>({studentId,availableFrom:value.availableFrom!})):[])];
      void mutate(applyAvailability(lessons,nextRules,offset),{kind,studentIds,availableFrom:value.availableFrom??null},"Правило обновлено.",undefined,nextRules);return;
    }
    if(!group.every(isTransferAllowed)){toast.error("Часть выбранных занятий нельзя перенести.");return;}
    const ids=group.map(l=>l.id);
    const sources=lessons.map(l=>ids.includes(l.id)?{...l,inactiveReason:"transferred" as const,completed:false}:l);
    const targets=group.map(l=>({...l,id:"temp-"+crypto.randomUUID(),durationMinutes:value.durationMinutes??l.durationMinutes,endsAt:new Date(Date.parse(l.startsAt)+(value.durationMinutes??l.durationMinutes)*MINUTE).toISOString(),completed:false,isTransferTarget:true,transferSourceId:l.id,transferSourceStartsAt:l.startsAt}));
    const placed=placeGroup(targets,value.startsAt!,sources,offset,rules);
    if(!placed){toast.error("В выбранном интервале нет места для всей группы.");return;}
    void mutate([...sources,...placed],{kind,ids,startsAt:value.startsAt!,durationMinutes:value.durationMinutes},"Занятия перенесены.");
  }
  async function saveEditor(input:LessonInput){
    setEditorErrors(undefined);
    const start=localToUtc(input.date,input.time,offset), existing=editor;
    const optimistic:ScheduleLesson={...(existing??{}),id:existing?.id??"temp-"+crypto.randomUUID(),tutorId:existing?.tutorId??data.ownerId??lessons[0]?.tutorId??"",tutorName:existing?.tutorName??"Репетитор",studentId:input.studentId,studentName:data.students.find(s=>s.id===input.studentId)?.name??existing?.studentName??"Ученик",subjectId:input.subjectId,subjectName:data.subjects.find(s=>s.id===input.subjectId)?.name??existing?.subjectName??"Предмет",startsAt:start,endsAt:new Date(Date.parse(start)+input.durationMinutes*MINUTE).toISOString(),durationMinutes:input.durationMinutes,color:existing?.color??"default",completed:existing?.completed??false};
    setEditor(undefined);
    const ok=await mutate(applyAvailability([...lessons.filter(l=>l.id!==optimistic.id),optimistic],rules,offset),{...input,kind:existing?"edit":"create",id:existing?.id??null,startsAt:start} as ScheduleCommand,"Занятие сохранено.");
    if(!ok){setEditorDraft(input);setEditor(existing??null);}
    return ok;
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
    const timestamp = Date.parse(localToUtc(day, "00:00", offset)) + Math.min(1435, Math.max(0, snapMinutes(minute - g.grabMinutes))) * MINUTE;
    const source = g.source;
    const desiredStart = new Date(timestamp).toISOString();
    // Only already-visible lessons are used. SQL still resolves hidden student conflicts.
    if(isInactive(source))return;
    const group=selected.has(source.id)?lessons.filter(l=>selected.has(l.id)):[source];
    const anchor=new Date(Date.parse(desiredStart)+Math.min(...group.map(l=>Date.parse(l.startsAt)))-Date.parse(source.startsAt)).toISOString();
    const busy=lessons.filter(l=>!group.some(g=>g.id===l.id));
    const placed=placeGroup(group,anchor,busy,offset,rules);
    g.noFreeInterval=!placed;g.group=placed??undefined;g.target=placed?.find(l=>l.id===source.id)?.startsAt;
    setPreview(placed);
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
    if (lock.current || pending || editor !== undefined || e.button === 2) return;
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
    if (!source) {setSelected(new Set()); const mobile=window.matchMedia("(max-width: 767px)").matches;const day=mobile?mobileDate:addDays(week,Math.min(6,Math.max(0,Math.floor((e.clientX-box.left)/box.width*7))));setPasteAnchor(new Date(Date.parse(localToUtc(day,"00:00",offset))+Math.min(1435,Math.max(0,snapMinutes((e.clientY-box.top)/box.height*1440)))*MINUTE).toISOString());}
    if (source && editable && e.pointerType === "touch") {
      longTimer.current = setTimeout(() => {
        if (!gesture.current || gesture.current.moved) return;
        gesture.current.longPress = true;
        if(!selected.has(source.id))setSelected(new Set(isMultiSelectable(source)?[source.id]:[])); setMenu({ id: source.id, x: e.clientX, y: e.clientY });
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
    if (g.source && isInactive(g.source)) return;
    if (g.source) { showPreview(point); watchEdge(point); return; }
    const box = grid.current!.getBoundingClientRect();
    const left = Math.max(box.left, Math.min(g.origin.x, point.x)), right = Math.min(box.right, Math.max(g.origin.x, point.x));
    const top = Math.max(box.top, Math.min(g.origin.y, point.y)), bottom = Math.min(box.bottom, Math.max(g.origin.y, point.y));
    setRectangle({ left: left - box.left, top: top - box.top, width: right - left, height: bottom - top });
    const ids = new Set<string>();
    for (const card of grid.current!.querySelectorAll<HTMLElement>("[data-lesson-id]")) {
      const b = card.getBoundingClientRect();
      if (b.width && b.height && b.left < right && b.right > left && b.top < bottom && b.bottom > top) { const l=lessons.find(l=>l.id===card.dataset.lessonId); if(l&&isMultiSelectable(l))ids.add(l.id); }
    }
    setSelected(ids);
  }
  function pointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null; clearTimers(); setRectangle(null); setPreview(null);
    if (grid.current?.hasPointerCapture(e.pointerId)) grid.current.releasePointerCapture(e.pointerId);
    if (!g || g.longPress) return;
    if (!g.moved && g.source) { clickLesson(g.source); return; }
    if (g.source && g.moved && g.noFreeInterval && editable) {
      toast.error("В выбранном дне нет свободного интервала для этого занятия.");
      if (weekRef.current !== g.sourceWeek) navigate(g.sourceWeek);
      return;
    }
    if (g.source && g.target && editable) {
      if (startOfWeek(localParts(g.target, offset).date) > startOfWeek(today)) {
        toast.error("Будущая неделя заполняется автоматически после её начала."); navigate(g.sourceWeek); return;
      }
      const source = g.source;
      const moved=g.group??[source];const ids=moved.map(l=>l.id);
      void mutate([...lessons.filter(l=>!ids.includes(l.id)),...moved],{kind:"move",ids,startsAt:new Date(Math.min(...moved.map(l=>Date.parse(l.startsAt)))).toISOString()},"Занятия перемещены.",g.sourceWeek);
    }
  }
  const displayed = useMemo(() => preview ? [...lessons.filter(l => !preview.some(p=>p.id===l.id)), ...preview] : lessons, [lessons, preview]);
  const segmentsByDate = useMemo(() => {
    const map = new Map<string, { lesson: ScheduleLesson; segment: ReturnType<typeof splitLessonByLocalDays>[number] }[]>();
    for (const lesson of displayed) for (const segment of splitLessonByLocalDays(lesson, offset)) {
      const bucket = map.get(segment.date) ?? []; bucket.push({ lesson, segment }); map.set(segment.date, bucket);
    }
    return new Map([...map].map(([date,items])=>[date,overlapLanes(items)]));
  }, [displayed, offset]);
  useEffect(() => {
    let cancelled = false, syncing = false;
    // New rows from any tutor's timezone arrive without replacing the RSC tree.
    const sync = async () => {
      if (document.hidden || syncing || lock.current) return;
      const revision = mutationRevision.current;
      syncing = true;
      try {
        const fresh = await syncScheduleAction(syncCursor.current);
        if (!cancelled && !lock.current && revision === mutationRevision.current) {
          setLessons(current => { const merged = new Map(current.map(l => [l.id,l])); for (const lesson of fresh.lessons) merged.set(lesson.id,lesson); return [...merged.values()]; });
          syncCursor.current = fresh.cursor;setRules(fresh.rules);setOffset(fresh.offset);
        }
      } catch { if (!cancelled) toast.error("Не удалось загрузить новые занятия. Проверьте соединение."); }
      finally { syncing = false; }
    };
    const timer = setInterval(() => void sync(), 60_000);
    document.addEventListener("visibilitychange", sync);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const summary = weeklySummary(displayed, week, offset);
  const keyboardShortcut=useEffectEvent((event:KeyboardEvent)=>{
    if(!(event.ctrlKey||event.metaKey)||lock.current||document.querySelector('[role="dialog"]'))return;
    if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable="true"],[role="combobox"]'))return;
    const key=event.key.toLowerCase();
    if(key==="z"){event.preventDefault();history(event.shiftKey?"redo":"undo");}
    if(editable&&key==="c"){event.preventDefault();clipboard.current=lessons.filter(l=>selected.has(l.id)&&isMultiSelectable(l));}
    if(editable&&key==="v"){event.preventDefault();paste();}
  });
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>keyboardShortcut(event);
    document.addEventListener("keydown",onKeyDown);
    return ()=>document.removeEventListener("keydown",onKeyDown);
  },[]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const contextLesson = menu ? lessons.find((l) => l.id === menu.id) : undefined;
  return <div className="schedule-workspace" aria-busy={pending} onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable=true],[role=dialog]") || editor !== undefined) return;
          if (e.key === "Escape") { setSelected(new Set()); setMenu(null); gesture.current = null; clearTimers(); setPreview(null); setRectangle(null); }
          if (e.key === "Delete" && editable && !pending) { e.preventDefault(); remove([...selected]); }
          if (e.key === "Enter" && grid.current?.contains(e.target as Node) && selected.size === 1) { const lesson = lessons.find((l) => selected.has(l.id)); if (lesson) { e.preventDefault(); openLesson(lesson); } }
        }}>
    <ScheduleToolbar week={week} today={today} resetMonth={todayRequest} offset={offset} editable={editable} busy={pending} onNavigate={(w) => navigate(w)} onToday={() => { setTodayRequest((n) => n + 1); navigate(startOfWeek(today), today); }} onBindings={() => setBindings(true)} onAdd={() => { if (week !== startOfWeek(today)) { toast.error("Добавлять занятия можно только в текущей неделе."); return; } setMenu(null); setEditorDraft(undefined); setEditorErrors(undefined); setEditor(null); }} canUndo={!!undo.length} canRedo={!!redo.length} onUndo={()=>history("undo")} onRedo={()=>history("redo")} onOffset={value=>{void mutate(editable?applyAvailability(lessons,rules,value):lessons,{kind:"offset",offset:value},undefined,undefined,rules,value);}} />    <div className="schedule-summary"><span>{summary.count} занятий · {Math.floor(summary.minutes / 60)} ч {Math.round(summary.minutes % 60)} мин</span><span className="schedule-save-status" data-state={saveState} role="status" aria-live="polite" aria-atomic="true">
      {saveState === "saving" ? <Loader2 size={13} className="spin" aria-hidden="true" /> : saveState === "error" ? <CircleAlert size={13} aria-hidden="true" /> : <CircleCheck size={13} aria-hidden="true" />}
      {saveState === "saving" ? "Сохранение…" : saveState === "error" ? "Не сохранено" : "Сохранено"}
    </span></div>
    <div className="schedule-mobile-day">
      <Button variant="ghost" size="sm" aria-label="Предыдущий день" disabled={pending} onClick={() => { const d = addDays(mobileDate, -1); navigate(startOfWeek(d), d); }}><ChevronLeft size={16} /></Button>
      <strong>{dayNames[days.indexOf(mobileDate)]}, {formatDay(mobileDate)}</strong>
      <Button variant="ghost" size="sm" aria-label="Следующий день" disabled={pending} onClick={() => { const d = addDays(mobileDate, 1); navigate(startOfWeek(d), d); }}><ChevronRight size={16} /></Button>
    </div>
    <div className="schedule-day-headers"><span />{days.map((day, i) => <div key={day} className={day === today ? "is-today" : ""} data-mobile-active={day === mobileDate}>{dayNames[i]} <strong>{formatDay(day)}</strong></div>)}</div>
    <div className="schedule-grid-wrapper">
      <div className="schedule-time-labels" aria-label="Часы">{Array.from({ length: 25 }, (_, hour) => <span key={hour} style={{ top: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}</div>
      <div ref={grid} className={`schedule-grid ${editable ? "is-editable" : ""}`} role="group" aria-label="Календарь занятий" tabIndex={0}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={() => { gesture.current = null; clearTimers(); setPreview(null); setRectangle(null); }}
        onContextMenu={(e) => {
          const id = (e.target as HTMLElement).closest<HTMLElement>("[data-lesson-id]")?.dataset.lessonId;
          if (editable && id && !pending) { e.preventDefault(); if(!selected.has(id)){const l=lessons.find(l=>l.id===id);setSelected(new Set(l&&isMultiSelectable(l)?[id]:[]));} setMenu({ id, x: e.clientX, y: e.clientY }); }
        }}
        >
        {days.map((day) => <div key={day} className={`schedule-day ${day === today ? "is-today" : ""}`} data-date={day} data-mobile-active={day === mobileDate}>
          {Array.from({ length: 24 }, (_, h) => <i className="schedule-hour-line" key={h} style={{ top: `${h / 24 * 100}%` }} />)}
          {(segmentsByDate.get(day) ?? []).map(({ lesson, segment, lane, lanes }) => {
            const start = localParts(lesson.startsAt, offset).time, end = localParts(lesson.endsAt, offset).time;
            const name = editable ? lesson.studentName : lesson.tutorName;
            const label = `${name}, ${start}–${end}${statusLabel(lesson)?", "+statusLabel(lesson):""}${lesson.completed ? ", Проведено" : ""}`;
            return <button key={`${lesson.id}-${day}`} type="button" data-lesson-id={lesson.id} data-date={day} data-color={lesson.color}
              data-inactive={isInactive(lesson)} data-transfer={!!lesson.isTransferTarget}
              className={`schedule-lesson ${selected.has(lesson.id) ? "is-selected" : ""} ${lesson.completed ? "is-completed" : ""} ${preview?.some(p=>p.id===lesson.id) ? "is-dragging" : ""}`}
              style={{ left: `calc(${lane/lanes*100}% + 2px)`, width: `calc(${100/lanes}% - 4px)`, top: `${segment.startMinute / 1440 * 100}%`, height: `${(segment.endMinute - segment.startMinute) / 1440 * 100}%` }}
              aria-label={label} aria-pressed={selected.has(lesson.id)} title={`${name}\n${start}–${end}\n${lesson.subjectName}\n${statusLabel(lesson)}${lesson.transferSourceStartsAt ? "\nПеренесено с "+localParts(lesson.transferSourceStartsAt,offset).date+", "+localParts(lesson.transferSourceStartsAt,offset).time : ""}`}
              onClick={(e) => { if (e.detail === 0) clickLesson(lesson); }}>
              <strong>{lesson.completed && <CircleCheck className="lesson-check" aria-hidden="true" data-testid="lesson-completed" />}{lesson.isTransferTarget?"↪ ":""}{segment.continuation ? "↳ " : ""}{name}</strong>
              <span>{isInactive(lesson) ? statusLabel(lesson) : segment.continuation ? `продолжение до ${end}` : `${start}–${end}`}</span>
            </button>;
          })}
          {day === today && <div className="schedule-now-line" aria-label={`Текущее время ${localParts(now, offset).time}`} style={{ top: `${minutesFromMidnight(now.getTime(), offset) / 1440 * 100}%` }} />}
        </div>)}
        {rectangle && <div className="schedule-selection" style={rectangle} />}
      </div>
    </div>
    {editor !== undefined && <LessonDialog key={editor?.id??"new"} lesson={editor} draft={editorDraft} serverErrors={editorErrors} data={{...data,offset}} date={today} onClose={()=>{setEditor(undefined);setEditorDraft(undefined);setEditorErrors(undefined);grid.current?.focus();}} onSubmitLesson={saveEditor} />}
    {operation&&<OperationDialog {...operation} today={today} offset={offset} rules={rules} onClose={()=>setOperation(null)} onSubmit={submitOperation}/>}
    {menu&&contextLesson&&editable&&<LessonContextMenu lesson={contextLesson} group={actionGroup(contextLesson)} x={menu.x} y={menu.y} onClose={closeMenu} onCompleted={()=>complete(contextLesson)} onDelete={()=>remove(actionGroup(contextLesson).map(l=>l.id))} onTransfer={()=>{setOperation({kind:"transfer",group:actionGroup(contextLesson)});setMenu(null);}} onAvailability={()=>{setOperation({kind:"availability",group:actionGroup(contextLesson)});setMenu(null);}} onColor={color=>{
      const ids=actionGroup(contextLesson).map(l=>l.id);void mutate(lessons.map(l=>ids.includes(l.id)?{...l,color}:l),{kind:"color",ids,color},"Цвет изменён.");
    }}/>}
    <Dialog open={bindings} onOpenChange={setBindings}><DialogContent><DialogTitle>Бинды</DialogTitle><DialogDescription>Управление расписанием</DialogDescription><dl className="schedule-bindings">
      {[["Копировать", "Ctrl+C"], ["Вставить в выбранную точку", "Ctrl+V"], ["Отменить действие", "Ctrl+Z"], ["Вернуть действие", "Ctrl+Shift+Z"], ["Выбрать занятие", "ЛКМ / tap"], ["Открыть занятие", "Повторный ЛКМ / tap"], ["Выбрать несколько", "Протянуть область по сетке"], ["Переместить", "Перетаскивание"], ["Отметить / снять отметку", "Средняя кнопка мыши"], ["Контекстное меню", "ПКМ / удержание на touch"], ["Удалить выбранные", "Delete"], ["Снять выделение / закрыть", "Escape"], ["Открыть выбранное", "Enter"]].map(([action, key]) => <div key={action}><dt>{action}</dt><dd>{key}</dd></div>)}
    </dl></DialogContent></Dialog>
  </div>;
}
function daysafe(date: string, week: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= week && date < addDays(week, 7); }

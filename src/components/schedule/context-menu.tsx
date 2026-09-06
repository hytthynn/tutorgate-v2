"use client";
import { isInactive, isTransferAllowed, isMultiSelectable } from "@/features/schedule/operations";
import { useEffect, useLayoutEffect, useRef } from "react";
import { lessonColors, type LessonColor, type ScheduleLesson } from "@/features/schedule/types";
const colorNames = { default: "Сброс цвета", green: "Зелёный", coral: "Коралловый", gray: "Серый", blue: "Голубой" };
export function LessonContextMenu({ lesson, group=[lesson], x, y, onClose, onColor, onCompleted, onDelete, onTransfer, onAvailability, onCopy }: {
  onCopy?: () => void;
  group?: ScheduleLesson[]; onTransfer?: () => void; onAvailability?: () => void;
  lesson: ScheduleLesson; x: number; y: number; onClose: () => void;
  onColor: (color: LessonColor) => void; onCompleted: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The touch that opened the menu must not activate a swatch on release.
  const freshInteraction = useRef(false);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);
  useEffect(() => {
    function outside(e: PointerEvent) { if (!ref.current?.contains(e.target as Node)) onClose(); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);
  return <div ref={ref} role="menu" aria-label={`Действия: ${lesson.studentName}`} className="lesson-context-menu" style={{ left: x, top: y }}
    onPointerDownCapture={() => { freshInteraction.current = true; }}
    onClickCapture={(e) => { if (!freshInteraction.current) { e.preventDefault(); e.stopPropagation(); } }}
    onKeyDown={(e) => {
    freshInteraction.current = true;
    if (e.key === "Escape" || e.key === "Tab") { e.stopPropagation(); onClose(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <strong>{group.length>1?`Выбрано занятий: ${group.length}`:lesson.studentName}</strong>
    <div className="lesson-color-palette">{lessonColors.map((color) => <button disabled={group.some(isInactive)} key={color} role="menuitemradio" aria-checked={lesson.color === color} aria-label={colorNames[color]} title={colorNames[color]} data-color={color} onClick={() => onColor(color)} />)}</div>
    <button role="menuitem" disabled={group.some(isInactive)} onClick={onCompleted}>{group.every(l=>l.completed) ? "Снять отметку" : "Отметить проведёнными"}</button>
    <button role="menuitem" disabled={!group.every(isTransferAllowed)} onClick={onTransfer}>Перенести…</button>
    <button role="menuitem" onClick={onAvailability}>Заниматься с…</button>
    {["Отчёт по ученику"].map((label) => <button key={label} role="menuitem" disabled title="Скоро">{label}<small>Скоро</small></button>)}
    <button role="menuitem" disabled={!group.some(isMultiSelectable)} onClick={onCopy}>Копировать <small>Ctrl+C</small></button>
    <button role="menuitem" className="lesson-delete" onClick={onDelete}>Удалить</button>
  </div>;
}

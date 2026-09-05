"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addDays, formatDay, weeksInMonth } from "@/features/schedule/time";
const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
export function ScheduleToolbar({ week, today, resetMonth, offset, editable, busy, onNavigate, onToday, onOffset, onAdd, onBindings }: {
  today: string; resetMonth: number;
  week: string; offset: number; editable: boolean; busy: boolean;
  onNavigate: (week: string) => void; onToday: () => void; onOffset: (offset: number) => void; onAdd: () => void; onBindings: () => void;
}) {
  // Thursday identifies the month for arrow navigation; retain a manually selected
  // month while its boundary week still intersects it.
  const anchor = today >= week && today < addDays(week, 7) ? today : addDays(week, 3);
  const [monthChoice, setMonthChoice] = useState(anchor.slice(0, 7));
  const [prevWeek, setPrevWeek] = useState(week);
  const [prevReset, setPrevReset] = useState(resetMonth);
  if (prevWeek !== week) {
    setPrevWeek(week);
    if (!weeksInMonth(Number(monthChoice.slice(0, 4)), Number(monthChoice.slice(5)) - 1).includes(week)) setMonthChoice(anchor.slice(0, 7));
  }
  if (prevReset !== resetMonth) { setPrevReset(resetMonth); setMonthChoice(today.slice(0, 7)); }
  const year = Number(monthChoice.slice(0, 4)), month = Number(monthChoice.slice(5)) - 1;
  const weeks = weeksInMonth(year, month);
  function changeMonth(y: number, m: number) {
    setMonthChoice(`${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}`);
    const available = weeksInMonth(y, m);
    if (!available.includes(week)) onNavigate(available[0]);
  }
  return <div className="schedule-toolbar">
    <div className="schedule-date-selects">
      <select aria-label="Год" value={year} disabled={busy} onChange={(e) => changeMonth(Number(e.target.value), month)}>
        {Array.from({ length: 21 }, (_, i) => year - 10 + i).filter((y) => y >= 100 && y <= 9998).map((y) => <option key={y}>{y}</option>)}
      </select>
      <select aria-label="Месяц" value={month} disabled={busy} onChange={(e) => changeMonth(year, Number(e.target.value))}>{months.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
      <select aria-label="Неделя" value={week} disabled={busy} onChange={(e) => onNavigate(e.target.value)}>{weeks.map((w) => <option key={w} value={w}>{formatDay(w)} — {formatDay(addDays(w, 6))}</option>)}</select>
    </div>
    <div className="schedule-controls-group">
      <Button variant="secondary" size="sm" aria-label="Предыдущая неделя" disabled={busy} onClick={() => onNavigate(addDays(week, -7))}>←</Button>
      <Button variant="secondary" size="sm" aria-label="Следующая неделя" disabled={busy} onClick={() => onNavigate(addDays(week, 7))}>→</Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={onToday}>Текущая</Button>
      <select aria-label="Сдвиг МСК" value={offset} disabled={busy} onChange={(e) => onOffset(Number(e.target.value))}>{Array.from({ length: 25 }, (_, i) => i - 12).map((n) => <option key={n} value={n}>МСК{n > 0 ? `+${n}` : n < 0 ? `−${-n}` : ""}</option>)}</select>
    </div>
    {editable && <div className="schedule-controls-group schedule-edit-controls">
      <Button variant="ghost" size="sm" onClick={onBindings}>Бинды</Button>
      <Button variant="ghost" size="sm" disabled title="Скоро">Отменить</Button>
      <Button variant="ghost" size="sm" disabled title="Скоро">Вернуть</Button>
      <Button size="sm" disabled={busy} onClick={onAdd}>Добавить занятие</Button>
    </div>}
  </div>;
}

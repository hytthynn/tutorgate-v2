"use client";
import { Select } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Keyboard, Undo2, Redo2, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { startOfWeek } from "@/features/schedule/time";
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
      <Select aria-label="Год" value={year} disabled={busy} onValueChange={(value) => changeMonth(Number(value), month)}>
        {Array.from({ length: 5 }, (_, i) => Number(today.slice(0, 4)) - 2 + i).filter((y) => y >= 100 && y <= 9998).map((y) => <option key={y}>{y}</option>)}
      </Select>
      <Select aria-label="Месяц" value={month} disabled={busy} onValueChange={(value) => changeMonth(year, Number(value))}>{months.map((m, i) => <option key={m} value={i}>{m}</option>)}</Select>
      <Select aria-label="Неделя" value={week} disabled={busy} onValueChange={(value) => onNavigate(value)}>{weeks.map((w) => <option key={w} value={w}>{formatDay(w)} — {formatDay(addDays(w, 6))}</option>)}</Select>
    </div>
    <div className="schedule-controls-group">
      <Select aria-label="Сдвиг МСК" value={offset} disabled={busy} onValueChange={(v) => onOffset(Number(v))}>{Array.from({ length: 25 }, (_, i) => i - 12).map(n => <option key={n} value={n}>МСК{n > 0 ? `+${n}` : n < 0 ? `−${-n}` : ""}</option>)}</Select>
      <Button variant="secondary" size="sm" aria-label="Предыдущая неделя" disabled={busy} onClick={() => onNavigate(addDays(week, -7))}><ChevronLeft size={16} /></Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={onToday}>Текущая</Button>
      <Button variant="secondary" size="sm" aria-label="Следующая неделя" disabled={busy} onClick={() => onNavigate(addDays(week, 7))}><ChevronRight size={16} /></Button>
    </div>
    {editable && <div className="schedule-controls-group schedule-edit-controls">
      <Tooltip text="Бинды"><Button variant="ghost" size="sm" aria-label="Бинды" onClick={onBindings}><Keyboard size={16} /></Button></Tooltip>
      <Tooltip text="Отменить — скоро"><Button variant="ghost" size="sm" disabled aria-label="Отменить — скоро"><Undo2 size={16} /></Button></Tooltip>
      <Tooltip text="Вернуть — скоро"><Button variant="ghost" size="sm" disabled aria-label="Вернуть — скоро"><Redo2 size={16} /></Button></Tooltip>
      {week === startOfWeek(today) ? (
        <Button size="sm" disabled={busy} onClick={onAdd}><Plus size={16} />Добавить занятие</Button>
      ) : (
        <Tooltip text={week > startOfWeek(today) ? "Занятия будущей недели появятся автоматически в начале недели." : "Добавлять занятия можно только в текущей неделе."}>
          <Button size="sm" disabled onClick={onAdd}><Plus size={16} />Добавить занятие</Button>
        </Tooltip>
      )}
    </div>}
  </div>;
}

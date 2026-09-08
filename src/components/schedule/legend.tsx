"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ScheduleLegend() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="sm" aria-label="Обозначения цветов" onClick={() => setOpen(true)}>Обозначения</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogTitle>Обозначения цветов</DialogTitle>
      <DialogDescription>Статус занятия имеет приоритет над основным цветом.</DialogDescription>
      <h3>Статусы</h3>
      <ul>
        <li><span className="legend-swatch" data-color="green" aria-hidden="true">✓</span> Зелёный — проведено.</li>
        <li><span className="legend-swatch" data-color="blue" aria-hidden="true">↪</span> Синий — перенесённое занятие.</li>
        <li><span className="legend-swatch" data-color="gray" aria-hidden="true">▧</span> Серый со штриховкой — неактивное занятие: исходное перенесённое или недоступное до указанной даты.</li>
      </ul>
      <h3>Основные цвета</h3>
      <ul>
        <li><span className="legend-swatch" aria-hidden="true" /> Стандартный — обычное занятие.</li>
        <li><span className="legend-swatch" data-color="coral" aria-hidden="true" /> Красный — отдельная группа пересечений. После создания нельзя менять дату, время и длительность.</li>
        <li>Зелёный, синий и серый можно выбрать вручную. Основной цвет сохраняется и возвращается после снятия статуса.</li>
      </ul>
    </DialogContent></Dialog>
  </>;
}

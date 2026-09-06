"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
export function EmptyContextMenu({ x, y, canPaste, disabled, onPaste, onCreate, onClose }: {
  x: number; y: number; canPaste: boolean; disabled: boolean; onPaste: () => void; onCreate: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!, box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);
  return <div ref={ref} role="menu" aria-label="Действия в точке расписания" className="lesson-context-menu" style={{ left: x, top: y }} onKeyDown={e => {
    e.stopPropagation();
    if (e.key === "Escape" || e.key === "Tab") { onClose(); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const items = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }}>
    {canPaste && <button role="menuitem" disabled={disabled} onClick={onPaste}>Вставить <small>Ctrl+V</small></button>}
    <button role="menuitem" disabled={disabled} onClick={onCreate}>Создать занятие здесь</button>
    {disabled && <small>Доступно только в текущей неделе</small>}
  </div>;
}

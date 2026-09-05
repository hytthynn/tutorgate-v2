"use client";
import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = { value: string; label: string; disabled?: boolean };
function text(node: ReactNode): string {
  return Children.toArray(node).map(n => isValidElement<{ children?: ReactNode }>(n) ? text(n.props.children) : String(n)).join("");
}
function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(n => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(n)) return [];
    if (n.type === Fragment) return readOptions(n.props.children);
    return [{ value: String(n.props.value ?? text(n.props.children)), label: text(n.props.children), disabled: n.props.disabled }];
  });
}
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "multiple" | "size"> & {
  searchable?: boolean; onValueChange?: (value: string) => void;
};
/** Shared listbox. Option children are data only: no native select is rendered. */
export function Select({ children, value, defaultValue, onValueChange, searchable = false, name, id, disabled, required, className, ...aria }: SelectProps) {
  const options = readOptions(children);
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selected = String(value ?? internal);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filtered = options.filter(o => o.label.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  function close(returnFocus = true) { setOpen(false); setQuery(""); if (returnFocus) trigger.current?.focus(); }
  function choose(option: Option) {
    if (option.disabled) return;
    setInternal(option.value); onValueChange?.(option.value); close();
  }
  function expand() {
    if (disabled) return;
    setQuery(""); setActive(Math.max(0, options.findIndex(o => o.value === selected && !o.disabled)));
    setContainer(trigger.current?.closest<HTMLElement>(".dialog-content") ?? document.body); setOpen(true);
  }
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = trigger.current!.getBoundingClientRect();

      const height = Math.min(300, window.innerHeight - 24);
      const above = window.innerHeight - r.bottom < Math.min(height, 180) && r.top > 180;
      const maxHeight = Math.min(height, above ? r.top - 12 : window.innerHeight - r.bottom - 12);
      const width = Math.min(Math.max(r.width, 200), window.innerWidth - 24);
      Object.assign(popup.current!.style, { top: `${above ? r.top - maxHeight - 4 : r.bottom + 4}px`, left: `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`, width: `${width}px`, maxHeight: `${maxHeight}px` });
    }
    place();
    (searchable ? search.current : trigger.current)?.focus();
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false); };
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); };
  }, [open, container, searchable]);
  useEffect(() => { popup.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  function keyboard(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "Tab") { close(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (!open) { expand(); return; }
      let next = e.key === "Home" ? 0 : e.key === "End" ? filtered.length - 1 : active + (e.key === "ArrowDown" ? 1 : -1);
      const direction = e.key === "ArrowUp" || e.key === "End" ? -1 : 1;
      for (let i = 0; i < filtered.length; i++) {
        next = (next + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) break;
        next += direction;
      }
      setActive(next);
    }
    if (e.key === "Enter" || (e.key === " " && e.target === trigger.current)) {
      e.preventDefault(); if (!open) expand(); else if (filtered[active]) choose(filtered[active]);
    }
    if (open && !searchable && e.key.length === 1) {
      const next = filtered.findIndex(o => !o.disabled && o.label.toLocaleLowerCase("ru").startsWith(e.key.toLocaleLowerCase("ru")));
      if (next >= 0) setActive(next);
    }
  }
  return <span className={`tg-select ${className ?? ""}`}>
    {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
    <button type="button" ref={trigger} id={id} className="tg-select-trigger" disabled={disabled}
      role="combobox" aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]}
      aria-describedby={aria["aria-describedby"]} aria-invalid={aria["aria-invalid"]}
      aria-activedescendant={open && !searchable && filtered[active] ? `${listId}-${active}` : undefined} aria-required={required} aria-controls={listId} aria-expanded={open} aria-haspopup="listbox"
      onClick={() => open ? close() : expand()} onKeyDown={keyboard}>
      <span>{options.find(o => o.value === selected)?.label ?? selected}</span><ChevronDown size={15} aria-hidden />
    </button>
    {open && !disabled && container && createPortal(<div ref={popup} className="tg-select-popup" data-tg-popup tabIndex={-1} onKeyDown={keyboard}>
      {searchable && <div className="tg-select-search"><Search size={15} aria-hidden /><input ref={search} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-label="Поиск в списке" autoComplete="off" value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} aria-controls={listId} aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined} /></div>}
      <div id={listId} role="listbox" aria-label={aria["aria-label"] ?? "Варианты"} aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}>
        {filtered.length ? filtered.map((o, i) => <div role="option" id={`${listId}-${i}`} key={o.value} data-index={i} aria-selected={o.value === selected} aria-disabled={o.disabled || undefined} className={`tg-select-option ${i === active ? "is-active" : ""}`} onPointerMove={() => !o.disabled && setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(o)}><span>{o.label}</span>{o.value === selected && <Check size={15} aria-hidden />}</div>) : <p className="tg-select-empty">Ничего не найдено</p>}
      </div>
    </div>, container)}
  </span>;
}

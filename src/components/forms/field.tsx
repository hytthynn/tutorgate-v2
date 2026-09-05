"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useFieldError } from "./validated-form";
export function Field({
  label,
  name,
  error: serverError,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string[];
  hint?: string;
  children: ReactNode;
}) {
  const error = useFieldError(name,serverError);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    for(const control of ref.current?.querySelectorAll("input,button[role=combobox],textarea,select") ?? []) {
      control.setAttribute("aria-invalid",String(!!error?.length));
      if(error?.length)control.setAttribute("aria-describedby",`${name}-error`); else control.removeAttribute("aria-describedby");
    }
  },[error,name]);
  return (
    <div className="field" ref={ref}>
      <label htmlFor={name}>{label}</label>
      {children}
      {error?.[0] ? (
        <p className="field-error" id={`${name}-error`} role="alert">
          {error[0]}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

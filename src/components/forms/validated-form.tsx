"use client";
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps } from "react";
import { z } from "zod";
import { applicationSchema, assignmentSchema, forgotPasswordSchema, hourlyRateSchema, idSchema, loginSchema, registrationSchema, resetPasswordSchema, subjectSchema, tutorSubjectsSchema } from "@/lib/validation/schemas";
type Errors = Record<string, string[]>;
export const ValidationContext = createContext<{ errors: Errors; dirty: Set<string>; fieldChanged?: (name: string, value: string) => void }>({ errors: {}, dirty: new Set() });
export function FieldError({ name, error }: { name: string; error?: string[] }) {
  const messages=useFieldError(name,error);
  const ref=useRef<HTMLSpanElement>(null);
  useEffect(()=>{for(const control of ref.current?.closest("form")?.querySelectorAll(`[name="${name}"]`)??[]){control.setAttribute("aria-invalid",String(!!messages?.length));if(messages?.length)control.setAttribute("aria-describedby",`${name}-error`);else control.removeAttribute("aria-describedby");}},[name,messages]);
  return <span ref={ref}>{messages?.length ? <span className="field-error" id={`${name}-error`} role="alert">{messages[0]}</span> : null}</span>;
}
export function useFieldError(name: string, server?: string[]) {
  const context = useContext(ValidationContext);
  return context.errors[name] ?? (context.dirty.has(name) ? undefined : server);
}
export function ValidatedForm({ kind, children, ...props }: ComponentProps<"form"> & { kind?: "login" | "register" | "forgot" | "reset" | "application" }) {
  const attempted = useRef(false);
  const ref=useRef<HTMLFormElement>(null);
  const [errors,setErrors] = useState<Errors>({});
  const [dirty,setDirty] = useState<Set<string>>(new Set());
  function validate(form: HTMLFormElement, change?: { name: string; value: string }) {
    const data = new FormData(form);
    if(change)data.set(change.name,change.value);
    const values = { ...Object.fromEntries(data), subject_ids: data.getAll("subject_ids"), privacy: data.get("privacy") === "on" };
    const schema = kind ? { login: loginSchema, register: registrationSchema, forgot: forgotPasswordSchema, reset: resetPasswordSchema, application: applicationSchema }[kind] : ({ rate: hourlyRateSchema, subject_add: subjectSchema, assignment: assignmentSchema, tutor_subjects: tutorSubjectsSchema, assignment_remove: idSchema, subject_remove: idSchema } as Record<string,z.ZodType>)[String(data.get("operation"))];
    const parsed = schema?.safeParse(values);
    const next: Errors = parsed && !parsed.success ? z.flattenError(parsed.error).fieldErrors as Errors : {};
    setErrors(next);
    return next;
  }
  return <ValidationContext.Provider value={{ errors, dirty, fieldChanged: (name,value)=>{setDirty(current=>new Set([...current,name]));if(attempted.current&&ref.current)validate(ref.current,{name,value});} }}><form {...props} ref={ref} noValidate onSubmit={event => {
    attempted.current=true; const next=validate(event.currentTarget);
    if (Object.keys(next).length) { event.preventDefault(); event.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus(); return; }
    setDirty(new Set()); props.onSubmit?.(event);
  }} onChange={event => {
    const name=(event.target as unknown as HTMLInputElement).name;
    setDirty(current=>new Set([...current,name]));
    if(attempted.current)validate(event.currentTarget);
    props.onChange?.(event);
  }}>{children}</form></ValidationContext.Provider>;
}


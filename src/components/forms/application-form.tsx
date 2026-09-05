"use client";
import { ValidatedForm, FieldError } from "./validated-form";
import Link from "next/link";
import { useFeedback } from "@/components/ui/toaster";
import { Select } from "@/components/ui/select";
import { useActionState, useState } from "react";
import {
  GraduationCap,
  BookOpen,
  ArrowUpRight,
  Check,
  ArrowRight,
} from "lucide-react";
import { applyAction } from "@/features/applications/actions";
import { goals, experiences } from "@/lib/validation/schemas";
import { Field } from "./field";
import { Button } from "@/components/ui/button";
import type { Subject, ActionState } from "@/types";
export function ApplicationForm({
  subjects,
  unavailable = false,
}: {
  subjects: Subject[];
  unavailable?: boolean;
}) {
  const [role, setRole] = useState<"student" | "tutor">("student");
  const [state, action, pending] = useActionState(
    applyAction,
    {} as ActionState,
  );
  useFeedback(state, false);
  if (state.success)
    return (
      <div className="success-state" role="status">
        <span className="success-icon">
          <Check size={24} />
        </span>
        <span className="eyebrow">ЕЩЁ ОДИН ШАГ</span>
        <h2>Подтвердите Telegram</h2>
        <p>{state.success}</p>
        <Button asChild>
          <a href={state.url}>
            Продолжить в Telegram
            <ArrowUpRight size={16} />
          </a>
        </Button>
        <p className="field-hint">
          В боте нажмите Start. Ссылка действует 24 часа.
        </p>
      </div>
    );
  return (
    <>
      <div className="auth-heading"><span className="eyebrow">НАЧНЁМ ЗНАКОМСТВО</span><h1>Заявка в TutorGate</h1><p>Расскажите немного о себе.</p></div>
      <div className="role-tabs" role="tablist" aria-label="Тип заявки">
        <button
          type="button"
          role="tab"
          aria-selected={role === "student"}
          onClick={() => setRole("student")}
        >
          <GraduationCap size={18} />Я ученик
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={role === "tutor"}
          onClick={() => setRole("tutor")}
        >
          <BookOpen size={17} />Я репетитор
        </button>
      </div>
      <ValidatedForm kind="application" action={action} className="form-stack">
        <input type="hidden" name="role" value={role} />
        <Field label="ФИО" name="full_name" error={state.errors?.full_name}>
          <input
            id="full_name"
            name="full_name"
            placeholder="Иванов Иван Иванович"
            autoComplete="name"
            required
            maxLength={150}
          />
        </Field>
        <Field
          label="Telegram"
          name="telegram_username"
          error={state.errors?.telegram_username}
          hint="Сюда придёт ссылка для регистрации"
        >
          <div className="input-prefix">
            <span>@</span>
            <input
              id="telegram_username"
              name="telegram_username"
              placeholder="username"
              required
              maxLength={33}
              autoComplete="off"
            />
          </div>
        </Field>
        <fieldset className="field">
          <legend>
            Предметы<span className="label-note">Можно выбрать несколько</span>
          </legend>
          <div className="subject-options">
            {subjects.map((s) => (
              <label key={s.id} className="subject-option">
                <input name="subject_ids" type="checkbox" value={s.id} />
                <span>
                  <Check size={13} />
                  {s.name}
                </span>
              </label>
            ))}
          </div>
          {!subjects.length && (
            <p className="field-hint">
              {unavailable
                ? "Не удалось загрузить предметы. Попробуйте позже."
                : "Пока нет доступных предметов. Попробуйте позже."}
            </p>
          )}
          <FieldError name="subject_ids" error={state.errors?.subject_ids} />
        </fieldset>
        {role === "student" ? (
          <Field
            label="Цель занятий"
            name="student_goal"
            error={state.errors?.student_goal}
          >
            <Select
              id="student_goal"
              name="student_goal"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Выберите цель
              </option>
              {goals.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field
            label="Опыт преподавания"
            name="teaching_experience"
            error={state.errors?.teaching_experience}
          >
            <Select
              id="teaching_experience"
              name="teaching_experience"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Выберите опыт
              </option>
              {experiences.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
        )}
        <div>
          <label className="consent">
            <input name="privacy" type="checkbox" required />
            <span>Я согласен с обработкой персональных данных</span>
          </label>
          <FieldError name="privacy" error={state.errors?.privacy} />
        </div>
        <Button
          disabled={!subjects.length}
          loading={pending}
          loadingText="Отправляем…"
          type="submit"
          className="full-width"
        >
          Подать заявку
          <ArrowRight size={16} />
        </Button>
      </ValidatedForm>
      <div className="auth-bottom"><span>Уже есть аккаунт?</span><Link href="/login">Войти</Link></div>
    </>
  );
}

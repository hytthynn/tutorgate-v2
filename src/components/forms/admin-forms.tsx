"use client";
import { toast } from "@/components/ui/toaster";
import { Select } from "@/components/ui/select";
import { useActionState, useState } from "react";
import { useForm } from "react-hook-form";
import { SlidersHorizontal, Plus, X, ArrowRight } from "lucide-react";
import { adminAction } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field } from "./field";
import type {
  Subject,
  Profile,
  Assignment,
  TutorSubject,
  ActionState,
} from "@/types";
async function runAdminAction(previous: ActionState, form: FormData): Promise<ActionState> {
  const state = await adminAction(previous, form);
  // Dispatch before the deleted subject row unmounts; the global toaster survives.
  if (state.success) toast.success(state.success);
  if (state.error && !state.errors) toast.error(state.error);
  return state;
}
function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.errors &&
        Object.entries(state.errors)
          .filter(([k]) => !["name", "hourly_rate", "subject_id", "tutor_id"].includes(k))
          .map(([k, v]) => (
            <p className="field-error" role="alert" key={k}>
              {v[0]}
            </p>
          ))}
    </>
  );
}
export function TutorSubjectsDialog({
  tutor,
  subjects,
  assigned,
}: {
  tutor: Profile;
  subjects: Subject[];
  assigned: string[];
}) {
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal size={14} />
          Предметы
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Предметы репетитора</DialogTitle>
        <DialogDescription>{tutor.full_name}</DialogDescription>
        <form action={action} className="form-stack">
          <input type="hidden" name="operation" value="tutor_subjects" />
          <input type="hidden" name="tutor_id" value={tutor.id} />
          <div className="dialog-checklist">
            {subjects
              .filter((s) => s.is_active)
              .map((s) => (
                <label
                  key={`${s.id}-${assigned.includes(s.id)}`}
                  className="checklist-row"
                >
                  <input
                    name="subject_ids"
                    type="checkbox"
                    value={s.id}
                    defaultChecked={assigned.includes(s.id)}
                  />
                  {s.name}
                </label>
              ))}
          </div>
          <p className="field-hint">
            Чтобы снять предмет с назначенными учениками, сначала измените их
            назначения. История занятий сохраняется при удалении предмета.
          </p>
          <Feedback state={state} />
          <Button type="submit" loading={pending} loadingText="Сохраняем…">
            Сохранить изменения
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function AssignmentDialog({
  student,
  subjects,
  tutors,
  tutorSubjects,
  assignments,
}: {
  student: Profile;
  subjects: Subject[];
  tutors: Profile[];
  tutorSubjects: TutorSubject[];
  assignments: Assignment[];
}) {
  const [selected, setSelected] = useState("");
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  const available = tutors.filter((t) =>
    tutorSubjects.some(
      (ts) => ts.tutor_id === t.id && ts.subject_id === selected,
    ),
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal size={14} />
          Назначения
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Назначения ученика</DialogTitle>
        <DialogDescription>{student.full_name}</DialogDescription>
        <div className="assignment-list">
          {assignments.map((a) => (
            <div className="assignment-row" key={a.id}>
              <div>
                <strong>
                  {subjects.find((s) => s.id === a.subject_id)?.name}
                </strong>
                <small>
                  {tutors.find((t) => t.id === a.tutor_id)?.full_name}
                </small>
              </div>
              <RemoveAssignment id={a.id} />
            </div>
          ))}
        </div>
        <form action={action} className="form-stack">
          <input type="hidden" name="operation" value="assignment" />
          <input type="hidden" name="student_id" value={student.id} />
          <Field name="subject_id" label="Предмет" error={state.errors?.subject_id}>
            <Select
              name="subject_id"
              id="subject_id"
              required
              value={selected}
              onValueChange={(value) => setSelected(value)}
            >
              <option value="" disabled>
                Выберите предмет
              </option>
              {subjects
                .filter((s) => s.is_active)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field name="tutor_id" label="Репетитор" error={state.errors?.tutor_id}>
            <Select searchable
              name="tutor_id"
              id="tutor_id"
              required
              disabled={!selected || !available.length}
              key={selected}
              defaultValue=""
            >
              <option value="" disabled>
                {selected && !available.length
                  ? "Нет репетиторов с этим предметом"
                  : "Выберите репетитора"}
              </option>
              {available.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="field-hint">
            Если предмет уже назначен, репетитор будет заменён.
          </p>
          <Feedback state={state} />
          <Button type="submit" loading={pending} loadingText="Назначаем…" disabled={!available.length}>
            Назначить репетитора
            <ArrowRight size={15} />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function RemoveAssignment({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  return (
    <form action={action}>
      <input type="hidden" name="operation" value="assignment_remove" />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        loading={pending}
        aria-label={pending ? "Снятие назначения…" : "Снять назначение"}
      >
        <X size={15} />
      </Button>
      <Feedback state={state} />
    </form>
  );
}
export function RateForm({ rate }: { rate: number }) {
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  const { register } = useForm({ defaultValues: { hourly_rate: rate } });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation" value="rate" />
      <Field
        name="hourly_rate"
        label="Ставка за час"
        error={state.errors?.hourly_rate}
      >
        <div className="rate-input">
          <input
            id="hourly_rate"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            {...register("hourly_rate")}
          />
          <span>₽ / час</span>
        </div>
      </Field>
      <Feedback state={state} />
      <Button loading={pending} loadingText="Сохраняем…" type="submit" className="align-start">
        Сохранить ставку
      </Button>
    </form>
  );
}
export function AddSubjectForm() {
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="operation" value="subject_add" />
      <Field name="name" label="Новый предмет" error={state.errors?.name}>
        <div className="inline-form">
          <input
            id="name"
            name="name"
            required
            placeholder="Название предмета"
            maxLength={80}
          />
          <Button type="submit" loading={pending} loadingText="Добавляем…" variant="secondary">
            <Plus size={16} />
            Добавить
          </Button>
        </div>
      </Field>
      <Feedback state={state} />
    </form>
  );
}
export function RemoveSubject({ subject }: { subject: Subject }) {
  const [state, action, pending] = useActionState(
    runAdminAction,
    {} as ActionState,
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Удалить предмет ${subject.name}`}
        >
          <X size={15} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Удалить предмет «{subject.name}»?</DialogTitle>
        <DialogDescription>
          Предмет будет полностью удалён из текущих назначений и списков. История уже созданных занятий сохранится.
        </DialogDescription>
        <form action={action} className="form-stack">
          <input type="hidden" name="operation" value="subject_remove" />
          <input type="hidden" name="id" value={subject.id} />
          <Feedback state={state} />
          <Button type="submit" loading={pending} loadingText="Удаляем…" variant="destructive">
            Удалить предмет
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

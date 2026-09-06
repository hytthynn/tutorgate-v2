import type { ScheduleData, ScheduleLesson } from "./types";
import type { LessonInput } from "./validation";
export function initialSubject(
  lesson: ScheduleLesson | null,
  draft?: LessonInput,
) {
  if (draft)
    return (
      draft.subjectId ??
      (lesson && !draft.subjectChanged ? "__historical__" : "")
    );
  return lesson ? (lesson.subjectId ?? "__historical__") : "";
}
export function lessonChoices(data: ScheduleData, studentId: string) {
  const subjects = studentId
    ? data.subjects.filter(
        (s) =>
          !data.assignments ||
          data.assignments.some(
            (a) => a.studentId === studentId && a.subjectId === s.id,
          ),
      )
    : [];
  return {
    subjects,
    studentPlaceholder: data.students.length
      ? "Выберите ученика"
      : "Нет доступных учеников",
    subjectPlaceholder: !studentId
      ? "Сначала выберите ученика"
      : subjects.length
        ? "Выберите предмет"
        : "Нет доступных предметов",
  };
}

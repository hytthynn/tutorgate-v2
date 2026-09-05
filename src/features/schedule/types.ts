import type { Role } from "@/types";
export const lessonColors = ["default", "green", "coral", "gray", "blue"] as const;
export type LessonColor = (typeof lessonColors)[number];
export interface ScheduleLesson {
  id: string;
  tutorId: string;
  studentId: string;
  studentName: string;
  tutorName: string;
  subjectId: string | null;
  subjectName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  color: LessonColor;
  completed: boolean;
}
export interface ScheduleData {
  now: string;
  role: Role;
  week: string;
  offset: number;
  lessons: ScheduleLesson[];
  students: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  assignments?: { studentId: string; subjectId: string }[];
}
export interface ScheduleResult {
  error?: string;
  errors?: Record<string, string[]>;
  id?: string;
  note?: string;
  lesson?: ScheduleLesson;
  ids?: string[];
  shifted?: boolean;
  requestedStart?: string;
}

export type SaveState = "saving" | "saved" | "error";

import type { Role } from "@/types";
export const lessonColors = ["default", "green", "coral", "gray", "blue"] as const;
export type LessonColor = (typeof lessonColors)[number];
export interface ScheduleLesson {
  id: string;
  tutorId: string;
  studentId: string;
  studentName: string;
  tutorName: string;
  subjectId: string;
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
}
export interface ScheduleResult {
  error?: string;
  errors?: Record<string, string[]>;
  id?: string;
  note?: string;
}

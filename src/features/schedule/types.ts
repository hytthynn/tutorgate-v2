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
  inactiveReason?: "transferred" | "available_from" | null;
  inactiveUntil?: string | null;
  isTransferTarget?: boolean;
  transferSourceId?: string | null;
  transferSourceStartsAt?: string | null;
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
  studentAvailability?: AvailabilityRule[];
  ownerId?: string;
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
  lessons?: ScheduleLesson[];
  rules?: AvailabilityRule[];
  offset?: number;
  before?: SignedSnapshot;
  after?: SignedSnapshot;
  replaceAll?: boolean;
  createdIds?: string[];
}
export type AvailabilityRule = { studentId: string; availableFrom: string };
export type SignedSnapshot = { payload: Record<string, unknown>; signature: string };
export type HistoryEntry = { before: SignedSnapshot; after: SignedSnapshot; previous: ScheduleLesson[]; next: ScheduleLesson[]; oldRules: AvailabilityRule[]; newRules: AvailabilityRule[]; oldOffset: number; newOffset: number };

export type SaveState = "saving" | "saved" | "error";

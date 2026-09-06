export type Role = "student" | "tutor" | "admin";
export type Profile = {
  id: string;
  role: Role;
  full_name: string;
  telegram_username: string | null;
};
export type AccountStatus = "active" | "blocked" | "deleted";
export type AdminDirectoryProfile = Profile & {
  login: string | null;
  telegram_user_id: string | null;
  account_status: AccountStatus;
  blocked_at: string | null;
};
export type Subject = { id: string; name: string; is_active: boolean };
export type Assignment = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
};
export type TutorSubject = { tutor_id: string; subject_id: string };
export type ActionState = {
  error?: string;
  errors?: Record<string, string[]>;
  success?: string;
  url?: string;
  hourlyRate?: number;
};

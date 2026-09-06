export type ApplicationStatus = "pending_telegram" | "pending_review" | "approved" | "rejected" | "registered" | "expired";
export type ReviewAction = "approve" | "reject" | "resend";
export type ApplicationBucket = "pending_review" | "approved" | "rejected";
export type AdminApplication = {
  id: string; role: "student" | "tutor"; full_name: string; telegram_username: string;
  subjects: string[]; student_goal: string | null; teaching_experience: string | null;
  created_at: string; telegram_verified_at: string | null; status: ApplicationStatus;
  reviewed_at: string | null; reviewed_by_name: string | null; registered_at: string | null;
  link_expires_at: string | null; delivery_status: "pending" | "sent" | "failed" | null; can_resend: boolean;
};
export type ApplicationQueue = { items: AdminApplication[]; total: number };
export type ReviewResult = { success?: string; error?: string; warning?: string };
export const statusLabels: Record<ApplicationStatus, string> = {
 pending_telegram: "Ожидает Telegram", pending_review: "На рассмотрении", approved: "Принята",
 rejected: "Отклонена", registered: "Зарегистрирован", expired: "Подтверждение истекло",
};
export function reviewAllowed(status: ApplicationStatus, action: ReviewAction) {
 return action === "resend" ? status === "approved" : status === "pending_review";
}
export function applicationBucket(status: ApplicationStatus): ApplicationBucket | null {
 return status === "registered" ? "approved" : status === "pending_review" || status === "approved" || status === "rejected" ? status : null;
}

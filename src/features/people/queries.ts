import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/access";
import type { Assignment, Profile, Subject, TutorSubject } from "@/types";
export async function getDirectory() {
  const viewer = await requireRole();
  const db = await createClient();
  async function readProfiles() {
    const rows: Profile[] = [];
    for (let page = 0; ; page++) {
      const { data, error } = await db.rpc(viewer.role === "admin" ? "admin_directory_profiles" : "visible_profiles").order("id").range(page * 500, page * 500 + 499);
      if (error || !Array.isArray(data)) throw new Error("Directory unavailable");
      rows.push(...data as Profile[]);
      if (data.length < 500) return { data: rows, error: null };
    }
  }
  const [profiles, subjects, assignments, tutorSubjects] = await Promise.all([
    readProfiles(),
    db.from("subjects").select("id,name,is_active").order("name"),
    db
      .from("student_tutor_assignments")
      .select("id,student_id,tutor_id,subject_id"),
    db.from("tutor_subjects").select("tutor_id,subject_id"),
  ]);
  if ([profiles, subjects, assignments, tutorSubjects].some((r) => r.error))
    throw new Error("Directory unavailable");
  return {
    viewer,
    profiles: (profiles.data ?? []) as Profile[],
    subjects: (subjects.data ?? []) as Subject[],
    assignments: (assignments.data ?? []) as Assignment[],
    tutorSubjects: (tutorSubjects.data ?? []) as TutorSubject[],
  };
}

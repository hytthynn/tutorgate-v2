import "server-only";
import { requireRole } from "@/lib/auth/access";
import { serviceRpc } from "@/lib/supabase/admin";
import type { ApplicationBucket, ApplicationQueue } from "./types";
export async function getAdminApplications(role: "student" | "tutor", bucket: ApplicationBucket, page = 0): Promise<ApplicationQueue> {
 const actor = await requireRole("admin");
 return serviceRpc<ApplicationQueue>("admin_applications", { p_actor: actor.id, p_role: role, p_bucket: bucket, p_offset: page * 50 });
}
